# AI-GM Standalone — Electron Desktop App

## 架构概览

```
ai-gm-standalone/
├── electron/               # Electron 主进程
│   ├── main.js             # 主进程入口
│   ├── preload.js          # 预加载脚本（安全 IPC 桥接）
│   └── ipc-handlers.js     # IPC 处理器（LLM/文件/数据库）
├── backend/                # Node.js 后端 API
│   ├── src/
│   │   ├── index.js        # Express 服务器
│   │   ├── routes/
│   │   │   ├── llm.js      # LLM 代理（OpenAI/Claude/Ollama）
│   │   │   ├── modules.js  # 模组 CRUD + 导入/导出
│   │   │   ├── saves.js    # 存档管理
│   │   │   ├── images.js   # 图片存储/搜索/生成
│   │   │   └── settings.js # 配置管理
│   │   ├── db/
│   │   │   └── sqlite.js   # SQLite 数据库封装
│   │   ├── services/
│   │   │   ├── llm-proxy.js     # LLM 请求代理 + 重试
│   │   │   ├── image-service.js # 图片搜索(Unsplash) + 生成(DALL-E/SD)
│   │   │   └── module-parser.js # 模组 JSON 校验/解析
│   │   └── utils/
│   │       └── sanitize.js # 输入消毒
│   └── package.json
├── frontend/               # React 渲染进程
│   └── src/
│       ├── api/            # 后端 API 客户端（fetch wrapper）
│       ├── engine/         # 游戏引擎（复用旧项目）
│       ├── llm/            # LLM 客户端（调用后端代理）
│       ├── stores/         # Zustand 状态管理
│       ├── components/     # UI 组件
│       └── types/          # TypeScript 类型
└── docs/
    └── architecture.md
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 33+ |
| 前端 | React 18 + Vite + TypeScript + Tailwind CSS |
| 状态 | Zustand |
| 动画 | framer-motion |
| 图标 | lucide-react |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 图片 | Unsplash API / 本地存储 / 可选 DALL-E |
| LLM | OpenAI / Claude / Ollama（后端代理，Key 不暴露给前端） |

## Electron 通信模型

```
┌─────────────────┐     IPC      ┌─────────────────┐     HTTP     ┌─────────────────┐
│  Renderer       │◄────────────►│  Main Process   │◄────────────►│  Express API    │
│  (React SPA)    │  (preload)   │  (electron/main)│  (localhost)  │  (backend/src)  │
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

### IPC Channels

| Channel | 方向 | 用途 |
|---------|------|------|
| `aigm:llm:chat` | R→M→R | LLM 对话（后端代理） |
| `aigm:llm:stream` | R→M→R | LLM 流式响应 |
| `aigm:module:list` | R→M→R | 获取模组列表 |
| `aigm:module:save` | R→M→R | 保存模组 |
| `aigm:module:load` | R→M→R | 读取模组 |
| `aigm:module:import` | R→M→R | 导入模组文件 |
| `aigm:module:export` | R→M→R | 导出模组文件 |
| `aigm:save:list` | R→M→R | 存档列表 |
| `aigm:save:write` | R→M→R | 写入存档 |
| `aigm:save:read` | R→M→R | 读取存档 |
| `aigm:image:search` | R→M→R | 图片搜索 |
| `aigm:image:download` | R→M→R | 下载图片到本地 |
| `aigm:image:generate` | R→M→R | AI 生成图片 |
| `aigm:settings:get` | R→M→R | 读取配置 |
| `aigm:settings:set` | R→M→R | 写入配置 |
| `aigm:path:userData` | R→M→R | 获取用户数据目录 |

## 数据存储

### SQLite Schema

```sql
-- 模组表
CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author TEXT,
  version TEXT,
  system TEXT DEFAULT 'coc',
  description TEXT,
  content_json TEXT NOT NULL,  -- 完整模组 JSON
  style_json TEXT,             -- 风格配置
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 存档表
CREATE TABLE saves (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  slot_number INTEGER,
  name TEXT,
  campaign_json TEXT NOT NULL, -- Campaign 状态 JSON
  screenshot BLOB,             -- 存档截图（可选）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 配置表
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 图片缓存表
CREATE TABLE images (
  id TEXT PRIMARY KEY,
  type TEXT, -- 'bg', 'sprite', 'portrait'
  source TEXT, -- 'unsplash', 'generated', 'uploaded'
  url TEXT,
  local_path TEXT,
  prompt TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 文件系统布局

```
~/AI-GM/                          # 用户数据目录
├── modules/                      # 模组文件
│   ├── module-id-1/
│   │   ├── module.json
│   │   └── style.json
│   └── ...
├── saves/                        # 存档
│   ├── save-id-1.json
│   └── ...
├── images/                       # 图片缓存
│   ├── bg/
│   ├── sprites/
│   └── portraits/
└── ai-gm.db                      # SQLite 数据库
```

## LLM 代理安全模型

```
前端 ──IPC──► 主进程 ──HTTP──► Express ──fetch──► OpenAI/Claude/Ollama
     │            │              │
     │            │              └── API Key 存储在 SQLite settings 表
     │            │                  （加密或系统 keychain）
     │            └── 前端无法直接访问 Key
     └── 仅通过预定义 IPC 通道通信
```

## 开发流程

### Day 1 (7/6) — 架构重写 + Electron 骨架
- [x] 确认 Electron 架构
- [ ] Electron 主进程 + 预加载脚本
- [ ] Express 后端骨架（路由注册）
- [ ] SQLite 数据库初始化
- [ ] IPC 通道定义

### Day 2 (7/7) — 后端核心 + 前端接入
- [ ] LLM 代理路由（/llm/chat, /llm/stream）
- [ ] 模组 CRUD 路由
- [ ] 存档管理路由
- [ ] 前端 API 客户端（通过 IPC）
- [ ] 引擎复用测试

### Day 3 (7/8) — 视觉小说引擎
- [ ] BackgroundLayer（本地图片加载）
- [ ] SpriteLayer（本地立绘）
- [ ] DialogueLayer（打字机 + 选项）
- [ ] EffectLayer
- [ ] VisualNovelEngine 编排器

### Day 4 (7/9) — 模组生成器
- [ ] 上传组件（文件/粘贴）
- [ ] AI 文本分析 → 模组 JSON
- [ ] 问题流追问

### Day 5 (7/10) — 风格分析 + 图片
- [ ] StyleAnalyzer 接入 LLM 代理
- [ ] 动态 CSS 主题
- [ ] Unsplash 搜索 + 本地缓存
- [ ] AI 图片生成（DALL-E/SD）

### Day 6 (7/11) — 模组导入/导出
- [ ] JSON 导出/导入
- [ ] URL Hash 分享
- [ ] 剪贴板分享

### Day 7 (7/12) — 存档系统
- [ ] 存档槽位 UI
- [ ] 存档/读档
- [ ] 存档截图

### Day 8 (7/13) — 设置 + 配置
- [ ] LLM Key 配置（安全存储）
- [ ] 主题切换
- [ ] 字体/速度设置

### Day 9 (7/14) — 战斗插件
- [ ] 战斗状态机
- [ ] 回合制 UI
- [ ] 伤害计算

### Day 10 (7/15) — Polish
- [ ] 动画优化
- [ ] 错误处理
- [ ] 性能优化

### Day 11-14 (7/16-7/19) — 缓冲
- [ ] Bug 修复
- [ ] 测试
- [ ] 打包分发

## 打包分发

```bash
# 开发
npm run dev          # Vite dev server + Electron

# 构建
npm run build        # 前端 build + 后端 build
npm run dist         # Electron Builder 打包

# 输出
dist/
├── AI-GM-Standalone-1.0.0.AppImage    # Linux
├── AI-GM-Standalone-1.0.0.exe         # Windows
└── AI-GM-Standalone-1.0.0.dmg         # macOS
```
