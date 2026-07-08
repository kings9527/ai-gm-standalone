# AI-GM Standalone 开发者指南

> 版本：v1.0.0  
> 目标读者：前端开发者、模组开发者、贡献者

---

## 目录

1. [项目架构](#项目架构)
2. [目录结构](#目录结构)
3. [技术栈](#技术栈)
4. [开发环境搭建](#开发环境搭建)
5. [后端 API](#后端-api)
6. [前端架构](#前端架构)
7. [IPC 通信](#ipc-通信)
8. [模组格式规范](#模组格式规范)
9. [扩展战斗技能](#扩展战斗技能)
10. [构建与打包](#构建与打包)
11. [贡献指南](#贡献指南)

---

## 项目架构

AI-GM Standalone 是一个基于 Electron 的桌面应用，采用「三进程」架构：

```
┌─────────────────┐     IPC      ┌─────────────────┐     HTTP     ┌─────────────────┐
│  Renderer       │◄────────────►│  Main Process   │◄────────────►│  Express API    │
│  (React + Vite) │  (preload)   │  (electron/main)│  (localhost:9742)│  (backend/src) │
└─────────────────┘              └─────────────────┘               └─────────────────┘
       │                                │                                │
       │                                ▼                                │
       │                         ┌──────────────┐                       │
       │                         │  SQLite DB   │                       │
       │                         │  ~/AI-GM/    │                       │
       │                         └──────────────┘                       │
       │                                                                │
       └────────────────────────────────────────────────────────────────┘
                                LLM API (OpenAI/Claude/Ollama)
```

### 设计原则

- **安全隔离**：API Key 仅存储在后端 SQLite 中，前端通过 IPC 间接调用，永不暴露密钥
- **状态持久化**：游戏状态（Campaign）通过 Zustand 管理，存档自动同步到后端数据库
- **跨平台**：通过 Electron Builder 统一打包 Windows / macOS / Linux 安装包

> **截图占位**：`[SCREENSHOT: architecture-diagram-high-res]` — 高分辨率架构图，用于文档展示

---

## 目录结构

```
ai-gm-standalone/
├── electron/                    # Electron 主进程
│   ├── main.cjs                 # 主进程入口（窗口创建、后端启动、IPC 注册）
│   ├── preload.cjs              # 预加载脚本（安全 IPC 桥接）
│   └── renderer-preload.js      # 渲染进程预加载（开发调试用）
│
├── backend/                     # Node.js 后端 API
│   ├── src/
│   │   ├── index.js             # Express 服务器入口
│   │   ├── routes/
│   │   │   ├── llm.js           # LLM 代理（chat / stream）
│   │   │   ├── modules.js       # 模组 CRUD + 导入/导出
│   │   │   ├── saves.js         # 存档管理
│   │   │   ├── images.js        # 图片搜索/下载/生成/上传
│   │   │   ├── settings.js      # 配置管理（KV 存储）
│   │   │   └── styles.js        # 风格模板管理（文件系统）
│   │   ├── db/
│   │   │   └── sqlite.js        # SQLite 封装（better-sqlite3）
│   │   └── package.json
│   └── package.json
│
├── frontend/                    # React 渲染进程
│   ├── src/
│   │   ├── api/
│   │   │   └── electron.ts      # Electron IPC API 封装
│   │   ├── components/          # UI 组件
│   │   │   ├── combat/          # 战斗系统 UI
│   │   │   ├── engine/          # 视觉小说引擎渲染层
│   │   │   ├── generator/       # 模组生成器
│   │   │   ├── image-selector/  # 图片选择器
│   │   │   ├── menu/            # 游戏内菜单
│   │   │   ├── module-manager/  # 模组管理页
│   │   │   ├── save-load/       # 存档/读档面板
│   │   │   ├── settings/        # 设置页面
│   │   │   ├── style-analyzer/  # 风格分析器
│   │   │   └── ui/              # 通用 UI 组件（Toast、Skeleton、ErrorBoundary）
│   │   ├── engine/              # 游戏引擎核心
│   │   │   ├── combat-system.ts # 回合制战斗状态机
│   │   │   ├── dice.ts          # 骰子系统（COC d100）
│   │   │   ├── npc-decision.ts  # NPC AI 决策
│   │   │   ├── rule-engine.ts   # 规则引擎（COC/D&D）
│   │   │   └── state-machine.ts # 游戏状态机（场景流转）
│   │   ├── llm/                 # LLM 客户端与工具
│   │   │   ├── client.ts        # LLMClient（IPC 调用封装）
│   │   │   ├── prompts.ts       # AI 提示词模板
│   │   │   └── style-analyzer.ts# 风格分析逻辑
│   │   ├── modshare/            # 模组导入/导出工具
│   │   │   ├── exporter.ts
│   │   │   ├── importer.ts
│   │   │   └── validator.ts
│   │   ├── stores/              # Zustand 状态管理
│   │   │   ├── gameStore.ts     # 游戏运行时状态
│   │   │   ├── moduleStore.ts   # 模组数据状态
│   │   │   ├── saveStore.ts     # 存档操作状态
│   │   │   ├── settingsStore.ts # 应用配置状态
│   │   │   └── styleStore.ts    # 风格模板状态
│   │   ├── types/               # TypeScript 类型定义
│   │   │   ├── module.ts        # 模组/场景/NPC/物品/战役类型
│   │   │   ├── engine.ts        # VN 引擎状态类型
│   │   │   ├── combat.ts        # 战斗系统类型
│   │   │   └── llm.ts           # LLM 配置与响应类型
│   │   ├── utils/               # 工具函数
│   │   │   ├── crypto.ts        # 敏感数据加密（AES）
│   │   │   ├── sanitize.ts      # 输入消毒
│   │   │   └── storage.ts       # 本地存储封装
│   │   ├── App.tsx              # 主路由（HashRouter）
│   │   └── main.tsx             # 渲染进程入口
│   ├── public/
│   │   └── demo-module.json     # 演示模组
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── build/                       # 打包资源
│   ├── icons/                   # 应用图标（多分辨率）
│   ├── nsis/                    # Windows 安装器脚本
│   └── entitlements.mac.plist   # macOS 权限配置
│
├── docs/                        # 文档
│   ├── architecture.md          # 架构文档（开发计划版）
│   ├── user-manual.md           # 用户手册
│   ├── developer-guide.md       # 本文件
│   └── changelog.md             # 版本变更记录
│
├── package.json                 # 根 package.json（Electron 主配置）
├── README.md
└── LICENSE
```

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面壳 | Electron | 33+ |
| 构建工具 | electron-builder | 25+ |
| 前端框架 | React | 18+ |
| 构建工具 | Vite | 5+ |
| 语言 | TypeScript | 5+ |
| 样式 | Tailwind CSS | 3+ |
| 状态管理 | Zustand | 4+ |
| 动画 | framer-motion | 11+ |
| 路由 | React Router | 6+ (HashRouter) |
| 后端 | Node.js + Express | 20+ / 4+ |
| 数据库 | SQLite (better-sqlite3) | 11+ |
| 图片处理 | Jimp | 1+ |
| 自动更新 | electron-updater | 6+ |

---

## 开发环境搭建

### 前置要求

- Node.js 20+ (推荐使用 `nvm` 管理)
- npm 10+
- (可选) Ollama 本地模型环境

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/aigm-project/ai-gm-standalone.git
cd ai-gm-standalone

# 安装根依赖（Electron + 构建工具）
npm install

# 安装后端依赖
# postinstall 会自动执行 cd backend && npm install
```

### 开发模式

```bash
# 同时启动前端 Vite dev server + 后端 Express + Electron
npm run dev

# 各服务端口：
# - Vite 前端: http://localhost:5173
# - Express 后端: http://localhost:9742
# - Electron 主进程: 自动加载 localhost:5173
```

### 独立测试后端

```bash
cd backend
npm run dev
# 或
node --watch src/index.js
```

后端默认监听 `9742` 端口，可通过环境变量 `PORT` 覆盖。

### 构建生产版本

```bash
# 构建前端 + 后端
npm run build

# 打包为桌面应用（不发布）
npm run dist:dir

# 打包并发布到 GitHub Releases
npm run dist
```

> **截图占位**：`[SCREENSHOT: dev-mode-three-terminals]` — 开发模式下三个终端窗口（Vite + Express + Electron）

---

## 后端 API

后端 Express 服务器提供以下 RESTful API，Electron 主进程通过 `fetch` 调用：

### 健康检查

```
GET /health
Response: { status: "ok", timestamp: "2026-07-08T10:00:00.000Z" }
```

### LLM 代理

```
POST /api/llm/chat
Body: { provider, model, messages, temperature, maxTokens, stream }
Response: { content, provider, model, raw }

POST /api/llm/stream
Body: { provider, model, messages, temperature, maxTokens }
Response: text/plain (SSE stream)
```

支持 `provider`: `openai` | `claude` | `ollama`

### 模组管理

```
GET    /api/modules              # 列出所有模组
GET    /api/modules/:id          # 获取单个模组（自动解析 JSON 字段）
POST   /api/modules              # 创建/更新模组
DELETE /api/modules/:id          # 删除模组
POST   /api/modules/import       # 从 JSON 字符串导入
```

### 存档管理

```
GET    /api/saves?moduleId=xxx   # 列出模组的所有存档
GET    /api/saves/:id            # 获取单个存档
POST   /api/saves                # 创建/更新存档
DELETE /api/saves/:id            # 删除存档
```

### 图片管理

```
GET    /api/images?type=bg|sprite|portrait
GET    /api/images/search?q=keyword&type=bg|sprite
GET    /api/images/:id
DELETE /api/images/:id
POST   /api/images/download      # 从 URL 下载图片到本地
POST   /api/images/generate     # AI 生成图片（DALL-E）
POST   /api/images/upload       # 上传 Base64 图片
```

### 设置管理

```
GET    /api/settings             # 获取所有设置
GET    /api/settings/:key        # 获取单个设置
POST   /api/settings             # 设置键值对
```

### 风格管理

```
GET    /api/styles               # 列出所有风格模板
GET    /api/styles/:id           # 获取风格模板
POST   /api/styles               # 创建风格模板
PUT    /api/styles/:id           # 更新风格模板
DELETE /api/styles/:id           # 删除风格模板
```

风格模板以 JSON 文件形式存储在 `~/AI-GM/styles/` 目录中。

---

## 前端架构

### 状态管理（Zustand）

应用使用 5 个 Zustand Store 分离关注点：

| Store | 职责 | 持久化 |
|-------|------|--------|
| `gameStore` | 游戏运行时状态（当前场景、战役数据、状态机） | 不持久化（运行时内存） |
| `moduleStore` | 模组数据（列表、当前模组） | 不持久化 |
| `saveStore` | 存档操作（列表、读写、自动存档） | 通过后端 API 持久化 |
| `settingsStore` | 应用配置（LLM、图片、游戏、主题） | localStorage + 后端 SQLite |
| `styleStore` | 风格模板（列表、当前风格） | 后端文件系统 |

### 视觉小说引擎（VisualNovelEngine）

核心组件 `VisualNovelEngine` 采用分层渲染架构：

```tsx
// VisualNovelEngine.tsx 内部结构
<BackgroundLayer bg={state.bg} transition={state.bgTransition} />
<SpriteLayer sprites={state.sprites} />
<DialogueLayer dialogue={state.dialogue} />
<EffectLayer effects={state.effects} />
<ChoiceOverlay choices={state.choices} onSelect={handleChoice} />
```

引擎状态 `VNState` 包含：
- `currentSceneId`: 当前场景 ID
- `bg`: 背景图片 URL
- `sprites`: 立绘列表（位置、表情、动画）
- `dialogue`: 当前对话（打字机进度）
- `choices`: 可选选项
- `effects`: 视觉特效（震动、闪光、颗粒等）

### 游戏状态机（GameStateMachine）

`GameStateMachine` 负责场景流转和事件触发：

```typescript
class GameStateMachine {
  module: Module;          // 当前模组
  campaign: Campaign;      // 战役状态
  currentScene: Scene;     // 当前场景
  
  transitionTo(sceneId: string): void;  // 场景切换
  handleChoice(choiceId: string): void; // 处理玩家选择
  checkEvents(): void;                   // 检查触发事件
  initCombat(enemies: string[]): CombatState; // 初始化战斗
}
```

### 路由（HashRouter）

```
/              → 首页（导航）
/generator     → 模组生成器
/style-analyzer → AI 风格分析器
/images        → 图片管理
/play          → 游戏游玩
/modules       → 模组管理
/settings      → 设置（支持 fromGame 状态）
```

---

## IPC 通信

Electron 主进程通过 `preload.cjs` 向渲染进程暴露安全 API：

### LLM

```typescript
await window.electronAPI.llmChat(body);        // 单次对话
await window.electronAPI.llmStream(body, onChunk, onEnd); // 流式输出
```

### 模组

```typescript
await window.electronAPI.moduleList();         // 获取模组列表
await window.electronAPI.moduleGet(id);        // 获取单个模组
await window.electronAPI.moduleSave(data);     // 保存模组
await window.electronAPI.moduleDelete(id);     // 删除模组
await window.electronAPI.moduleImport();       // 打开文件对话框导入
await window.electronAPI.moduleExport(id);     // 打开文件对话框导出
```

### 存档

```typescript
await window.electronAPI.saveList(moduleId);   // 存档列表
await window.electronAPI.saveWrite(data);        // 写入存档
await window.electronAPI.saveRead(id);           // 读取存档
await window.electronAPI.saveDelete(id);         // 删除存档
```

### 图片

```typescript
await window.electronAPI.imageSearch(query);     // 搜索图片
await window.electronAPI.imageDownload(url, type); // 下载图片
await window.electronAPI.imageGenerate(body);    // AI 生成图片
await window.electronAPI.imageList(type);        // 本地图片列表
await window.electronAPI.imageDelete(id);         // 删除图片
await window.electronAPI.imageUpload(data, filename, type); // 上传图片
await window.electronAPI.imageDialog();          // 打开文件对话框选择图片
```

### 设置

```typescript
await window.electronAPI.settingsGet(key);       // 获取设置
await window.electronAPI.settingsSet(key, value); // 设置键值
await window.electronAPI.settingsGetAll();         // 获取所有设置
```

### 风格

```typescript
await window.electronAPI.styleList();            // 风格列表
await window.electronAPI.styleGet(id);           // 获取风格
await window.electronAPI.styleSave(data);        // 保存风格
await window.electronAPI.styleUpdate(id, data);  // 更新风格
await window.electronAPI.styleDelete(id);        // 删除风格
```

### 其他

```typescript
await window.electronAPI.pathUserData();         // 获取用户数据目录路径
window.electronAPI.quit();                       // 退出应用（Electron 环境）
await window.electronAPI.updaterCheck();         // 手动检查更新
```

---

## 模组格式规范

模组是 AI-GM 的核心内容单位，使用 JSON 格式描述。

### 最小可用模组

```json
{
  "id": "demo_mod",
  "name": "演示模组",
  "system": "coc",
  "version": "1.0.0",
  "start_scene": "scene_1",
  "scenes": {
    "scene_1": {
      "id": "scene_1",
      "title": "序章",
      "description": "你站在一座废弃宅邸前...",
      "bg": "https://example.com/bg.jpg",
      "sprites": [
        {
          "char_id": "player",
          "position": "center",
          "expression": "normal",
          "enter_animation": "fade"
        }
      ],
      "dialogue": {
        "speaker": null,
        "text": "夜风呼啸，宅邸的窗户透出微弱的灯光...",
        "typewriter": true
      },
      "choices": [
        {
          "id": "choice_1",
          "text": "推门而入",
          "action": "next",
          "target": "scene_2"
        },
        {
          "id": "choice_2",
          "text": "绕到后院",
          "action": "scene",
          "target": "scene_3"
        }
      ]
    },
    "scene_2": {
      "id": "scene_2",
      "title": "大厅",
      "dialogue": {
        "speaker": "???",
        "text": "欢迎...你终于来了。"
      }
    }
  },
  "npcs": {},
  "items": {}
}
```

### 字段说明

#### Module 根对象

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 唯一标识符（建议 `mod_` 前缀） |
| `name` | string | ✓ | 模组显示名称 |
| `system` | string | ✓ | 规则系统：`coc` / `dnd5e` / `custom` |
| `version` | string | ✓ | 语义化版本号 |
| `start_scene` | string | ✓ | 初始场景 ID |
| `scenes` | object | ✓ | 场景字典（key 为 scene ID） |
| `npcs` | object | ✗ | NPC 字典（key 为 npc ID） |
| `items` | object | ✗ | 物品字典（key 为 item ID） |
| `events` | object | ✗ | 全局事件字典 |
| `style` | object | ✗ | 风格配置（见 StyleConfig） |

#### Scene 对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 场景唯一 ID |
| `title` | string | 场景标题（显示在顶部） |
| `description` | string | 场景描述（用于 AI 生成上下文） |
| `bg` | string | 背景图片 URL 或本地路径 |
| `bg_music` | string | 背景音乐（可选） |
| `sprites` | array | 立绘配置列表 |
| `dialogue` | object | 对话内容 |
| `choices` | array | 玩家选项列表 |
| `exits` | array | 场景出口（用于自由探索模式） |
| `interactables` | array | 可交互对象 ID 列表 |
| `npcs` | array | 场景中存在的 NPC ID 列表 |
| `combat` | object | 战斗配置（进入场景时触发） |
| `ending` | object | 结局配置 |
| `events` | array | 触发的事件 ID 列表 |

#### NPC 对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | NPC 唯一 ID |
| `name` | string | 显示名称 |
| `description` | string | 角色描述 |
| `role` | string | 角色立场：`neutral` / `ally` / `enemy` / `Boss` |
| `attitude` | string | 初始态度描述 |
| `stats` | object | 属性字典（COC 如 `{"侦查": 60, "格斗": 40}`） |
| `hp` | number | 生命值 |
| `sanity` | number | 理智值（COC） |
| `sprites` | object | 表情 -> 图片 URL 映射 |
| `secrets` | array | 秘密信息（关键词触发揭示） |
| `dialogue` | object | 预设对话字典 |

#### Choice 对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 选项唯一 ID |
| `text` | string | 显示文本 |
| `condition` | object | 显示条件（如 `{"flags.has_key": true}`） |
| `action` | string | 动作类型：`next` / `scene` / `dice_check` / `combat` / `custom` |
| `target` | string | 目标场景 ID（action 为 `scene` 时） |
| `dice_check` | object | 骰子检定配置（`{ skill: "格斗", target: 50 }`） |

#### CombatConfig 对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | boolean | 是否启用战斗 |
| `enemies` | array | 敌人 NPC ID 列表 |
| `ambush` | boolean | 是否被突袭（敌人先行动） |

### 风格配置（StyleConfig）

```json
{
  "palette": {
    "bg": "#1a1a2e",
    "accent": "#e94560",
    "text": "#f5f5f5",
    "dialogue_bg": "#16213e"
  },
  "atmosphere": "压抑、神秘",
  "era": "1920年代",
  "art_style": "复古油画",
  "lighting": "昏暗烛光",
  "mood_keywords": ["悬疑", "恐怖", "克苏鲁"],
  "font_family": "serif",
  "effects": ["grain", "vignette"],
  "image_strategy": {
    "background": "search",
    "sprites": "generate",
    "search_provider": "unsplash"
  }
}
```

---

## 扩展战斗技能

战斗系统支持自定义技能扩展。技能定义在 `frontend/src/engine/combat-system.ts` 的 `DEFAULT_SKILLS` 对象中。

### 技能接口

```typescript
interface CombatSkill {
  id: string;                    // 唯一标识
  name: string;                  // 显示名称
  description: string;         // 描述文本
  cost: {
    mp?: number;                 // MP 消耗
    sanity?: number;             // SAN 消耗
  };
  targetType: 'self' | 'single' | 'all_enemies' | 'all_allies';
  effect: {
    type: 'damage' | 'heal' | 'buff' | 'debuff' | 'status';
    formula?: string;            // 伤害/治疗公式（如 "1d6+2"）
    statusEffect?: CombatStatusEffect;  // 状态效果
    statModifier?: Record<string, number>; // 属性修正
  };
  requirement?: Record<string, number>; // 使用条件（最低属性要求）
}
```

### 添加新技能示例

在 `frontend/src/engine/combat-system.ts` 中，向 `DEFAULT_SKILLS` 添加新条目：

```typescript
// 添加一个新技能：灵魂收割
soul_reap: {
  id: 'soul_reap',
  name: '灵魂收割',
  description: '对单个敌人造成基于已损失HP的额外伤害',
  cost: { sanity: 5 },
  targetType: 'single',
  effect: {
    type: 'damage',
    formula: '1d8+(max_hp-hp)/2',  // 自定义公式，支持 hp / max_hp / str / siz 等变量
  },
  requirement: { 格斗: 60 },  // 需要格斗 60 以上
},

// 添加一个群体治疗技能
mass_heal: {
  id: 'mass_heal',
  name: '群体急救',
  description: '为所有盟友恢复少量HP',
  cost: { mp: 15 },
  targetType: 'all_allies',
  effect: {
    type: 'heal',
    formula: '1d3+1',
  },
},

// 添加一个状态技能：致盲
blind: {
  id: 'blind',
  name: '致盲',
  description: '使敌人命中率大幅下降',
  cost: { mp: 10 },
  targetType: 'single',
  effect: {
    type: 'status',
    statusEffect: {
      type: 'blinded',
      name: '致盲',
      duration: 3,
      description: '命中率-40',
      modifier: { attack: -40 },
    },
  },
},
```

### 公式语法

伤害公式支持以下元素：

| 语法 | 说明 | 示例 |
|------|------|------|
| `XdY` | 掷 X 个 Y 面骰 | `2d6`（2个6面骰） |
| `+N` / `-N` | 固定加减 | `+3` / `-2` |
| `db` | 伤害加值（COC 规则，基于 STR+SIZ） | `1d3+db` |
| `hp` / `max_hp` | 当前/最大生命值 | `(max_hp-hp)/2` |
| `str` / `siz` / `dex` | 属性值 | `str/5` |

> **截图占位**：`[SCREENSHOT: combat-skill-editor-code]` — VS Code 中编辑战斗技能定义的截图，带语法高亮

### 自定义公式变量

如需扩展公式支持的变量，修改 `resolveDamageFormula` 函数：

```typescript
// 在 combat-system.ts 中
function resolveDamageFormula(
  formula: string,
  str: number = 50,
  siz: number = 50,
  // 添加新参数
  dex: number = 50,
  con: number = 50,
): number {
  let expr = formula
    .replace(/db/gi, calculateDamageBonus(str, siz))
    .replace(/str/gi, String(str))
    .replace(/siz/gi, String(siz))
    .replace(/dex/gi, String(dex))  // 新增
    .replace(/con/gi, String(con));   // 新增
  // ...
}
```

---

## 构建与打包

### 开发构建

```bash
# 前端构建（输出到 frontend/dist/）
cd frontend && npx vite build

# 后端无需构建（Node.js 直接运行）
```

### Electron 打包

打包配置在根 `package.json` 的 `build` 字段中：

| 平台 | 输出格式 | 配置路径 |
|------|----------|----------|
| Windows | `.exe` (NSIS), `.exe` (Portable) | `build.win` / `build.nsis` |
| macOS | `.dmg`, `.zip` | `build.mac` / `build.dmg` |
| Linux | `.AppImage`, `.deb` | `build.linux` |

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 后端端口 | `9742` |
| `AIGM_USER_DATA` | 用户数据目录 | `~/AI-GM` |

### 自动更新

应用使用 `electron-updater` 实现自动更新，配置要求：

1. GitHub 仓库发布 Release 时附带打包文件
2. `package.json` 中 `build.publish` 配置正确：

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "aigm-project",
      "repo": "ai-gm-standalone"
    }
  }
}
```

3. 启动时自动检查更新（生产环境）
4. 下载完成后提示用户重启应用

---

## 贡献指南

### 代码规范

- 使用 TypeScript 严格模式
- 组件使用函数式组件 + React Hooks
- 状态管理优先使用 Zustand，避免滥用 Context
- API 调用统一通过 `electronAPI` 封装，避免直接 `fetch`

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 新增战斗技能系统
fix: 修复存档缩略图丢失问题
docs: 更新用户手册
refactor: 重构 LLM 客户端错误处理
test: 添加骰子系统单元测试
chore: 升级 Electron 至 34
```

### 测试

```bash
# 运行前端测试（如有）
cd frontend && npm test

# 运行后端测试（如有）
cd backend && npm test
```

### 报告问题

提交 Issue 时请包含：
1. 操作系统及版本
2. 应用版本（菜单 → 关于）
3. 复现步骤
4. 预期行为 vs 实际行为
5. 相关日志文件（`~/AI-GM/logs/`）

---

> 本指南最后更新于：2026-07-08
