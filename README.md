# Reanime

Reanime 是一个现代化的、完全自动化的媒体整理与刮削工具。它利用先进的大语言模型（LLM）通过智能推理解析复杂的影视文件名（尤其是番剧、压制组作品等不规则命名），配合 TMDB 接口，将杂乱的下载文件自动梳理、重命名并归档至完美的媒体中心格式（Emby/Jellyfin/Plex 友好）。

![Reanime Interface Preview](#) *(你可以在此补充一张你的产品截图)*

## ✨ 核心特征

- 🧠 **LLM 级智能解析**：全面抛弃传统的死板正则表达式，使用大语言模型（如 GPT-4 / 集成第三方中转 API）“理解”资源名称，精准拆分出**原名**、**季数**、**集数**。
- 🎬 **精准防重与特殊分类**：智能识别菜单(`Menu`)、预告片(`PV`) 以及特典等非正片内容，剔除干扰，并在遇到 SC/TC 等多语言字幕格式时进行智能合并重命名。
- 📦 **自动架构分发**：根据 AI 对片源源属性的类型判断（`动漫(Anime)` / `电视剧(TV)` / `电影(Movie)`），自动将你的影片转移/硬链接分发至对应的分类库内，免去人工移动的烦恼。
- 🖼️ **影视媒体海报墙 (档案库)**：内建“媒体档案”可视化页面。当文件被处理并成功寻找到匹配的 TMDB 结构后，可以在前端查看这部分已完美归档的本地全息海报墙和中日双语介绍。
- ⚡ **海量并发批次处理**：后台任务队列支持将扫描内容按批次（最高 50 件）打包投递，并且拥有实时可视化长滚动动画框，呈现 AI 在那一刻打字的推理心流。
- 🌙 **Modern Dark Web UI**：采用基于 Next.js 14、Tailwind CSS + shadcn/ui 的全套极客暗黑风响应式控制面板设计。

## 🚀 极速上手

### 环境要求
- **Node.js** 18+ 或更高版本
- **npm** (或者 yarn / pnpm)
- 一个有效的 LLM API Keys (例如官方 OpenAI / 国内的兼容服务商接口)
- 申请好的 TMDB API Key

### 安装与运行 (开发环境)

1. **克隆项目到本地**
   ```bash
   git clone https://github.com/fuunylmz/Reanime.git
   cd Reanime
   ```

2. **安装依赖环境**
   ```bash
   npm install
   ```

3. **初始化数据库 (SQLite)**
   本项目使用 `Prisma` + `SQLite` 轻量级管理数据。
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **启动开发服务器**
   ```bash
   npm run dev
   ```

### 生产环境部署 (推荐使用 PM2)

若要在服务器长期挂机稳定运行，建议使用 PM2 守护进程：

1. 全局安装 pm2 (如已安装可跳过)
   ```bash
   npm install -g pm2
   ```
2. 构建生产优化版本
   ```bash
   npm run build
   ```
3. 一键启动守护进程
   ```bash
   pm2 start ecosystem.config.js
   ```

*(如需查看后台运行日志，输入 `pm2 logs reanime`；如需开机自启，输入 `pm2 startup` 后按提示操作。)*

### 快速配置
   - 在浏览器中访问：`http://localhost:3000`
   - 首先前往系统左侧 **[系统设置]** 配置你的：
     - `TMDB API Key`
     - `大模型 API Key`（以及请求的基础中转 URL 和选用的模型名称）
     - `全局监控目录 (原始下载源)`
     - `各分类目标端目录 (自动分发去向)`

## 🎯 目录分发说明

程序在请求一次分析后，将自动按以下机制进行构建建档：

- **Movies (电影)**：识别为电影后，采用 `目标文件夹/电影名 (年份)/电影名 (年份).mkv` 原生电影规范布局，不新建任何 Season 层。
- **TV / Anime (剧集)**：按照标准的 `剧名 (年份)/Season XX/SXXEXX.mkv` 季层编排结构自动嵌套存放。如果你绑定了字幕，后缀标识均会得到完美保留并跟随主文件。

## 🛠️ 技术栈清单

- **框架**: Next.js 14 (App Router)
- **样式**: Tailwind CSS
- **组件库**: shadcn/ui (Radix UI)
- **后端/ORM**: Node.js fs 模块, Prisma (SQLite)
- **外联 API**: TheMovieDB (TMDB), LLM Completions (OpenAI Compatible)

---

**版权所有 & 开源许可**

本项目由 [fuunylmz](https://github.com/fuunylmz) 创建并维护。允许大家在此基础上探索更多个人多媒体资料中心自动化的无限可能。
