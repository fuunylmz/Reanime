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

// ====== 全局并发锁 ======
const scanLockG = globalThis as unknown as { __scanLock: boolean };
if (scanLockG.__scanLock === undefined) scanLockG.__scanLock = false;

// ====== 递归扫描子目录 ======
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
      // 跳过无权限访问的目录
    }
  }

  await walk(baseDir);
  return results;
}

/**
 * 将文件列表按顶层子文件夹分组
 * 例如扫描 /番剧/ 目录时：
 *   /番剧/[DBD-Raws][少女与战车].../01.mkv → 分到 "[DBD-Raws][少女与战车]..." 组
 *   /番剧/[DBD-Raws][少女与战车].../PV/pv.mkv → 也分到同一组
 *   /番剧/[VCB-Studio] Gakkou.../01.mkv → 分到另一组
 * 如果文件直接在扫描根目录下（没有子文件夹），则归入 "_root_" 组
 */
function groupFilesByShow(scanDir: string, files: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const filePath of files) {
    const rel = path.relative(scanDir, filePath);
    const parts = rel.split(path.sep).filter(p => p && p !== '.');

    // 如果文件在子目录里，用第一级子目录名分组；否则用 _root_
    const groupKey = parts.length > 1 ? parts[0] : "_root_";

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(filePath);
  }

  return groups;
}

export async function POST(request: Request) {
  const config = await getAllSettings();

  try {
    const body = await request.json().catch(() => ({}));
    const scanDir = body.customDir || config.sourceDir;

    const missing = [];
    if (!scanDir) missing.push("扫描根目录");
    if (!config.targetDir) missing.push("目标总归档目录");
    if (!config.openaiKey) missing.push("大模型 API Key");
    if (!config.tmdbKey) missing.push("TMDB API Key");

    if (missing.length > 0) {
      return NextResponse.json({ success: false, error: `系统配置未完善，缺失核心配置项：${missing.join(', ')}。请前往系统设置补全。` }, { status: 400 });
    }

    // ====== 并发锁检查 ======
    if (scanLockG.__scanLock) {
      return NextResponse.json(
        { success: false, error: "已有扫描任务正在执行中，请等待当前批次完成后再试。" },
        { status: 409 }
      );
    }

    // 递归收集所有媒体文件
    const mediaFilePaths = await collectMediaFiles(scanDir);

    if (mediaFilePaths.length === 0) {
       return NextResponse.json({ success: true, message: "此目录及其子目录内没有发现待处理的媒体文件。" });
    }

    // 锁定扫描状态
    scanLockG.__scanLock = true;

    // ====== 预先剔除已处理过的文件 ======
    const validFilesToProcess: string[] = [];
    for (const filePath of mediaFilePaths) {
      const existing = await prisma.processLog.findFirst({ where: { originalPath: filePath, status: "SUCCESS" } });
      if (!existing) validFilesToProcess.push(filePath);
    }

    if (validFilesToProcess.length === 0) {
       scanLockG.__scanLock = false;
       return NextResponse.json({ success: true, message: "此目录下所有媒体文件均已处理过，无需重复操作。" });
    }

    // ====== 按顶层子文件夹分组（一部番 = 一个处理单元） ======
    const showGroups = groupFilesByShow(scanDir, validFilesToProcess);
    const showGroupEntries = Array.from(showGroups.entries());
    const totalShows = showGroupEntries.length;

    // ====== 内存控制 ======
    evictOldTasks();

    // ====== 后台按番剧逐个处理 ======
    Promise.resolve().then(async () => {
      try {
        const taskIds: Record<string, string> = {};
        const BATCH_SIZE = 50;

        // 先为所有文件创建任务条目
        for (const [groupKey, files] of showGroupEntries) {
          const groupPath = groupKey === "_root_" ? scanDir : path.join(scanDir, groupKey);
          for (const filePath of files) {
            const filename = path.basename(filePath);
            const taskId = crypto.randomUUID();
            taskIds[filePath] = taskId;
            taskManager.set(taskId, {
               id: taskId,
               fileName: filename,
               fullPath: filePath,
               groupName: groupPath,
               status: "pending",
               currentStep: "已挂起至批次队列",
               progress: 5,
               logs: [{ time: Date.now(), level: "info", message: "系统唤醒准备启动列阵" }],
               startTime: Date.now()
            });
          }
        }

        // 逐个番剧组处理
        for (let showIdx = 0; showIdx < showGroupEntries.length; showIdx++) {
          const [groupKey, showFiles] = showGroupEntries[showIdx];
          const showLabel = groupKey === "_root_" ? "根目录散落文件" : groupKey;

          // 广播告知后续番剧组的任务它们在等待
          for (let futureIdx = showIdx + 1; futureIdx < showGroupEntries.length; futureIdx++) {
            const [, futureFiles] = showGroupEntries[futureIdx];
            for (const pf of futureFiles) {
              if (taskIds[pf]) {
                updateTask(taskIds[pf], { currentStep: `排队等候中 (正在处理: ${showLabel}, ${showIdx + 1}/${totalShows})` });
              }
            }
          }

          // 标记当前番剧组所有文件进入处理状态
          for (const filePath of showFiles) {
            updateTask(taskIds[filePath], { 
              status: "processing", 
              currentStep: `正在处理番组 [${showLabel}] (${showIdx + 1}/${totalShows})`, 
              progress: 10 
            });
            addLog(taskIds[filePath], `📺 当前处理番组: "${showLabel}" (${showIdx + 1}/${totalShows}，本组共 ${showFiles.length} 个文件)`, "info");
          }

          // 本番剧组内部按 BATCH_SIZE 分块（大多数番只有十几个文件，不需要分块）
          const tmdbCache = new Map<string, any>();
          const totalChunks = Math.ceil(showFiles.length / BATCH_SIZE);

          for (let i = 0; i < showFiles.length; i += BATCH_SIZE) {
            const chunkIdx = Math.floor(i / BATCH_SIZE) + 1;
            const chunk = showFiles.slice(i, i + BATCH_SIZE);

            // 构建 LLM 输入
            const chunkBasenames: string[] = [];
            const chunkFolderHints: string[] = [];
            for (const filePath of chunk) {
              const basename = path.basename(filePath);
              chunkBasenames.push(basename);
              const relativePath = path.relative(scanDir, filePath);
              const parentParts = path.dirname(relativePath).split(path.sep).filter(p => p && p !== '.');
              chunkFolderHints.push(parentParts.join(' / '));
              updateTask(taskIds[filePath], { 
                status: "processing", 
                currentStep: totalChunks > 1 
                  ? `请求 LLM 推理中 [${showLabel}] 批次 ${chunkIdx}/${totalChunks}` 
                  : `请求 LLM 推理中 [${showLabel}]`, 
                progress: 20 
              });
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
                  if (chunk.length > 0) {
                     updateTask(taskIds[chunk[0]], { streamData: aggregated });
                  }
               },
               chunkFolderHints
            );

            // 清除流数据
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

            // 逐个文件入库与硬链接
            for (const filePath of chunk) {
               const taskId = taskIds[filePath];
               const filename = path.basename(filePath);
               const taskState = taskManager.get(taskId);
               const taskStartTime = taskState?.startTime || Date.now();

               try {
                 const parsed = batchResults[filename];
                 if (!parsed) {
                    throw new Error("模型漏字：未能从 LLM 返回合包中找到属于该文件的推理对象。");
                 }

                 addLog(taskId, `大语言模型返回原生 Payload: ${JSON.stringify(parsed)}`, "info");
                 if (parsed.reasoning) {
                   addLog(taskId, `💭 文件解析思维链: ${parsed.reasoning}`, "info");
                 }

                 if (parsed.isMainEpisode === false) {
                    addLog(taskId, `LLM 已将该文件判定为非正片，系统自动跳过`, "warn");
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

                 addLog(taskId, `LLM 推理剥离成功：[剧名="${parsed.originalName}", 第${parsed.season}季-第${parsed.episode}集, 类型=${parsed.category}]`, "success");

                 const result = await processFile(
                   filePath,
                   {
                     targetDir: config.targetDir,
                     targetDirAnime: config.targetDirAnime || undefined,
                     targetDirTV: config.targetDirTV || undefined,
                     targetDirMovie: config.targetDirMovie || undefined,
                   },
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
                 addLog(taskId, `节点流转完结并入库防重 (总耗时 ${((Date.now() - taskStartTime)/1000).toFixed(1)}s)`, "success");
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
        }
      } finally {
        scanLockG.__scanLock = false;
      }
    }).catch((err) => {
      console.error("后台扫描任务发生致命错误:", err);
      scanLockG.__scanLock = false;
    });

    const skippedCount = mediaFilePaths.length - validFilesToProcess.length;
    return NextResponse.json({
      success: true,
      message: `发现 ${mediaFilePaths.length} 个媒体文件，其中 ${validFilesToProcess.length} 个待处理（分为 ${totalShows} 个番组逐个处理）${skippedCount > 0 ? `，已跳过 ${skippedCount} 个已完成文件` : ""}。`
    });
  } catch (error: any) {
    scanLockG.__scanLock = false;
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
