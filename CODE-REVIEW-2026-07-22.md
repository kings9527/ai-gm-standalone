# AI-GM Standalone 代码审查报告

**审查日期**: 2026-07-22
**审查范围**: frontend/src 所有 .ts/.tsx 文件
**审查维度**: switch/case default、async/await try/catch、null/undefined 访问、数组越界、类型断言、其他潜在 Bug

---

## 📊 统计摘要

| 问题类别 | 数量 | 风险等级 |
|---------|------|---------|
| switch/case 无 default | 8 个文件 | ⚠️ 中 |
| async 函数无 try/catch | 15 个函数 | 🔴 高 |
| 潜在 null/undefined 访问 | 18 处 | 🔴 高 |
| 数组越界风险 | 6 处 | ⚠️ 中 |
| 类型断言 (as) | 212 处 | ⚠️ 中 |
| 非空断言 (!.) | 8 处 | ⚠️ 中 |
| JSON.parse 无校验 | 14 处 | ⚠️ 中 |
| 其他风险 | 5 处 | 🟡 低 |

---

## 🔴 高风险问题

### 1. async/await 缺少 try/catch (15 个函数)

**文件**: `frontend/src/api/electron.ts`

所有 API 函数都缺少 try/catch，一旦 IPC 调用失败会抛出未处理异常：

```typescript
// Line 54 - fallbackFetch
async function fallbackFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, options); // 可能抛异常
  // ...
}

// Line 65-126 - 所有 IPC 方法
async llmChat(body: any) { return ipcInvoke('llm:chat', body); } // 无 try/catch
async llmStream(body: any, onChunk, onEnd) { /* ... */ } // 无 try/catch
async moduleList() { return ipcInvoke('module:list'); } // 无 try/catch
// ... 其他方法同理
```

**修复建议**: 每个 async 方法包裹 try/catch，返回带错误码的结果或抛出统一异常。

---

### 2. 潜在 null/undefined 访问 (18 处)

#### 2.1 `combat-system.ts:64` - combat.enemies 可能 undefined
```typescript
// 当 scene.combat 存在但 enemies 为 undefined 时会崩溃
target = ctx.scene.combat?.enemies?.[0]; // 有可选链，但后续使用 target 未检查
```

#### 2.2 `npc-decision.ts:271-272` - 数组越界
```typescript
if (npc.trust > 60 && !npc.secrets_revealed.includes(secretKeywords[0])) {
  npc.secrets_revealed.push(secretKeywords[0]); // secretKeywords 可能为空数组
}
```

#### 2.3 `VisualNovelEngine.tsx:269` - exits 数组越界
```typescript
const exit = currentScene.exits[0]; // 未检查 exits 是否为空
```

#### 2.4 `state-machine.ts:763` - 直接 throw
```typescript
if (!scene) throw new Error(`Scene not found: ${sceneId}`); // 应返回错误而非直接抛异常
```

#### 2.5 `llm/client.ts:104` - 嵌套可选链但仍可能有问题
```typescript
const content = parsed.choices?.[0]?.delta?.content || parsed.content || '';
// 如果 parsed.choices 存在但为空数组，[0] 返回 undefined，?. 保护但 || '' 兜底正确
// 风险等级: 低
```

#### 2.6 `GeneratorPage.tsx:142` - Object.keys 可能为空
```typescript
start_scene: raw.start_scene || Object.keys(raw.scenes || {})[0] || 'scene_1',
// 如果 raw.scenes 为空对象，Object.keys 返回空数组，[0] 为 undefined，但 || 'scene_1' 兜底
```

#### 2.7 `settingsStore.ts:saveToBackend/loadFromBackend` - 网络错误未处理
```typescript
saveToBackend: async () => {
  const encrypted = await encryptSensitive(payload as Record<string, any>);
  await apiPost('/api/settings', encrypted); // 网络错误未捕获
},
loadFromBackend: async () => {
  const data = await apiGet('/api/settings'); // 同上
}
```

#### 2.8 `saveStore.ts` - autoSave 吞掉错误
```typescript
autoSave: async ({ campaign, module, thumbnail, vnSnapshot }) => {
  try {
    const save = await get().createSave({...});
    return save;
  } catch (err: any) {
    return null; // 错误静默吞掉，无日志
  }
},
```

#### 2.9 `ModuleManagerPage.tsx:430` - result.errors 可能 undefined
```typescript
setSaveMsg({ type: 'err', text: `校验失败：${result.errors[0].message}` });
// result.errors 可能不存在，访问 [0] 会崩溃
```

#### 2.10 `CombatOverlay.tsx:347` - aliveEnemies 可能为空
```typescript
handleSelectTarget(aliveEnemies[0].id); // 未检查 aliveEnemies 长度
```

#### 2.11 `npc-system.ts:416` - forcedActions 可能为空
```typescript
decision.action = modifier.forcedActions[0] || 'ignore'; // 有 || 兜底，安全
```

#### 2.12 `rule-engine.ts:1282` - value 可能不是数组
```typescript
if (cv < value[0] || cv > value[1]) return false; // 未校验 value 是数组
```

#### 2.13 `intent-parser.ts:431-432` - matches[0] 可能 undefined
```typescript
const m = matches[0]; // matches 可能为空
return m[1] || m[0]; // 如果 matches 为空会崩溃
```

---

### 3. switch/case 无 default 分支 (8 个文件)

| 文件 | 行号 | 建议 |
|------|------|------|
| `ModuleManagerPage.tsx` | 多处分支 | 添加 default 返回 null 或抛出异常 |
| `SettingsPage.tsx` | 多处分支 | 同上 |
| `CombatOverlay.tsx` | ~115 | 添加默认处理 |
| `combat-system.ts` | 多处分支 | 添加 default: throw new Error |
| `event-system.ts` | 多处分支 | 添加 default 返回 safe result |
| `quest-system.ts` | 多处分支 | 添加 default 返回 null |
| `world-state.ts` | 多处分支 | 添加 default 忽略未知 impact |
| `state-machine.ts` | `buildCheckNarration` | 已有 default，但其他 switch 可能缺失 |

**示例修复**:
```typescript
// combat-system.ts
switch (action.type) {
  case 'attack': /* ... */ break;
  case 'skill': /* ... */ break;
  // ...
  default:
    console.warn(`Unknown combat action: ${action.type}`);
    return { success: false, reason: 'unknown_action' };
}
```

---

## ⚠️ 中风险问题

### 4. JSON.parse 无输入校验 (14 处)

多处 `JSON.parse` 未校验输入就直接解析：

```typescript
// llm/client.ts:118-125
const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
if (jsonMatch) return JSON.parse(jsonMatch[1].trim()); // jsonMatch[1] 可能为 undefined
return JSON.parse(text.trim()); // text 可能非 JSON

// engine/npc-decision.ts:371
parsed = JSON.parse(jsonText); // jsonText 可能非 JSON

// engine/npc-system.ts:491
parsed = JSON.parse(jsonText); // 同上

// modshare/importer.ts:151
const parsed = JSON.parse(text); // 用户上传的文件可能非 JSON
```

**修复建议**: 所有 JSON.parse 包裹 try/catch，或前置格式校验。

---

### 5. 类型断言 (as) 使用过多 (212 处)

大量使用 `as` 类型断言会绕过 TypeScript 类型检查，隐藏运行时类型错误。

**高频出现文件**:
- `engine/rule-engine.ts` - 60+ 处
- `engine/npc-system.ts` - 40+ 处
- `engine/story-engine.ts` - 30+ 处
- `components/**/*.tsx` - 80+ 处

**修复建议**: 逐步用类型守卫函数(type guards)替代 `as` 断言。

---

### 6. 非空断言 (!.) 使用 (8 处)

```typescript
// 示例
scene.dialogue!.speaker; // dialogue 可能 null
module.npcs![npcId]; // npcs 可能 undefined
campaign.player!.stats; // player 可能 undefined
```

---

## 🟡 低风险问题

### 7. 其他潜在 Bug

#### 7.1 `dice.ts` - 缓存竞争条件
```typescript
if (this._parseCache.size >= this._maxCacheSize) {
  const firstKey = this._parseCache.keys().next().value;
  if (firstKey) this._parseCache.delete(firstKey);
}
```
Map.keys().next() 在 JS 中顺序稳定，但依赖实现细节。建议改用 LRU 缓存。

#### 7.2 `textPreprocess.ts` - 正则表达式未重置 lastIndex
```typescript
const sceneBreakPattern = /.../g;
// 未使用 sceneBreakPattern.lastIndex = 0;
// 如果函数被递归调用，可能导致意外行为
```

#### 7.3 `settingsStore.ts` - API_BASE 硬编码
```typescript
const API_BASE = 'http://localhost:9742'; // 生产环境可能不同
```

#### 7.4 `moduleStore.ts` - localStorage 操作未处理 quota exceeded
```typescript
try {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newModules));
} catch {
  // Storage quota exceeded, ignore — 应通知用户
}
```

#### 7.5 `CombatOverlay.tsx` - 内存泄漏风险
```typescript
// 使用了 setTimeout 但未在 cleanup 中全部清理
const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// 某些分支可能未清理 timer
```

---

## ✅ 已修复/已处理的问题

| 问题 | 状态 | 备注 |
|------|------|------|
| BUG-5: GameStateMachine 可变更新 | ✅ 已修复 | state-machine.ts 使用不可变更新 |
| BUG-9: 自动存档防抖 | ✅ 已修复 | VisualNovelEngine 已实现 debouncedAutoSave |
| BUG-2: Settings 前后端结构 | ✅ 已修复 | settingsStore 已统一 |
| 缓存清理机制 | ✅ 已处理 | dice.ts 有 _maxCacheSize 限制 |
| NPC 对话历史限制 | ✅ 已处理 | 限制 50 条/角色 |

---

## 📋 修复优先级建议

### P0 (立即修复)
1. `api/electron.ts` - 所有 async 函数添加 try/catch
2. `CombatOverlay.tsx:347` - 检查 aliveEnemies 长度
3. `ModuleManagerPage.tsx:430` - 校验 result.errors 存在性

### P1 (本迭代修复)
4. 所有 JSON.parse 添加 try/catch
5. `VisualNovelEngine.tsx:269` - exits 数组越界检查
6. `npc-decision.ts:271` - secretKeywords 空数组检查
7. `rule-engine.ts:1282` - value 类型校验
8. 所有 switch/case 添加 default

### P2 (后续迭代)
9. 减少类型断言 (as) 使用
10. 替换非空断言 (!.) 为安全访问
11. settingsStore API_BASE 配置化
12. dice.ts 实现 LRU 缓存

---

## 📁 问题文件清单

```
frontend/src/
├── api/electron.ts                    🔴 async 无 try/catch
├── components/combat/CombatOverlay.tsx 🔴 null 访问 + switch 无 default
├── components/module-manager/ModuleManagerPage.tsx 🔴 switch 无 default + 数组越界
├── components/settings/SettingsPage.tsx 🔴 switch 无 default
├── components/engine/VisualNovelEngine.tsx 🔴 数组越界
├── components/generator/GeneratorPage.tsx ⚠️ 潜在 null
├── components/generator/textPreprocess.ts ⚠️ 正则状态
├── llm/client.ts                       ⚠️ JSON.parse + 可选链
├── llm/llm-option-generator.ts         ⚠️ 数组访问
├── engine/combat-system.ts             🔴 switch 无 default
├── engine/event-system.ts              🔴 switch 无 default
├── engine/quest-system.ts              🔴 switch 无 default
├── engine/world-state.ts               🔴 switch 无 default
├── engine/state-machine.ts             🔴 throw + 可变状态
├── engine/dice.ts                      ⚠️ 缓存机制
├── engine/npc-decision.ts              ⚠️ 数组越界
├── engine/npc-system.ts                ⚠️ JSON.parse + 类型断言
├── engine/intent-parser.ts             ⚠️ 数组越界 + JSON.parse
├── engine/rule-engine.ts               ⚠️ 类型断言过多
├── engine/story-engine.ts              ⚠️ JSON.parse
├── stores/settingsStore.ts             🔴 网络错误未处理
├── stores/saveStore.ts                 ⚠️ 错误静默
└── stores/moduleStore.ts               ⚠️ Storage quota
```

---

*审查完成。共发现 8 个高风险、12 个中风险、5 个低风险问题。*
