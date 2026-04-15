import OpenAI from "openai";
import type { TMDBShowResult } from "./tmdb";

export interface AIParsedMetadata {
  originalName: string;
  season: string;
  episode: string;
  isMainEpisode?: boolean;
  category?: "anime" | "tv" | "movie";
  reasoning?: string;
}

export interface TMDBSelectionResult {
  selectedIndex: number;
  reasoning: string;
}

/**
 * 从模型输出中健壮地提取 JSON。
 * 处理：纯 JSON、```json 代码块包裹、前后有杂文等情况。
 */
function extractJSON(text: string): any {
  // 1. 尝试直接解析
  try { return JSON.parse(text.trim()); } catch { }

  // 2. 提取 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch { }
  }

  // 3. 找到第一个 { 和最后一个 } 之间的内容
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch { }
  }

  return null;
}

// =============================================
// TMDB 智能择优
// =============================================

const TMDB_SYSTEM_PROMPT = `你是影视数据库匹配专家。从 TMDB 候选列表中为媒体文件选出最准确的条目。

规则（按优先级）：
1. 名称精确匹配优先。中文名、日文原名、罗马音拼写都可能指向同一作品（如"葬送的芙莉莲"="Sousou no Frieren"="葬送のフリーレン"）。
2. 区分本体与续作。动画不同季在 TMDB 可能是独立条目（"进击的巨人" vs "进击的巨人 Final Season"）。如果解析出的作品名明确包含季数信息，选对应条目；否则选系列最早/最基础的那个。
3. 区分 TV 与剧场版。如果文件名含"剧场版/Movie/映画"等标记，优先选电影条目；否则优先选 TV 条目。
4. 年份消歧。同名作品（如翻拍、重启版）通过首播年份区分。
5. 不确定时选第一个（TMDB 按相关度排序）。

仅返回 JSON: {"selectedIndex": <数字>, "reasoning": "<简洁中文判断依据>"}
不要输出任何其他内容。`;

export async function selectBestTMDBMatchWithAI(
  originalFilename: string,
  parsedShowName: string,
  candidates: TMDBShowResult[],
  apiKey: string,
  baseURL: string,
  modelName: string = "gpt-4o-mini"
): Promise<TMDBSelectionResult> {
  if (candidates.length <= 1) return { selectedIndex: 0, reasoning: "唯一候选，直接选定" };

  const openai = new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
  });

  const candidateList = candidates.map((c, i) => {
    const year = c.first_air_date ? c.first_air_date.substring(0, 4) : "?";
    return `${i}. "${c.name}" (${c.original_name}) ${year} - ${(c.overview || "").substring(0, 100)}`;
  }).join("\n");

  const userPrompt = `文件名: "${originalFilename}"
解析出的作品名: "${parsedShowName}"

候选(${candidates.length}条):
${candidateList}

selectedIndex 范围: 0-${candidates.length - 1}`;

  try {
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: TMDB_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return { selectedIndex: 0, reasoning: "模型返回为空，降级选择第一个" };

    const json = extractJSON(content);
    if (!json) return { selectedIndex: 0, reasoning: "无法解析模型输出为 JSON，降级选择第一个" };

    const idx = json.selectedIndex;
    const reasoning = json.reasoning || "";
    if (typeof idx === "number" && idx >= 0 && idx < candidates.length) {
      return { selectedIndex: idx, reasoning };
    }
    return { selectedIndex: 0, reasoning: reasoning || "返回索引无效，降级选择第一个" };
  } catch (error) {
    console.error("LLM TMDB selection failed, falling back to first result:", error);
    return { selectedIndex: 0, reasoning: "LLM 调用失败，降级选择第一个" };
  }
}

// =============================================
// 文件名批量解析
// =============================================

const PARSE_SYSTEM_PROMPT = `你是专业的动画/影视文件名解析引擎。你的任务是从文件名（可能附带文件夹路径）中精确提取结构化元数据。

## 输出字段

### 1. filename
与输入完全一致，逐字符匹配，禁止修改。

### 2. originalName（作品标题）
提取作品的核心标题，用于后续 TMDB 搜索。

**必须去除的内容：**
- 字幕组/压制组：[ANi], [Lilith-Raws], [DBD-Raws], [LoliHouse], [Nekomoe kissaten], [SubsPlease], [Erai-raws] 等方括号内发布组名称
- 技术标签：1080P, 4K, 720P, HEVC, AVC, x264, x265, AAC, FLAC, FLACx2, 10bit, BDRip, WEBRip, DVDRip
- 哈希值：如 [ABCD1234] 形式的短哈希

**多语种标题的优先级：** 日文原名 > 罗马音 > 中文名 > 英文名
（日文原名在 TMDB 命中率最高）

**关键场景：**
- 文件名形如 [字幕组][作品名][集数]... 时，第一个方括号通常是字幕组，第二个才是作品名
- 文件名只有数字（01.mkv）或只有集数标记（[05].sc.ass）时，必须从 folder 字段提取作品名
- 作品名中可能包含感叹号、问号等标点，需保留：如 "Bocchi the Rock!" 的 "!" 是标题的一部分

### 3. season（季数）
两位数字字符串（"01", "02", "03" ...）。

**检查来源（按优先级）：**
1. 文件名中的直接标记
2. folder 字段中的标记（很多PT下载文件名只有集数，季数仅在文件夹名中）

**识别模式：**
- 中文：第一季→01, 第二季→02, 第三季→03, 第2季→02
- 英文：S1→01, S02→02, Season 3→03
- 日文：2期→02, 2nd Season→02, III→03
- 标题含季数：如作品标题本身含 "Part 2"、"Final Season"、"続編" 等通常表示续作而不是具体季数，此时仍默认 "01"（因为 TMDB 中续作是独立条目）

**无任何季数线索时默认 "01"。**

### 4. episode（集数）
原样提取文件名中的集数编号，保留原始格式。

**常见格式：**
- [01], - 01, EP01, E01, 第01话, 第01話, #01 → 都提取为 "01"
- 07.5 → "07.5"（小数集数）
- OVA → "OVA"（保留特殊标记原文）

**注意事项：**
- 版本号 v2/v3 不是集数，忽略
- 分辨率数字(1080/720/4K) 不是集数，忽略
- 多集文件如 01-03 或 01~03，取起始集数 "01"
- FLAC/FLACx2 中的数字不是集数

### 5. isMainEpisode（是否正片）
判断依据是【内容类型】，与文件格式(.mkv/.ass/.srt/.mp4等)完全无关。

**核心原则：字幕文件和对应视频属于同一集内容，判定标准完全一致。**
例如：[01].mkv 是正片 → [01].tc.ass 也是正片。[OVA].mkv 不是正片 → [OVA].ass 也不是正片。

**标记为 false（非正片）的内容类型关键词：**
OVA, OAD, SP, Special, NCED, NCOP, Creditless, PV, CM, Menu, Preview, Extra, Bonus, 特典, 番外, 映像特典, 景深短篇(Depth of Field), 食谱(Recipe), 访谈(Interview)

**标记为 true（正片）：**
标准TV正篇剧集的任何关联文件（视频/字幕/音轨/章节文件均为正片）。

**BD/DVD 特殊情况：**
- [menu] 标签 → 菜单画面 → false（绝对不是正片）
- 纯数字编号 [01], [02] → 正片 → true

### 6. category（视频类型）
自动分类此影视文件：
- **anime**: 动漫番剧的**连续剧集**（有明确的集数编号如 [01], [02], EP01 等，是多集系列作品中的某一集）。
- **tv**: 真人电视剧、美剧、韩剧、国产剧的连续剧集（例如 S01E01，多季连续剧等特征）。
- **movie**: 电影、剧场版、OVA 单独发布的作品。**关键判断标准：**
  - 文件名含 "Movie", "剧场版", "映画", "劇場版", "the Movie" → 一定是 movie
  - **文件名没有集数编号（如 [01], EP01, E01 等），且是单独一个完整的视频文件** → 极大概率是 movie
  - 知名动漫剧场版如：你的名字、铃芽之旅、灌篮高手、鬼灭之刃剧场版、紫罗兰永恒花园剧场版等 → movie
  - 即使有字幕组标签（如 [Nekomoe kissaten]），也不影响判断：字幕组发布的单文件无集数编号的作品就是 movie
  - BDRip/BDRemux 单文件无集数 → 极大概率是 movie

⚠️ 特别注意：**不要因为是日本动画就默认归为 anime！**
anime 仅用于"多集连续更新的番剧中的某一集"。动漫电影/剧场版必须归为 movie。

### 7. reasoning（推理依据）
简洁中文，说明提取各字段的依据。当从 folder 提取了信息时，必须明确说明。

## 强制约束
- 输入 N 个文件，必须输出 N 个结果，严禁遗漏或合并。
- 文件名后缀如 .tc.ass / .sc.ass / .jpn.ass / .chs.srt 中的语言标记(tc/sc/jpn/chs)不影响任何字段的判断。

仅返回JSON: {"results":[{"filename":"...","originalName":"...","season":"01","episode":"01","isMainEpisode":true,"category":"anime","reasoning":"..."}]}
不要输出任何其他内容。`;

export async function parseFilenameWithAI(
  filename: string,
  apiKey: string,
  baseURL: string,
  modelName: string = "gpt-4o-mini"
): Promise<AIParsedMetadata | null> {
  const map = await parseFilenamesBatchWithAI([filename], apiKey, baseURL, modelName);
  return map?.[filename] || null;
}

export async function parseFilenamesBatchWithAI(
  filenames: string[],
  apiKey: string,
  baseURL: string,
  modelName: string = "gpt-4o-mini",
  onStream?: (chunkedText: string, fullAggregated: string) => void,
  folderHints?: string[]
): Promise<Record<string, AIParsedMetadata> | null> {
  if (filenames.length === 0) return {};

  const openai = new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
  });

  // 构建包含文件夹上下文的输入数据
  const inputData = filenames.map((f, i) => {
    const entry: { filename: string; folder?: string } = { filename: f };
    if (folderHints && folderHints[i]) {
      entry.folder = folderHints[i];
    }
    return entry;
  });

  try {
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: PARSE_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(inputData) }
      ],
      temperature: 1,
      max_tokens: 16384,
      stream: true,
    });

    let fullText = "";
    for await (const chunk of response) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) {
        fullText += text;
        if (onStream) onStream(text, fullText);
      }
    }

    if (!fullText) return null;

    const json = extractJSON(fullText);
    if (!json) {
      console.error("[LLM] JSON提取失败，模型原始返回（前500字符）:", fullText.substring(0, 500));
      console.error("[LLM] 原始返回长度:", fullText.length, "字符");
      return null;
    }
    if (!json.results || !Array.isArray(json.results)) {
      console.error("[LLM] JSON有效但缺少results数组，解析到的对象:", JSON.stringify(json).substring(0, 300));
      return null;
    }

    const map: Record<string, AIParsedMetadata> = {};
    if (Array.isArray(json.results)) {
      for (const item of json.results) {
        if (item.filename) {
          map[item.filename] = {
            originalName: item.originalName,
            season: item.season,
            episode: item.episode,
            isMainEpisode: item.isMainEpisode,
            category: item.category || "anime", // 降级为 anime
            reasoning: item.reasoning || undefined
          };
        }
      }
    }
    return map;
  } catch (error: any) {
    console.error("[LLM] AI Batch Parsing 异常:", error?.message || error);
    if (error?.status) console.error("[LLM] HTTP状态码:", error.status);
    return null;
  }
}
