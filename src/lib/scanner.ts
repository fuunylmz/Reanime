import fs from "fs/promises";
import path from "path";
import { searchTMDBMultiple } from "./tmdb";
import { selectBestTMDBMatchWithAI, AIParsedMetadata } from "./llm";
import { updateTask, addLog } from "./queue";

export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export async function processFile(
  originalFilePath: string,
  targetBaseDir: string,
  parsed: AIParsedMetadata,
  tmdbKey: string,
  taskId: string,
  tmdbCache: Map<string, any>,
  llmConfig: LLMConfig
) {
  const filename = path.basename(originalFilePath);

  // 1. TMDB Search with Centralized Node Cache + LLM 智能择优
  let tmdbResult = tmdbCache.get(parsed.originalName);
  if (!tmdbResult) {
    updateTask(taskId, { currentStep: "TMDB 数据检索", progress: 35 });
    addLog(taskId, `首个特征实体，正在通过 TMDB 网络查询：${parsed.originalName} ...`);

    const candidates = await searchTMDBMultiple(parsed.originalName, tmdbKey);

    if (candidates.length === 0) {
      throw new Error(`无法在 TMDB 词库中匹配到名为 "${parsed.originalName}" 的影视剧集`);
    }

    if (candidates.length === 1) {
      // 唯一结果，直接使用
      tmdbResult = candidates[0];
      addLog(taskId, `TMDB 精准命中唯一结果："${tmdbResult.name}" (ID: ${tmdbResult.id})`, "success");
    } else {
      // 多个候选结果，交给 LLM 智能选择
      addLog(taskId, `TMDB 返回 ${candidates.length} 个候选结果，正在请求 LLM 进行智能择优...`);
      updateTask(taskId, { currentStep: "LLM TMDB 智能择优", progress: 45 });

      const candidateSummary = candidates.map((c, i) =>
        `  [${i}] "${c.name}" (${c.original_name}) - ${c.first_air_date?.substring(0, 4) || "?"}`
      ).join("\n");
      addLog(taskId, `候选列表:\n${candidateSummary}`);

      const { selectedIndex, reasoning: tmdbReasoning } = await selectBestTMDBMatchWithAI(
        filename,
        parsed.originalName,
        candidates,
        llmConfig.apiKey,
        llmConfig.baseURL,
        llmConfig.model
      );

      tmdbResult = candidates[selectedIndex];
      addLog(
        taskId,
        `LLM 从 ${candidates.length} 个候选中择优选定 [${selectedIndex}]："${tmdbResult.name}" (原名: ${tmdbResult.original_name}, ID: ${tmdbResult.id})`,
        "success"
      );
      if (tmdbReasoning) {
        addLog(taskId, `💭 TMDB 择优思维链: ${tmdbReasoning}`, "info");
      }
    }

    tmdbCache.set(parsed.originalName, tmdbResult);
    addLog(taskId, `已写入本地 TMDB 热缓存`, "info");
  } else {
    updateTask(taskId, { currentStep: "命中 TMDB 缓存块", progress: 40 });
    addLog(taskId, `命中本地 TMDB 同名热缓存，直接复用翻译结果："${tmdbResult.name}"`, "info");
  }

  // ====== TMDB 二次校验：用 TMDB 的 media_type 纠正 LLM 可能的分类错误 ======
  if (tmdbResult.media_type === "movie" && parsed.category !== "movie") {
    addLog(taskId, `⚠️ TMDB 交叉验证发现分类偏差：LLM 判定为 "${parsed.category}"，但 TMDB 确认此作品实际为「电影/剧场版」，已自动纠正为 movie`, "warn");
    parsed.category = "movie";
  }

  updateTask(taskId, { currentStep: "构建挂载节点", progress: 70 });

  // 2. Construct Emby-friendly Path
  const year = tmdbResult.first_air_date ? tmdbResult.first_air_date.substring(0, 4) : "Unknown";
  const showFolderName = `${tmdbResult.name} (${year})`;
  const seasonFolderName = `Season ${parsed.season}`;
  const ext = path.extname(filename).toLowerCase();

  let targetFilename = `S${parsed.season}E${parsed.episode}${ext}`;
  let targetPath = path.join(targetBaseDir, showFolderName, seasonFolderName, targetFilename);

  // 对于电影，采用特定的命名和文件夹结构： 目标文件夹/电影名 (年份)/电影名 (年份).ext
  if (parsed.category === "movie") {
     targetFilename = `${tmdbResult.name} (${year})${ext}`;
     targetPath = path.join(targetBaseDir, showFolderName, targetFilename);
     addLog(taskId, `智能识别到类型为 [电影/剧场版]，切换至单文件归档策略: ${targetFilename}`, "info");
  }

  // 解决 SC/TC 分层多语言字幕标识的冲突问题 
  if ([".ass", ".srt", ".vtt"].includes(ext)) {
    const subMatch = filename.match(/\.([a-zA-Z0-9_-]+)\.(ass|srt|vtt)$/i);
    if (subMatch && subMatch[1] && subMatch[1].length <= 10) {
      if (parsed.category === "movie") {
         targetFilename = `${tmdbResult.name} (${year}).${subMatch[1]}${ext}`;
         targetPath = path.join(targetBaseDir, showFolderName, targetFilename);
      } else {
         targetFilename = `S${parsed.season}E${parsed.episode}.${subMatch[1]}${ext}`;
         targetPath = path.join(targetBaseDir, showFolderName, seasonFolderName, targetFilename);
      }
      addLog(taskId, `智能识别到语言特征块 '.${subMatch[1]}', 已直接混入最终挂载名中以避免覆盖`);
    }
  }

  // 3. Create Directories
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  updateTask(taskId, { currentStep: "注入文件映射", progress: 85 });

  // 4. Node File System Link/Copy Core
  const linkOrCopy = async (src: string, dest: string, isRetry: boolean = false) => {
    try {
      await fs.link(src, dest);
      addLog(taskId, isRetry ? `创建硬链接成功 (避让了覆盖，已重命名为 ${path.basename(dest)})` : "硬链接转移执行完毕", "success");
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        throw err;
      }
      if (err.code === 'EXDEV') {
        addLog(taskId, "遇到系统级跨盘移动阻拦，退化为物理文件复制...", "warn");
        await fs.copyFile(src, dest);
        addLog(taskId, isRetry ? `物理复制完成 (避让了覆盖，已重命名为 ${path.basename(dest)})` : "物理复制完成并验证", "success");
      } else {
        throw err;
      }
    }
  };

  try {
    await linkOrCopy(originalFilePath, targetPath);
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      addLog(taskId, "警告：系统抛出目标映射冲突 (EEXIST)，开启安全重命名避让法...", "warn");
      let counter = 1;
      const MAX_RETRIES = 50;
      while (counter <= MAX_RETRIES) {
        const safeExt = ext.replace('.', '\\.');
        const regexStr = `(\\.[a-zA-Z0-9_-]+)?${safeExt}$`;
        const retryFilename = targetFilename.replace(new RegExp(regexStr, 'i'), `_${counter}$&`);
        targetPath = path.join(targetBaseDir, showFolderName, seasonFolderName, retryFilename);

        try {
          await linkOrCopy(originalFilePath, targetPath, true);
          break;
        } catch (retryErr: any) {
          if (retryErr.code === 'EEXIST') {
            counter++;
            continue;
          }
          throw retryErr;
        }
      }
      if (counter > MAX_RETRIES) {
        throw new Error(`EEXIST 重命名避让超过最大重试次数 (${MAX_RETRIES})，放弃处理。`);
      }
    } else {
      throw err;
    }
  }

  addLog(taskId, `文件成功触达实体锚点: ${targetPath}`);
  updateTask(taskId, { currentStep: "处理圆满闭环", progress: 100 });
  return { targetPath, tmdbResult };
}
