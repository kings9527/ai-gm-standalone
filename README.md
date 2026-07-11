# AI-GM Standalone

> AI 驱动的视觉小说 RPG 桌面应用 —— 让 AI 成为你的游戏主持人 🎲🤖

[<img src="https://img.shields.io/badge/version-1.0.0-blue">](https://github.com/aigm-project/ai-gm-standalone/releases) [<img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey">](#安装) [<img src="https://img.shields.io/badge/license-MIT-green">](LICENSE)

---

## 📖 简介

**AI-GM Standalone** 是一款基于 Electron 的桌面应用，将 AI 大语言模型（LLM）与视觉小说引擎相结合，让你能够：

- 📝 **写故事** → 粘贴文本，AI 自动生成可游玩的模组
- 🎨 **分析风格** → AI 提取故事的视觉风格，生成主题配置
- 🎮 **玩游戏** → 沉浸式的视觉小说体验，支持回合制战斗
- 🖼️ **生成图片** → AI 自动生成场景背景和角色立绘
- 🤝 **分享模组** → 导入/导出 JSON 格式模组，与朋友分享

无论是克苏鲁跑团（COC）、龙与地下城（D&D），还是自定义规则系统，AI-GM 都能帮你快速构建和运行桌面 RPG 体验。

> **截图**: 见 `docs/screenshots/app-overview-hero.png` — 主界面 + 游戏界面 + 战斗界面三拼图展示（需在运行应用后截取）

---

## ✨ 功能列表

### 🎮 核心玩法
- 视觉小说引擎（背景层 + 立绘层 + 对话层 + 特效层）
- 分支剧情与多重结局
- 回合制战斗系统（COC d100 规则）
- 角色属性、背包、SAN 值管理
- 事件触发与条件判断系统

### 🤖 AI 能力
- 支持 OpenAI (GPT-4o)、Claude (3.5 Sonnet)、Ollama 本地模型
- AI 模组生成器：文本 → 完整可玩模组
- AI 风格分析器：提取故事的视觉风格
- AI 图片生成：DALL-E 3 自动生成场景和角色图
- 流式对话响应，实时显示 AI 回复

### 🛠️ 内容创作
- 模组导入/导出（JSON 格式）
- 风格模板保存与复用
- 图片资源管理（搜索、生成、上传）
- 支持 COC、D&D 5e 和自定义规则系统

### 💾 数据管理
- 多槽位手动存档/读档
- 自动存档（场景切换、战斗开始时）
- 存档缩略图与完整状态保存
- 本地 SQLite 数据库，无需联网即可游玩

### 🎨 自定义
- 深色/浅色/自动主题切换
- 打字机速度、字体大小调整
- 自定义 CSS 变量（高级）
- 战斗技能扩展（代码级自定义）

### 🖥️ 桌面集成
- Windows / macOS / Linux 三平台支持
- 自动更新（GitHub Releases）
- 安全 IPC 通信（API Key 永不暴露给前端）
- 应用内菜单（暂停、存档、设置、退出）

---

## 📥 安装

### 快速下载

访问 [Releases 页面](https://github.com/aigm-project/ai-gm-standalone/releases) 下载对应平台的安装包：

| 平台 | 安装包 | 说明 |
|------|--------|------|
| **Windows** | `.exe` (NSIS) | 推荐，含安装向导 |
| **Windows** | `.exe` (Portable) | 免安装，解压即用 |
| **macOS** | `.dmg` | 拖拽到应用程序文件夹 |
| **macOS** | `.zip` | 压缩包，手动解压 |
| **Linux** | `.AppImage` | 推荐，无需安装 |
| **Linux** | `.deb` | Debian/Ubuntu 系 |

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/aigm-project/ai-gm-standalone.git
cd ai-gm-standalone

# 安装依赖
npm install

# 开发模式（启动 Vite + Express + Electron）
npm run dev

# 构建生产版本
npm run build

# 打包桌面应用
npm run dist
```

**前置要求**：Node.js 20+，npm 10+

---

## 🚀 快速开始

### 1. 首次启动

启动应用后，自动完成后端服务启动和数据库初始化：

> **截图**: 见 `docs/screenshots/first-launch-home.png` — 首次启动后的主界面

### 2. 配置 AI（可选）

进入 **设置 → LLM**，选择你的 AI 提供商：

- **OpenAI**：输入 API Key，选择 GPT-4o 或 GPT-4o-mini
- **Claude**：输入 API Key，选择 Claude 3.5 Sonnet
- **Ollama**：确保本地已运行 `ollama serve`，选择本地模型

> **截图**: 见 `docs/screenshots/quickstart-llm-settings.png` — LLM 设置面板，显示已配置 OpenAI

### 3. 创建你的第一个模组

**方式一：AI 生成**

1. 点击首页「上传故事，创建模组」
2. 粘贴或上传你的故事文本（至少 200 字）
3. 选择规则系统（COC / D&D 5e / 自定义）
4. 点击「生成模组」，等待 AI 处理
5. 预览并保存到模组库

> **截图**: 见 `docs/screenshots/quickstart-generator-demo.png` — 模组生成器界面，显示文本输入与生成按钮

**方式二：导入现有模组**

1. 进入「模组管理」
2. 点击「导入模组」，选择 JSON 文件
3. 导入成功后即可游玩

### 4. 开始游戏

1. 点击首页「继续游戏」
2. 阅读对话，点击选项推进剧情
3. 按 `ESC` 打开菜单进行存档/读档
4. 遇到战斗时选择行动，击败敌人

> **截图**: 见 `docs/screenshots/gameplay-main-view.png` — 游戏主界面，背景 + 角色立绘 + 对话文本

---

## 📸 截图展示

### 主界面

> **截图**: 见 `docs/screenshots/showcase-homepage.png` — 深色主题首页，展示所有导航按钮

### 游戏界面

> **截图**: 见 `docs/screenshots/showcase-gameplay.png` — 典型游戏场景，背景 + 角色立绘 + 对话文本

### 战斗界面

> **截图**: 见 `docs/screenshots/gameplay-main-view.png` — 战斗场景，背景 + 角色立绘 + 对话层 + 行动菜单

### 模组管理

> **截图**: 见 `docs/screenshots/module-manager-list.png` — 模组列表，展示已创建和导入的模组

### 图片资源

> **截图**: 见 `docs/screenshots/showcase-images.png` — 图片搜索与生成功能，展示资源库

### 设置面板

> **截图**: 见 `docs/screenshots/showcase-settings.png` — 设置面板，包含 LLM、主题、游戏等配置项

### 模组生成器

> **截图**: 见 `docs/screenshots/showcase-generator.png` — 模组生成器，文本输入 + 预览面板

### 风格分析器

> **截图**: 见 `docs/screenshots/showcase-style-analyzer.png` — 风格分析结果，展示色板与关键词

---

## 📚 文档

| 文档 | 说明 | 链接 |
|------|------|------|
| **用户手册** | 安装、游玩、存档、设置、故障排除 | [docs/user-manual.md](docs/user-manual.md) |
| **开发者指南** | 架构、API、模组格式、扩展战斗技能 | [docs/developer-guide.md](docs/developer-guide.md) |
| **版本记录** | 变更日志与版本计划 | [docs/changelog.md](docs/changelog.md) |
| **架构设计** | 原始开发计划与架构图 | [docs/architecture.md](docs/architecture.md) |

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 33+ |
| 前端 | React 18 + Vite + TypeScript + Tailwind CSS |
| 状态 | Zustand |
| 动画 | Framer Motion |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 自动更新 | electron-updater |

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

- **Bug 报告**：请附上操作系统、应用版本、复现步骤和日志文件
- **功能建议**：在 Issue 中描述使用场景和期望行为
- **代码贡献**：参考 [开发者指南](docs/developer-guide.md#贡献指南)

---

## 📄 许可证

MIT License — 详见 [LICENSE](LICENSE) 文件。

---

## 🙏 致谢

- [Electron](https://www.electronjs.org/) — 跨平台桌面应用框架
- [React](https://react.dev/) — 前端 UI 框架
- [Vite](https://vitejs.dev/) — 前端构建工具
- [Tailwind CSS](https://tailwindcss.com/) — 实用优先 CSS 框架
- [Framer Motion](https://www.framer.com/motion/) — 动画库
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — 高性能 SQLite 驱动

---

> Made with ❤️ by AI-GM Project  
> *Don't worry. Even if the world forgets, I'll remember for you.* 🖤
