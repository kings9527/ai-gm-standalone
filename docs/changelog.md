# Changelog

All notable changes to AI-GM Standalone will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-07-11

### 🛠️ D7 — 文档与构建 (2026-07-13)

- **ESLint 配置修正** — 修复 `preserve-caught-error` 规则冲突，更新 `tsconfig.json` 目标为 ES2022
- **Windows 构建指南** — 新增 `docs/windows-build-guide.md`，完整记录 Linux 交叉构建 Windows 安装包流程

### 🚀 Release Preparation (D6 — 2026-07-11)

- **GitHub Publish 配置修正** — 修正 `electron-builder` publish 配置中的 owner 为实际仓库持有者 `kings9527`，确保自动更新通道正确指向 `github.com/kings9527/ai-gm-standalone`
- **代码审查与清理** — 修复所有 lint 错误，清理遗留的 TODO 注释和未使用导入
- **性能优化** — 路由级别代码分割 + 手动 chunk 拆分，减少首屏加载时间
- **D6 UX 打磨** — 战斗系统键盘快捷键支持（1-4 数字键选技能、ESC 菜单、空格确认）、全屏模式切换（F11）、音效开关控制（Web Audio API 合成器）
- **README 最终修正** — 修复损坏的内部链接引用，统一截图路径格式
- **截图补全** — `docs/screenshots/` 目录补充 34 张实际运行截图，替换全部占位符

### 🐛 Bug 修复记录 (D4~D6)

**已修复（8 项）：**

| Bug | 描述 | 修复提交 |
|-----|------|---------|
| BUG-1 | 存档 API 字段名不一致 (`campaign` vs `campaign_json`) | `2e3519e` |
| BUG-2 | Settings 前后端结构不匹配（扁平 key-value ↔ 嵌套对象） | `991ea04` |
| BUG-3 | LLM Chat 缺少 provider 时返回 500 内部错误 | `0f3641c` |
| BUG-7 | 加密工具使用简单 XOR，安全性不足 → 替换为 AES-256-GCM + PBKDF2 | `f2e587c` |
| BUG-8 | ImageSelector 搜索参数拼接未编码 → 改为双参数传递 + IPC encodeURIComponent | 原始代码已正确实现 |
| BUG-9 | VN 引擎自动存档无防抖 → 添加 800ms debounce | `f6310a6` |
| BUG-10 | Combat `executeAndAdvance` 状态更新竞争 → setTimeout 打破 React 批处理 | `17bda12` |
| BUG-11 | 数据库 `saves`/`images` 表缺少索引 → 添加复合索引 | `a483963` |
| UX-1 | 删除图片无二次确认 → 添加确认弹窗 | `db8fb40` |

**部分修复 / 缓解（2 项）：**

| Bug | 描述 | 状态 |
|-----|------|------|
| BUG-6 | NPCDecisionEngine 构造函数修改 campaign → 构造函数已改为深拷贝，但 `_ensureNPCState` / `updateState` 仍 mutate 内部状态且不返回调用者，NPC 状态变更无法同步回 Zustand | 需后续重构 |
| BUG-13 | SettingsPage API Key 正则过于严格 → Ollama 模式下可留空绕过验证，但未按 provider 分别校验格式 | 低优先级 |

**未修复 / 遗留（4 项）：**

| Bug | 描述 | 原因 / 计划 |
|-----|------|------------|
| BUG-5 | `GameStateMachine` 直接修改 campaign 对象（`transitionTo`、`performSanityCheck`、`applyEventEffects` 等均 mutate `this._campaign`） | 重构面广，涉及所有状态变更方法；Zustand 不可变更新冲突，可能导致 React 跳过渲染。计划 v1.1.0 重构 |
| BUG-12 | `handleAdvance` 始终选择 `exits[0]`，无多出口选择 UI | 需新增选择界面组件，v1.1.0 规划 |
| BUG-15 | `DiceRoller` 正则无法解析复杂表达式（`1d6*2`、`(1d6+3)*2`） | 需引入骰子表达式解析库，v1.1.0 规划 |
| BUG-16 | AI `executeAIAction` 技能池包含 `desperate_strike`（消耗 SAN），敌人使用会自伤 | 需按实体类型过滤技能池，v1.1.0 规划 |

### 📝 Documentation (D4 — 2026-07-09)

- **README 截图占位符更新** — 所有 `[SCREENSHOT:...]` / `[VIDEO:...]` 占位符已替换为指向 `docs/screenshots/` 目录的实际文件路径说明，附带截取指引
- **用户手册截图占位符更新** — 23 处截图/录屏占位符全部替换为实际路径，统一存放于 `docs/screenshots/`
- **开发者指南 API 一致性验证** — 修正以下与实际代码不一致的文档描述：
  - `POST /api/llm/stream` 返回格式：由「SSE stream」修正为「raw text/plain stream」
  - `POST /api/modules` Body：补充完整字段列表（id/content/style 等）
  - `llmStream` IPC 签名：注明 preload 单参数与前端三参数封装的差异
  - `POST /api/settings`：补充 value 会被强制转为 String 的说明
  - `imageSearch`：注明 IPC 层仅传递 query，type 在后端默认 bg
  - 截图占位符统一替换为 `docs/screenshots/` 路径
- **新增截图目录** — `docs/screenshots/` 创建完毕，待后续手动补充实际截图文件
- **开发者指南最后更新日期** — 更新至 2026-07-09，附加 API 一致性验证记录

### 🎉 Initial Release

AI-GM Standalone v1.0.0 is the first stable release of the AI-powered visual novel RPG engine for desktop.

### ✨ Features

#### Core Engine
- **Visual Novel Engine** — Layered rendering system (Background, Sprite, Dialogue, Effect, Choice) with typewriter text animation, scene transitions, and real-time visual effects
- **Game State Machine** — Scene-to-scene flow control, event triggering, condition checks, and branching dialogue
- **Modular Module System** — JSON-based module format supporting scenes, NPCs, items, events, combat, and multiple endings

#### AI Integration
- **Multi-LLM Support** — Proxy support for OpenAI (GPT-4o / GPT-4o-mini), Claude (3.5 Sonnet), and Ollama (local models) via secure backend IPC
- **Streaming Chat** — Real-time streaming responses with SSE format parsing
- **Style Analyzer** — AI-powered text analysis to extract visual style configurations (palette, atmosphere, art style, lighting, mood keywords)
- **Module Generator** — Convert plain text stories into playable modules via AI text analysis and structured generation

#### Combat System
- **Turn-based Combat** — COC-style d100 check system with critical success (≤5), fumble (≥96), normal hit/miss
- **Action Types** — Attack, Skill, Item, Defend, Flee, Wait
- **Default Skill Library** — 8 built-in skills: Brawl, Firearm, Dodge, First Aid, Inspire, Aim, Desperate Strike, Intimidate
- **Status Effects** — Buff/debuff system with duration and stat modifiers
- **AI Enemy Behavior** — Priority targeting (lowest HP), random skill usage (30% chance)

#### Save System
- **Manual Save/Load** — Up to N slots with custom names and thumbnail screenshots
- **Auto-save** — Automatic save on scene transitions, combat starts, and key story events
- **Save Portability** — Complete campaign state preservation including player stats, inventory, scene history, NPC states, and VN engine snapshots

#### Image Management
- **Search** — Unsplash API integration with Picsum Photos fallback for royalty-free images
- **AI Generation** — DALL-E 3 integration for background (1792×1024) and sprite (1024×1792) generation
- **Local Upload** — Support for JPG, PNG, GIF, WebP, BMP via base64 encoding
- **Categorized Storage** — Automatic organization by type (bg / sprite / portrait / upload)

#### Module Management
- **Import/Export** — JSON format with file dialog support
- **CRUD Operations** — Create, read, update, delete modules via backend SQLite
- **Validation** — JSON structure validation on import

#### Settings & Customization
- **LLM Configuration** — Provider selection, model selection, API key secure storage (AES encrypted), base URL override
- **Image Configuration** — Unsplash API key, DALL-E key, default strategy selection
- **Game Settings** — Typewriter speed, font size, auto-advance delay, skip-unread toggle
- **Theme System** — Dark / Light / Auto mode with custom CSS variable support
- **Style Templates** — Save, load, and manage reusable visual style configurations

#### Desktop Integration
- **Electron Shell** — Cross-platform desktop app (Windows, macOS, Linux)
- **Auto-updater** — GitHub Releases-based automatic update checking and installation
- **Secure IPC** — Preload script isolation with contextIsolation enabled
- **User Data Directory** — Platform-specific data storage (`~/AI-GM` or system user data path)
- **Backend Auto-start** — Express server automatically launched and monitored by main process

#### UI/UX
- **Page Transitions** — Framer Motion powered slide animations between routes
- **Skeleton Loading** — Loading placeholders for async content
- **Toast Notifications** — Non-blocking status messages
- **Global Error Boundary** — Graceful error handling with recovery options
- **Responsive Layout** — Minimum window size 1000×600, supports fullscreen
- **In-Game Menu** — Pause overlay with Save, Load, Settings, Resume, Quit options

### 🛠️ Technical Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron 33+ |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| State | Zustand with persist middleware |
| Animation | Framer Motion |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| Auto-update | electron-updater |

### 📦 Distribution

- **Windows** — NSIS installer (.exe) + Portable (.exe)
- **macOS** — DMG (.dmg) + ZIP (.zip), Universal (x64 + arm64)
- **Linux** — AppImage + DEB package

### 📝 Documentation

- `docs/user-manual.md` — Complete user operation guide (installation, module import, gameplay, saves, settings)
- `docs/developer-guide.md` — Developer guide (architecture, API, extending combat skills)
- `docs/changelog.md` — This file

### 🚧 Known Issues

- Claude streaming is not yet supported (use non-streaming mode for Claude)
- macOS Gatekeeper may require manual approval on first launch (unsigned build)
- Large image files (>10MB) may cause memory pressure during gameplay
- Ollama requires local installation and manual model download (`ollama pull llama3.2`)

---

## Planned

### [1.1.0] — Audio & Polish
- Background music and SFX system
- Voice synthesis integration (TTS)
- Enhanced animation system (custom character animations)
- Module marketplace / sharing platform

### [1.2.0] — Advanced RPG
- Character creation wizard
- Inventory UI with drag-and-drop
- Skill tree / progression system
- Multi-language support (i18n)

### [2.0.0] — Multiplayer
- LAN multiplayer co-op mode
- Real-time GM assistant
- Shared session state synchronization

- **Bug 修复** — 详见上方「Bug 修复记录」表格。D4~D6 期间共识别 16 项问题，其中 8 项已修复、2 项部分缓解、4 项遗留至 v1.1.0 规划。完整测试报告见 `D6-E2E-REGRESSION-REPORT.md` 和 `TODO-D4-E2E-TEST.md`

---

> Last updated: 2026-07-13
> **Release Status**: v1.0.0 已发布，GitHub Release 已创建
> **Tag**: `v1.0.0`
> **GitHub**: https://github.com/kings9527/ai-gm-standalone/releases
