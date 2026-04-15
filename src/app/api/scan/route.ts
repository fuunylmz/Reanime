import { NextResponse } from "next/server";
import { getAllSettings } from "@/lib/settings";
import { processFile } from "@/lib/scanner";
import { prisma } from "@/lib/db";
import { taskManager, updateTask, addLog, evictOldTasks } from "@/lib/queue";
import { parseFilenamesBatchWithAI } from "@/lib/llm";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const VIDEO_EXTENSIONS = [".mkv", ".mp4", ".avi", ".rmvb"];
const SUB_EXTENSIONS = [".ass", ".srt", ".vtt"];

// ====== 修复 #5: 全局并发锁 ======
const scanLockG = globalThis as unknown as { __scanLock: boolean };
if (scanLockG.__scanLock === undefined) scanLockG.__scanLock = false;

// ====== 修复 #1: 递归扫描子目录 ======
async function collectMediaFiles(baseDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (VIDEO_EXTENSIONS.includes(ext) || SUB_EXTENSIONS.includes(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // 跳过无权限访问的目录（如 System Volume Information 等）
    }
  }

  await walk(baseDir);
  return results;
}

export async function POST(request: Request) {
  const config = await getAllSettings();

  try {
    const body = await request.json().catch(() => ({}));
    const scanDir = body.customDir || config.sourceDir;

    if (!scanDir || !config.targetDir || !config.openaiKey || !config.tmdbKey) {
      return NextResponse.json({ success: false, error: "系统配置未完善或缺少扫描目录。" }, { status: 400 });
    }

    // ====== 修复 #5: 并发锁检查 ======
    if (scanLockG.__scanLock) {
      return NextResponse.json(
        { success: false, error: "已有扫描任务正在执行中，请等待当前批次完成后再试。" },
        { status: 409 }
      );
    }

    // 递归收集所有媒体文件（修复 #1）
    const mediaFilePaths = await collectMediaFiles(scanDir);

    if (mediaFilePaths.length === 0) {
       return NextResponse.json({ success: true, message: "此目录及其子目录内没有发现待处理的媒体文件。" });
    }

    // 锁定扫描状态
    scanLockG.__scanLock = true;

    // ====== 修复 #2: 内存控制 - 在创建新任务前淘汰旧任务 ======
    evictOldTasks();

    // ====== 修复 #3: 后台 Promise 添加顶层 catch + finally 释放锁 ======
    Promise.resolve().then(async () => {
      try {
        const taskIds: Record<string, string> = {};
        const validFilesToProcess: string[] = [];

        for (const filePath of mediaFilePaths) {
          const filename = path.basename(filePath);
          // Check DB for skips (Already successfully matched files are fully skipped)
          const existing = await prisma.processLog.findFirst({ where: { originalPath: filePath, status: "SUCCESS" } });
          if (existing) continue;

          const taskId = crypto.randomUUID();
          taskIds[filePath] = taskId;
          taskManager.set(taskId, {
             id: taskId,
             fileName: filename,
             fullPath: filePath,
             status: "pending",
             currentStep: "已挂起至批次队列",
             progress: 5,
             logs: [{ time: Date.now(), level: "info", message: "系统唤醒准备启动列阵" }],
             startTime: Date.now()
          });
          validFilesToProcess.push(filePath);
        }

        const BATCH_SIZE = 50;
        const totalChunks = Math.ceil(validFilesToProcess.length / BATCH_SIZE);
        const tmdbCache = new Map<string, any>();

        for (let i = 0; i < validFilesToProcess.length; i += BATCH_SIZE) {
           const currentChunkIndex = Math.floor(i / BATCH_SIZE) + 1;
           const chunk = validFilesToProcess.slice(i, i + BATCH_SIZE);

           // 1. 广播告知后续排队的任务它们在等待
           const pendingFiles = validFilesToProcess.slice(i + BATCH_SIZE);
           for (const pf of pendingFiles) {
              updateTask(taskIds[pf], { currentStep: `排队等候中 (前方正在处理第 ${currentChunkIndex}/${totalChunks} 批次)` });
           }

           // 2. 将当前分块的任务立刻标注为推算中
           const chunkBasenames: string[] = [];
           const chunkFolderHints: string[] = [];
           for (const filePath of chunk) {
             const basename = path.basename(filePath);
             chunkBasenames.push(basename);
             // 提取文件相对于扫描根目录的父文件夹路径作为上下文
             const relativePath = path.relative(scanDir, filePath);
             const parentParts = path.dirname(relativePath).split(path.sep).filter(p => p && p !== '.');
             chunkFolderHints.push(parentParts.join(' / '));
             updateTask(taskIds[filePath], { status: "processing", currentStep: `请求 LLM 大规模推理中 (批次 ${currentChunkIndex}/${totalChunks})`, progress: 20 });
             addLog(taskIds[filePath], `[分列调度] 已打包发送至大模型，正在等待远端文字特征解析...`, "info");
           }
           
           let lastRawOutput = "";
           const batchResults = await parseFilenamesBatchWithAI(
              chunkBasenames, 
              config.openaiKey, 
              config.openaiBaseURL, 
              config.openaiModel,
              (newChunk, aggregated) => {
                 lastRawOutput = aggregated;
                 for (const filePath of chunk) {
                   updateTask(taskIds[filePath], { streamData: aggregated });
                 }
              },
              chunkFolderHints
           );
           
           // 结束流状态后清除残余展示
           for (const filePath of chunk) {
              updateTask(taskIds[filePath], { streamData: undefined });
           }
           
           if (!batchResults) {
              for (const filePath of chunk) {
                 updateTask(taskIds[filePath], { status: "error", currentStep: "大模型返回解析失败" });
                 addLog(taskIds[filePath], "核心失败：批量 AI 解析返回了无法解析的格式", "error");
                 if (lastRawOutput) {
                   addLog(taskIds[filePath], `模型原始返回（前200字符）: ${lastRawOutput.substring(0, 200)}`, "error");
                 } else {
                   addLog(taskIds[filePath], "模型返回为空（可能是网络超时或 API 报错）", "error");
                 }
              }
              continue;
           }

           // 3. 结果一旦返回，立刻将当前块进行入库与硬链接
           for (const filePath of chunk) {
              const taskId = taskIds[filePath];
              const filename = path.basename(filePath);
              const taskState = taskManager.get(taskId);
              
              try {
                const parsed = batchResults[filename];
                if (!parsed) {
                   throw new Error("模型漏字：未能从 LLM 返回合包中找到属于该文件的推理对象，判断引发遗忘幻觉。");
                }

                addLog(taskId, `大语言模型返回原生 Payload: ${JSON.stringify(parsed)}`, "info");
                if (parsed.reasoning) {
                  addLog(taskId, `💭 文件解析思维链: ${parsed.reasoning}`, "info");
                }
                
                if (parsed.isMainEpisode === false) {
                   addLog(taskId, `LLM 已将该文件判定为非正片（如OVA/特典/SP等），系统自动触发跳过机制，此文件不会污染媒体库！`, "warn");
                   await prisma.processLog.create({
                      data: {
                        originalName: filename,
                        originalPath: filePath,
                        targetPath: "IGNORED (已跳过非正片)",
                        tmdbId: 0,
                        tmdbName: "不适用",
                        status: "SUCCESS"
                      }
                   });
                   updateTask(taskId, { status: "success", currentStep: "过滤机制跳过", progress: 100, endTime: Date.now() });
                   continue;
                }

                addLog(taskId, `LLM 推理剥离成功：精准确认 [剧名="${parsed.originalName}", 第${parsed.season}季-第${parsed.episode}集]`, "success");

                let finalTargetDir = config.targetDir;
                if (parsed.category === "anime" && config.targetDirAnime) finalTargetDir = config.targetDirAnime;
                if (parsed.category === "tv" && config.targetDirTV) finalTargetDir = config.targetDirTV;
                if (parsed.category === "movie" && config.targetDirMovie) finalTargetDir = config.targetDirMovie;

                const result = await processFile(
                  filePath,
                  finalTargetDir,
                  parsed,
                  config.tmdbKey,
                  taskId,
                  tmdbCache,
                  { apiKey: config.openaiKey, baseURL: config.openaiBaseURL, model: config.openaiModel }
                );

                await prisma.processLog.create({
                  data: {
                    originalName: filename,
                    originalPath: filePath,
                    targetPath: result.targetPath,
                    tmdbId: result.tmdbResult.id,
                    tmdbName: result.tmdbResult.name,
                    status: "SUCCESS"
                  }
                });

                updateTask(taskId, { status: "success", currentStep: "数据库挂载落库", progress: 100, endTime: Date.now() });
                addLog(taskId, `此独立节点流转完结并永远入库防重 (总耗时 ${((Date.now() - taskState!.startTime)/1000).toFixed(1)}s)`, "success");
              } catch (err: any) {
                await prisma.processLog.create({
                  data: {
                    originalName: filename,
                    originalPath: filePath,
                    status: "FAILED",
                    errorMessage: err.message
                  }
                });
                updateTask(taskId, { status: "error", currentStep: "触发容错异常迫降", endTime: Date.now() });
                addLog(taskId, `防御机制迫降: ${err.message}`, "error");
              }
           }
        }
      } finally {
        // ====== 修复 #5: 无论成功失败，都释放并发锁 ======
        scanLockG.__scanLock = false;
      }
    }).catch((err) => {
      // ====== 修复 #3: 捕获未预期的顶层异常，防止 unhandled rejection 导致进程崩溃 ======
      console.error("后台扫描任务发生致命错误:", err);
      scanLockG.__scanLock = false;
    });

    return NextResponse.json({ success: true, message: `成功捕获 ${mediaFilePaths.length} 个待定媒体文件（含子目录），已发配至处理管道。` });
  } catch (error: any) {
    scanLockG.__scanLock = false;
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
