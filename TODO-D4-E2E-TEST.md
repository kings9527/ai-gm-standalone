# AI-GM Standalone D4 全功能走查测试报告
## 测试时间: 2026-07-09 04:00 UTC
## 测试范围: 创建模组 → VN 叙事 → 战斗系统 → 存档/读档 → 设置 → 图片管理

---

## 🔴 Critical Bugs (阻塞性功能缺陷)

### BUG-1: 存档 API 字段名不一致导致创建失败
- **位置**: `backend/src/routes/saves.js` POST handler
- **问题**: 后端期望字段 `campaign` (对象/string)，但 `saveStore.ts` 中 `autoSave` 发送的是 `{ id, module_id, slot_number, name, campaign }`，而 `SaveLoadPanel` 和 `gameStore` 中 `GameSave` 类型定义的是 `campaign` 对象。然而测试中发现当直接 POST `campaign_json` 时会报 `NOT NULL constraint failed`。
- **根因**: 路由层做了 `typeof campaign === 'string' ? campaign : JSON.stringify(campaign)` 存入 `campaign_json`，但前端代码中某些地方可能误传 `campaign_json` 字段。
- **修复建议**: 在路由层统一接受 `campaign` 字段，拒绝 `campaign_json` 入参；同时更新前端所有调用方确保发送 `campaign`。

### BUG-2: Settings API 扁平键与前端嵌套结构不匹配
- **位置**: `backend/src/routes/settings.js` ↔ `frontend/src/stores/settingsStore.ts`
- **问题**: 后端存储的是扁平 key-value（如 `llm.provider`、`theme.mode`），但 `settingsStore` 使用的是嵌套对象结构 `{ llm: {...}, image: {...}, game: {...}, theme: {...} }`。`saveToBackend` 将整个嵌套对象序列化后存入一个 key `aigm_settings_v1`，丢失了按 key 查询的能力。
- **根因**: 设计不一致。后端 `/api/settings` 支持按 key 读写，但前端 Store 把所有设置打包成一个 JSON blob 存储。
- **修复建议**: 方案A) 前端 Store 改为扁平化存储，按 key 调用 `/api/settings`；方案B) 后端新增 `/api/settings/batch` 支持嵌套对象的原子写入。

### BUG-3: LLM Chat API 缺少 provider 时返回不友好错误
- **位置**: `backend/src/routes/llm.js`
- **问题**: `POST /api/llm/chat` 时若 body 中 `provider` 缺失，返回 `Unknown provider: undefined`，HTTP 状态码 500（内部错误）。
- **根因**: 没有前置校验必填字段。
- **修复建议**: 在 switch 前增加 `if (!provider) return res.status(400).json({ error: 'provider is required' })`。

### BUG-4: `CombatOverlay.tsx` 文件可能截断/损坏
- **位置**: `frontend/src/components/combat/CombatOverlay.tsx`
- **问题**: 读取时内容在约 10337 字符处截断，后续代码不可见。虽然可能是 read 工具限制，但需确认文件完整性。
- **根因**: 不确定是文件本身问题还是工具限制。
- **修复建议**: 验证文件实际大小和 MD5，确认是否完整。

---

## 🟠 High Priority Bugs (功能可用但体验差/有隐患)

### BUG-5: `GameStateMachine` 直接修改 campaign 对象（副作用）
- **位置**: `frontend/src/engine/state-machine.ts`
- **问题**: `transitionTo`、`applyEventEffects`、`updatePlayer` 等方法直接修改 `this.campaign` 的属性（如 `this.campaign.scene_history.push(...)`），而不是返回新状态。这与 Zustand 的不可变更新哲学冲突，可能导致 React 不重新渲染。
- **修复建议**: 所有状态变更方法返回新的 campaign 对象副本，由调用方 `setCampaign` 更新。

### BUG-6: `NPCDecisionEngine` 构造函数中修改 campaign
- **位置**: `frontend/src/engine/npc-decision.ts` `_ensureNPCState`
- **问题**: `constructor` 中直接修改 `this.campaign.npcs_state`（如 `if (!campaign.npcs_state) campaign.npcs_state = {}`），属于副作用。
- **修复建议**: 在构造函数中只做读取，初始化逻辑移到单独的 `init()` 方法，由调用方显式执行。

### BUG-7: 加密工具使用简单 XOR，安全性不足
- **位置**: `frontend/src/utils/crypto.ts`
- **问题**: API Key 使用固定 XOR key + base64 混淆，易被逆向。`isEncrypted()` 仅检查是否能 `atob`，误报率高。
- **修复建议**: 在生产环境中使用 Electron `safeStorage` 或 OS keychain；web 环境使用 Web Crypto API 的 AES-GCM。

### BUG-8: `ImageSelector` 搜索参数拼接方式有问题
- **位置**: `frontend/src/components/image-selector/ImageSelector.tsx`
- **问题**: `electronAPI.imageSearch(searchQuery + (searchType ? `&type=${searchType}` : ''))` 直接将 `&type=` 拼接到搜索词后，导致搜索词本身包含 `&` 或 `?` 时破坏查询参数结构。
- **修复建议**: 使用 URLSearchParams 构造查询字符串。

### BUG-9: VN 引擎自动存档无防抖
- **位置**: `frontend/src/components/engine/VisualNovelEngine.tsx`
- **问题**: 场景切换时通过 `useEffect` + `requestAnimationFrame` 立即触发 `onAutoSave`，若玩家快速切换场景（如按 ESC 反复进出），会产生大量存档。
- **修复建议**: 添加 debounce（如 2 秒内只存档一次）或仅在关键节点存档（战斗开始、章节结束）。

### BUG-10: 战斗系统 `executeAndAdvance` 中状态更新可能丢失
- **位置**: `frontend/src/components/combat/CombatOverlay.tsx`
- **问题**: `executeAndAdvance` 使用 `setCombatState((prev) => { ... setIsProcessing(false); return newState; })`，`setIsProcessing(false)` 在同步代码中调用，但在 React 的 batched updates 中可能不会被立即执行。
- **修复建议**: 将 `setIsProcessing(false)` 移到 `useEffect` 中，或在 `setCombatState` 回调外使用 `flushSync`。

### BUG-11: 数据库缺少索引
- **位置**: `backend/src/db/sqlite.js`
- **问题**: `saves` 表按 `module_id` 查询频繁，但无索引。`images` 表按 `type` 查询也无索引。
- **修复建议**: 在 `init()` 中添加 `CREATE INDEX IF NOT EXISTS idx_saves_module_id ON saves(module_id)` 和 `idx_images_type ON images(type)`。

---

## 🟡 Medium Priority Bugs (边界情况/小缺陷)

### BUG-12: `handleAdvance` 始终选择第一个 exit
- **位置**: `frontend/src/components/engine/VisualNovelEngine.tsx`
- **问题**: 点击对话推进时，`handleAdvance` 总是取 `currentScene.exits[0]`，玩家无法选择出口。
- **当前行为**: 单一路线自动推进。
- **预期**: 若有多条 exit，应展示选择；若无 exit，应提示章节结束。

### BUG-13: SettingsPage 表单验证 regex 过于严格
- **位置**: `frontend/src/components/settings/SettingsPage.tsx`
- **问题**: API Key 正则 `/^(sk-|Bearer\s)?[A-Za-z0-9_-]{20,}$/` 可能拒绝某些 provider 的 key（如 Ollama 不需要 key、某些 key 包含特殊字符）。
- **修复建议**: 按 provider 分别验证，Ollama 时 key 可选。

### BUG-14: `html-to-image` 动态导入无错误边界
- **位置**: `frontend/src/components/engine/VisualNovelEngine.tsx`
- **问题**: `import('html-to-image')` 失败时（如网络问题），缩略图生成降级为使用背景图，但无用户提示。
- **修复建议**: 添加静默降级提示或预加载依赖。

### BUG-15: `DiceRoller` 正则无法解析复杂表达式
- **位置**: `frontend/src/engine/dice.ts`
- **问题**: `_parseExpression` 使用 `/([+-]?)(\d+)(?:d(\d+))?/g`，无法解析括号、乘除、或 `2d6+1d4+3` 之外的标准骰子表达式。`1d6*2` 或 `(1d6+3)*2` 会失败。
- **修复建议**: 引入骰子表达式解析库（如 `dice-roller-parser`）或重写解析器支持括号优先级。

### BUG-16: `combat-system.ts` 中 `executeAIAction` 的 skill 选择逻辑有 bug
- **位置**: `frontend/src/engine/combat-system.ts`
- **问题**: `skillPool = ['brawl', 'firearm', 'desperate_strike']` 中的 `desperate_strike` 消耗 SAN，但 AI 随机选择时可能选到它导致自伤。
- **修复建议**: AI 技能池应按实体类型过滤（敌人不应使用 `desperate_strike`）。

---

## 🟢 UX / 体验问题 (非阻塞性)

### UX-1: 删除模组/存档无二次确认
- **影响**: 误触导致数据丢失。
- **建议**: 添加 `confirm()` 或自定义确认弹窗。

### UX-2: 战斗中无键盘快捷键
- **影响**: 纯鼠标操作效率低。
- **建议**: 1-4 数字键选择技能，ESC 打开菜单，空格确认。

### UX-3: 设置页面无实时预览
- **影响**: 调整字体大小、打字机速度后无法即时看到效果。
- **建议**: 在设置页面添加 VN 预览区域。

### UX-4: 图片搜索无分页
- **影响**: 大量结果时页面卡顿。
- **建议**: 添加虚拟滚动或分页。

### UX-5: 无存档缩略图占位图
- **影响**: 存档列表中无缩略图时显示空白。
- **建议**: 添加默认占位图或场景标题文字。

### UX-6: 无音效/音量控制
- **影响**: 游戏沉浸感不足。
- **建议**: 添加打字机音效、BGM、战斗音效，设置中增加音量滑块。

### UX-7: 无全屏模式
- **影响**: 浏览器标题栏和任务栏影响沉浸感。
- **建议**: 添加全屏切换按钮（Fullscreen API）。

### UX-8: Toast 通知无上限
- **影响**: 快速触发多个操作时 toast 堆叠过多。
- **建议**: 限制最大显示数量为 5，新 toast 替换旧的。

### UX-9: 模组导入无进度指示
- **影响**: 大模组（多场景、多图片）导入时页面假死。
- **建议**: 添加进度条或分步导入。

### UX-10: 战斗日志不自动滚动
- **影响**: 长战斗中需要手动滚动查看最新日志。
- **建议**: 日志更新时自动滚动到底部。

---

## 🧪 测试结果汇总

| 功能模块 | 测试状态 | 备注 |
|---------|---------|------|
| 后端启动 | ✅ PASS | Node 进程正常，端口 9742 |
| 前端构建 | ✅ PASS | dist/ 目录存在，index.html 正常 |
| 模组创建 (POST /api/modules) | ✅ PASS | 返回正确 id |
| 模组读取 (GET /api/modules/:id) | ✅ PASS | content/style JSON 反序列化正常 |
| 模组导入 (POST /api/modules/import) | ✅ PASS | demo-module.json 导入成功 |
| Demo 模组加载 | ✅ PASS | 场景、NPC、对话结构完整 |
| VN 场景切换 | ⚠️ PARTIAL | exits[0] 自动推进，无选择 UI |
| 战斗系统初始化 | ✅ PASS | initCombat 生成正确状态 |
| 战斗回合流转 | ✅ PASS | DEX 排序、AI 行动、回合推进正常 |
| 战斗结束检测 | ✅ PASS | victory/defeat/fled 判定正常 |
| 存档创建 (POST /api/saves) | ✅ PASS | 字段修正后成功 (使用 `campaign`) |
| 存档读取 (GET /api/saves) | ✅ PASS | 反序列化正常 |
| 设置读写 (POST/GET /api/settings) | ⚠️ PARTIAL | 扁平 key 存储，嵌套结构不兼容 |
| 图片搜索 (GET /api/images/search) | ✅ PASS | picsum 占位图返回正常 |
| 图片下载 (POST /api/images/download) | ✅ PASS | 下载并保存到 ~/AI-GM/images/ |
| 图片列表 (GET /api/images) | ✅ PASS | 返回已下载图片 |
| LLM Chat (POST /api/llm/chat) | ❌ FAIL | provider 缺失时 500 错误，未配置 key 时 500 |
| LLM Stream (POST /api/llm/stream) | ⚠️ UNTESTED | 需配置真实 API key |
| 模组验证器 | ✅ PASS | demo-module 通过验证 |
| NPC 决策引擎 | ⚠️ PARTIAL | 规则驱动部分正常，LLM 增强未测试 |
| 骰子系统 | ✅ PASS | 基础表达式解析正常 |

---

## 📋 优先修复建议 (按影响排序)

1. **BUG-1** (存档字段) + **BUG-2** (Settings 结构) — 数据持久化核心，影响所有用户。
2. **BUG-3** (LLM 错误处理) — 提升 API 健壮性。
3. **BUG-5/6** (状态机副作用) — 可能导致 React 渲染 bug 和数据不一致。
4. **BUG-7** (加密安全性) — 生产环境必须修复。
5. **BUG-9** (自动存档防抖) — 防止存档泛滥。
6. **BUG-11** (数据库索引) — 性能优化，低成本高收益。
7. **UX-1** (删除确认) — 防止误操作数据丢失。
8. **BUG-15** (骰子解析) — 影响战斗数值计算准确性。

---

## 📝 后续 TODO

- [ ] 编写 `combat-system.ts` 的单元测试（覆盖 initCombat、executeAttack、advanceTurn、checkCombatEnd）
- [ ] 编写 `state-machine.ts` 的单元测试（覆盖场景切换、事件触发、骰子检定）
- [ ] 编写 `npc-decision.ts` 的单元测试（覆盖规则决策、态度转换）
- [ ] 添加 API 集成测试（使用 supertest）
- [ ] 添加 VN 引擎组件的 Storybook  stories
- [ ] 实现设置页面的嵌套结构 ↔ 扁平 key 的自动转换层
- [ ] 替换 `crypto.ts` 为 Web Crypto API 实现
- [ ] 添加数据库迁移框架（如 `better-sqlite3` + 版本化迁移脚本）
