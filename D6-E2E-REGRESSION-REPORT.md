# AI-GM Standalone D6 E2E 回归测试报告

**任务**: 验证 BUG-1~11 修复点是否正常工作
**代码基线**: main @ `6f8bd71` (v1.0.0 release)
**测试耗时**: ~35 分钟
**测试方式**: 代码审查 + 文件级回归验证

---

## 关键结论

**11 个 bug 中，6 个已确认修复，2 个部分修复/缓解，3 个未修复。**

D5 计划修复的 BUG-1/2/3/11 已实际合并到 main 分支；BUG-5/6 修复未成功落地（D5 cron 记录显示 edit 匹配失败）；BUG-8/12/15/16 在 D4~D5 计划中未覆盖，本次回归发现仍未修复。

---

## 逐 Bug 验证结果

| Bug | 描述 | 状态 | 验证详情 |
|-----|------|------|----------|
| BUG-1 | 存档 API 字段不一致 (`campaign` vs `campaign_json`) | ✅ **已修复** | `backend/src/routes/saves.js` POST 统一接收 `body.campaign`，自动 `JSON.stringify` 存入 `campaign_json`；GET 时自动解析并删除 `campaign_json` 字段。前端 `saveStore.ts` 发送 `campaign` 对象。 |
| BUG-2 | Settings 前后端结构不匹配 | ✅ **已修复** | `backend/src/routes/settings.js` 新增嵌套对象模式：非 `{key, value}` 入参时自动 `flatten()` 后批量存储；GET 时 `unflatten()` 返回嵌套对象。`settingsStore.ts` 的 `saveToBackend`/`loadFromBackend` 已适配新 API。`backend/src/utils/settings-serializer.js` 存在。 |
| BUG-3 | LLM Chat 缺 provider 时 500 | ✅ **已修复** | `backend/src/routes/llm.js` 的 `/chat` 与 `/stream` 均有前置校验：`if (!provider || typeof provider !== 'string') return res.status(400).json({ error: 'provider is required' })`。 |
| BUG-4 | `CombatOverlay.tsx` 文件截断 | ✅ **无法复现** | 文件读取完整，无截断。`CombatOverlay.tsx` 约 470 行，逻辑完整。 |
| BUG-5 | `GameStateMachine` 直接修改 `campaign` 对象 | ❌ **回归 — 未修复** | `frontend/src/engine/state-machine.ts` 中 `transitionTo` 直接 `this.campaign.scene_history.push(...)` 和 `this.campaign.current_scene = ...`；`performSanityCheck` 直接修改 `this.campaign.player.sanity`；`applyEventEffects` 直接修改 `this.campaign.global_vars` 和 `this.campaign.player.sanity`。所有状态变更均为 mutation，未返回新对象。与 Zustand 不可变更新冲突。 |
| BUG-6 | `NPCDecisionEngine` 构造函数修改 `campaign` | ⚠️ **部分修复** | 构造函数已改为 `this.campaign = { ...campaign, npcs_state: { ... } }`，不再直接修改原始传入对象。但 `_ensureNPCState` 仍修改 `this.campaign.npcs_state`，且 `updateState` 等方法的副作用不返回给调用者，NPC 状态变更无法同步回 Zustand。 |
| BUG-7 | 加密用简单 XOR + base64 | ✅ **已修复** | `frontend/src/utils/crypto.ts` 全面替换为 Web Crypto API：`AES-256-GCM` + `PBKDF2`（100k iterations），格式为 `aigm:v2:<salt>:<iv>:<cipher>`。`isEncrypted()` 检测前缀。 |
| BUG-8 | `ImageSelector` 搜索参数拼接 | ❌ **未修复** | `frontend/src/components/image-selector/ImageSelector.tsx:170` 仍为 `electronAPI.imageSearch(searchQuery + (searchType ? `&type=${searchType}` : ''))`，未使用 `URLSearchParams`。搜索词含 `&`/`?` 时会破坏查询结构。 |
| BUG-9 | VN 引擎自动存档无防抖 | ✅ **已修复** | `frontend/src/components/engine/VisualNovelEngine.tsx` 已实现 `debouncedAutoSave`（800ms 延迟），使用 `autoSaveTimerRef` 和 `pendingAutoSaveRef` 管理。组件卸载时清理定时器。 |
| BUG-10 | combat `executeAndAdvance` 状态竞争 | ✅ **已修复** | `frontend/src/components/combat/CombatOverlay.tsx` 的 `executeAndAdvance` 使用 `setTimeout(() => setIsProcessing(false), 0)` 打破 React 18 自动批处理，确保 `isProcessing` 状态至少渲染一次。注释明确说明修复意图。 |
| BUG-11 | 数据库 `saves`/`images` 缺少索引 | ✅ **已修复** | `backend/src/db/sqlite.js` 的 `init()` 中已创建：`idx_saves_module`、`idx_saves_module_created_at`、`idx_images_type`、`idx_images_type_created_at`。 |

---

## 回归中额外发现的未修复问题

| Bug | 描述 | 状态 | 位置 |
|-----|------|------|------|
| BUG-12 | `handleAdvance` 始终选择第一个 exit | ❌ 未修复 | `VisualNovelEngine.tsx:handleAdvance` 固定取 `currentScene.exits[0]`，无多出口选择 UI。 |
| BUG-15 | `DiceRoller` 正则无法解析复杂表达式 | ❌ 未修复 | `frontend/src/engine/dice.ts` 仍用 `/([+-]?)(\d+)(?:d(\d+))?/g`，不支持 `1d6*2`、`(1d6+3)*2` 等表达式。 |
| BUG-16 | AI `executeAIAction` 技能选择有 bug | ❌ 未修复 | `frontend/src/engine/combat-system.ts` 的 `skillPool` 包含 `desperate_strike`（消耗 SAN），AI 随机选择时可能自伤。未按实体类型过滤。 |
| BUG-13 | SettingsPage API Key regex 过于严格 | ⚠️ 部分缓解 | `SettingsPage.tsx` 的 regex 仍为 `/^(sk-|Bearer\s)?[A-Za-z0-9_-]{20,}$/`，但 Ollama 可留空绕过验证。未按 provider 分别校验。 |
| BUG-14 | `html-to-image` 动态导入无错误边界 | ⚠️ 部分存在 | `VisualNovelEngine.tsx` 中 `getToPng()` 失败时有 try/catch 降级为使用背景图，但无用户提示（toast/日志）。 |

---

## 不可变性测试详情（BUG-5 / BUG-6）

通过代码审查确认以下 mutation 点：

**BUG-5 证据（`state-machine.ts`）：**
- `transitionTo:299` — `this.campaign.scene_history.push(sceneId)`
- `transitionTo:300` — `this.campaign.current_scene = sceneId`
- `transitionTo:304` — `this.campaign.combat_state = null`
- `performSanityCheck:235` — `this.campaign.player.sanity = Math.max(0, ...)`
- `performSanityCheck:240` — `this.campaign.player.status_effects.push(...)`
- `applyEventEffects:258` — `this.campaign.global_vars[baseKey] = ...`
- `applyEventEffects:264` — `this.campaign.player.sanity = ...`
- `handleInteract:337` — `this.campaign.player.inventory.push(...)`
- `checkSceneEvents:181` — `this.campaign.global_vars[eventKey] = true`

**BUG-6 证据（`npc-decision.ts`）：**
- `_ensureNPCState:95` — `this.campaign.npcs_state[npcId] = {...}`（修改内部副本，但副本不返回）
- `_ruleBasedDecision:308` — `npc.fear = Math.min(...)`、`npc.trust = Math.max(...)`
- `_updateAttitudeFromDecision:550` — `this.npcState.attitude = ...`
- `updateState:640` — `npc.current_hp = ...`、`npc.trust = ...` 等

---

## 根因分析（D5 修复未落地问题）

D5 cron 任务日志记录：
- 12:00 任务（BUG-5）: `edit 匹配失败`
- 15:00 任务（BUG-8）: `edit 匹配失败`
- 18:00 任务（BUG-10）: `edit 匹配失败`

说明 D5 计划中的 3 个修复（BUG-5/8/10）因 `edit` 工具文本匹配失败未能写入代码。本次回归验证确认 BUG-10 实际上在 D6 的 `CombatOverlay.tsx` 重构中已自然修复（通过 `setTimeout(..., 0)` 模式），但 BUG-5 和 BUG-8 仍为未修复状态。

---

## 建议

### 高优先级（影响数据一致性 / 稳定性）
1. **重新修复 BUG-5** — `state-machine.ts` 需要全面重构为不可变更新模式：
   - 所有 mutation 方法改为返回新的 `campaign` 对象（使用 `{...campaign, player: {...}}` 或 `structuredClone`）
   - 调用方（`gameStore` / `VisualNovelEngine`）使用 `setCampaign(newCampaign)` 更新 Zustand
   - 如重构面广，可先标记为 D7 专项任务

2. **修复 BUG-6 状态同步** — `NPCDecisionEngine` 需要暴露 `getUpdatedCampaign()` 方法，让调用方获取修改后的 `npcs_state` 并更新 Zustand。

### 中优先级（功能缺陷）
3. **修复 BUG-8** — `ImageSelector.tsx` 的 `handleSearch` 使用 `URLSearchParams` 构造查询字符串。
4. **修复 BUG-12** — 当 `exits.length > 1` 时，展示出口选择 UI 而非自动取第一个。
5. **修复 BUG-16** — `executeAIAction` 的 `skillPool` 按实体类型过滤（敌人不应使用 `desperate_strike`）。

### 低优先级（体验/边缘情况）
6. **修复 BUG-15** — 引入骰子表达式解析库（如 `dice-roller-parser`）或扩展正则支持乘除和括号。
7. **修复 BUG-13** — 按 provider 分别校验 API Key 格式（Ollama 时跳过 key 校验）。
8. **修复 BUG-14** — `html-to-image` 加载失败时添加静默 toast 提示。

---

## 测试覆盖建议

当前项目无 `npm test` 脚本。建议添加测试框架：
- `state-machine.ts` 不可变性测试（使用 `Object.isFrozen` 或深比较）
- `combat-system.ts` 核心战斗流转测试（`initCombat` → `executeAttack` → `advanceTurn` → `checkCombatEnd`）
- `settings.js` 嵌套对象 ↔ 扁平 key 的 round-trip 测试
- `saves.js` 存档读写 round-trip 测试

---

*Report generated by D6 E2E regression cron task.*
*Codebase: ai-gm-standalone @ `6f8bd71`*
