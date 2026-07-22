# AI-GM Standalone v1.0.0

> 首个正式版本发布。基于 Electron + React 的纯前端 AI-GM 游戏引擎，支持自然语言驱动的视觉小说、战斗系统、存档管理、NPC 自主决策等功能。

## 构建产物

| 平台 | 文件名 | 状态 |
|------|--------|------|
| Linux | `AI-GM Standalone-1.0.0.AppImage` | ✅ 可用 |
| Linux | `ai-gm-standalone_1.0.0_amd64.deb` | ✅ 可用 |
| Windows | `AI-GM Standalone 1.0.0.exe` | ⚠️ 未签名（无代码签名证书） |
| Windows | `AI-GM Standalone Setup 1.0.0.exe` | ⚠️ 未签名（无代码签名证书） |
| macOS | — | ❌ 未构建 |

---

## Phase 1: VN 引擎核心 & 自然语言输入系统 (7/1 ~ 7/3)
- **项目初始化** — Electron + React + Vite + TypeScript 架构
- **Phase 1-A** — VN 对话框 UI 改造：打字机效果、多色角色名、头像显示、历史面板
- **Phase 1-B** — Zustand 状态层扩展：输入系统、打字状态管理
- **Phase 1-C** — IntentParser 意图解析模块：自然语言命令识别
- **Phase 1-D** — 闲聊模式实现
- **Phase 1-E** — 行动模式实现：行动处理器、模态切换
- **Phase 1-F** — 输入历史与上下文管理
- **Phase 1-G** — 自由输入 + 图片联动桥接
- **Phase 1-H** — 代码清理：移除 console.warn，eslint + tsc 全绿

## Phase 2: 自然语言化改造 & 系统扩展 (7/3 ~ 7/5)
- **Phase 2-A** — 规则判定引擎自然语言化改造
- **Phase 2-B/C/D** — 战斗/事件/存档系统自然语言触发
- **Phase 2-E** — 设置面板自然语言触发
- **Phase 2-F** — NPC 自由对话系统
- **Phase 2-G** — 场景探索自然语言增强
- **Phase 2-H** — 集成测试 + 代码清理

## Phase 3: AI 叙事引擎 & 世界动态 (7/5 ~ 7/8)
- **Phase 3-A** — LLM 动态选项生成
- **Phase 3-B** — NPC 自主决策系统
- **Phase 3-C** — LLM 驱动剧情推进引擎
- **Phase 3-D** — NPC 长期对话上下文记忆
- **Phase 3-E** — 情绪/氛围引擎
- **Phase 3-F** — 任务/目标系统
- **Phase 3-G** — 世界动态响应
- **Phase 3-H** — 集成测试 + 代码清理

## Phase 4: 性能优化、Bug 修复与发布准备 (7/8 ~ 7/20)
- **BUG-1** — 统一存档 API 中 campaign 字段命名
- **BUG-2** — 统一 Settings 前后端序列化/反序列化逻辑（扁平 key-value ↔ 嵌套对象）
- **BUG-3** — LLM Provider 路由增加必填校验
- **BUG-6** — NPCDecisionEngine 构造函数改为不可变更新
- **BUG-7** — 加密方案升级：XOR+base64 → Web Crypto API AES-256-GCM
- **BUG-9** — 自动存档添加防抖，防止快速切场景时存档泛滥
- **BUG-10** — 修复 combat 状态竞争条件
- **BUG-11** — saves 和 images 表添加复合索引
- **D6 UX 打磨** — 战斗键盘快捷键、全屏模式、音效开关、删除确认模态框
- **D6 性能优化** — 路由级代码分割、手动 chunk 拆分、CombatOverlay 懒加载
- **D7 Hotfix** — 修复 P1 全屏同步、P2 Escape 竞态、P4 存档错误吞异常
- **CI/CD** — GitHub Actions 多平台构建工作流
- **Phase 4 最终整合** — LLM 提供商扩展（Kimi/DeepSeek/Qwen/GLM/Gemini/自定义）
- **打包发布** — Electron Builder Windows/Linux 桌面端打包

---

## 已知问题

1. **Windows 版本未签名**：缺少代码签名证书，安装时可能触发 Windows SmartScreen 警告。
2. **macOS 版本未构建**：需 macOS 环境或 CI 中的 macOS runner 才能构建 `.dmg`。
3. **Phase 1-G 图片生成功能**：依赖外部图片 API，需自行配置 key。

## 技术栈

- **前端框架**: React 18 + Vite + TypeScript
- **状态管理**: Zustand
- **UI 组件**: shadcn/ui + Tailwind CSS
- **桌面端**: Electron + electron-builder
- **后端服务**: Node.js + Express + SQLite
- **AI 集成**: LLM 动态选项生成、NPC 自主决策、情绪/氛围引擎、多提供商支持
