# AI-GM Standalone — D7 UX 检查报告

> 检查时间：2026-07-13 13:00 CST  
> 检查范围：战斗系统键盘快捷键、全屏模式、音效开关、设置面板交互流畅性  
> 代码基线：`main` 分支（HEAD 截至 7/12）

---

## 1. 检查概览

| 检查项 | 状态 | 备注 |
|--------|------|------|
| 战斗键盘快捷键 | ⚠️ 基本可用，有优化空间 | 主菜单/子菜单/目标选择三层快捷键逻辑完整 |
| 全屏模式 | ⚠️ 可用，有状态同步缺陷 | F11 和设置 Toggle 均可触发，但双向同步缺失 |
| 音效开关 | ✅ 可用，建议增强 | 全局开关正常，Web Audio API 无外部依赖 |
| 设置面板交互 | ⚠️ 流畅，有边缘问题 | 验证、Toast、Tab 切换均正常，保存错误静默吞掉 |

---

## 2. 战斗系统键盘快捷键

### 2.1 已实现的快捷键映射

| 按键 | 场景 | 动作 |
|------|------|------|
| `1` | 主菜单 | 攻击（进入目标选择） |
| `2` | 主菜单 | 打开技能子菜单 |
| `3` | 主菜单 | 打开物品子菜单 |
| `4` | 主菜单 | 逃跑 |
| `1-9` | 子菜单 | 选择第 N 个技能/物品 |
| `Escape` | 子菜单 | 关闭子菜单 |
| `Enter` | 目标选择 | 自动选择第一个存活敌人 |
| `1-9` | 目标选择 | 选择第 N 个存活敌人 |
| `Escape` | 目标选择 | 取消选择 |

### 2.2 代码位置
- 主处理器：`frontend/src/components/combat/CombatOverlay.tsx` 第 285-360 行
- 按钮提示：`frontend/src/components/combat/ActionMenu.tsx` 第 141 行 `title={`${action.desc} [${action.key}]`}`

### 2.3 发现的问题

#### 🔴 P2 — Escape 事件竞争（InGameMenu ↔ VisualNovelEngine）

**问题描述**：`InGameMenu` 和 `VisualNovelEngine` 各自在 `window` 上注册了 `keydown` 监听器监听 Escape。当游戏菜单打开时按 Escape，两个处理器都可能触发，存在竞争条件。`VisualNovelEngine` 没有检查菜单是否已打开，仅依赖 `combatActive` 判断。

**代码位置**：
- `VisualNovelEngine.tsx:247`：`onMenuToggle?.()`
- `InGameMenu.tsx:42`：`onClose()`

**影响**：在特定执行顺序下，按一次 Escape 可能先关闭菜单再重新打开（或反之）。

**建议修复**：在 `InGameMenu` 的 Escape 处理器中添加 `e.stopPropagation()`，确保菜单打开时独占 Escape 处理权：

```typescript
// InGameMenu.tsx
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (isOpen) {
      e.stopPropagation();  // ← 新增
      onClose();
    }
  }
};
```

#### 🟡 P6 — 子菜单数字快捷键上限为 9

**问题描述**：技能/物品子菜单使用 `1-9` 数字键选择，当列表超过 9 项时无法通过键盘访问第 10 项及以后。

**影响**：中低。通常战斗技能不会超过 9 个，但物品栏在长线游戏中可能累积大量道具。

**建议**：考虑增加 `PageUp`/`PageDown` 或 `↑↓` 方向键导航作为补充。

#### 🟡 键盘处理器依赖数组包含可变引用

**问题描述**：`CombatOverlay.tsx` 的键盘 `useEffect` 依赖数组包含 `moduleItems`（对象）和 `playerInventory`（数组）。如果这些引用在父组件中不稳定，会导致键盘处理器频繁重建。

**代码位置**：`CombatOverlay.tsx:360`

**当前状态**：由于 `moduleItems` 来自 `module.items` 对象引用，`playerInventory` 来自 `campaign.player.inventory` 数组引用，在 BUG-5 不可变更新修复后，这些引用在多数场景下是稳定的。风险较低，但建议添加 `useMemo` 稳定化。

---

## 3. 全屏模式

### 3.1 已实现功能

| 触发方式 | 实现位置 | 行为 |
|----------|----------|------|
| 设置面板 Toggle | `SettingsPage.tsx:642-650` | 即时调用 `requestFullscreen()` / `exitFullscreen()` |
| F11 快捷键 | `PlayPage.tsx:228-239` | `preventDefault()` 后手动触发全屏 API |
| 游戏启动自动全屏 | `PlayPage.tsx:223-226` | 若 `game.fullscreen=true` 且未在全屏，自动进入 |

### 3.2 发现的问题

#### 🔴 P1 — 全屏状态双向同步缺失

**问题描述**：`PlayPage.tsx` 和 `SettingsPage.tsx` 都能触发全屏，但没有任何代码监听 `fullscreenchange` 事件。用户通过以下方式切换全屏后，`settingsStore.game.fullscreen` 的值不会同步更新：
- 按 F11（代码拦截了，但浏览器/Electron 系统级全屏仍可能绕过）
- 操作系统快捷键（如 macOS 的 green button）
- 浏览器原生全屏按钮

**代码位置**：全项目无 `fullscreenchange` 事件监听。

**影响**：设置面板的 Toggle 开关显示状态可能与实际全屏状态不一致。

**建议修复**：在 `PlayPage.tsx` 中添加事件监听：

```typescript
useEffect(() => {
  const handleChange = () => {
    const isFullscreen = !!document.fullscreenElement;
    useSettingsStore.getState().setGame({ fullscreen: isFullscreen });
  };
  document.addEventListener('fullscreenchange', handleChange);
  return () => document.removeEventListener('fullscreenchange', handleChange);
}, []);
```

#### 🟡 P3 — 设置面板内切换全屏体验不佳

**问题描述**：`SettingsPage.tsx` 中点击全屏 Toggle 会立即对 `document.documentElement` 调用 `requestFullscreen()`。如果用户是在非游戏路由（如 `/settings`）中打开设置，整个浏览器窗口进入全屏后，用户点击「返回游戏」，全屏状态仍然保持，但视觉上下文从设置页跳到了游戏，可能让用户困惑。

**建议**：全屏 Toggle 仅在游戏上下文（`fromGame=true`）或明确处于游戏路由时生效，或至少延迟到用户返回游戏后再应用。

#### 🟡 F11 拦截在浏览器环境下可能不符合预期

**问题描述**：`PlayPage.tsx` 的 F11 处理器始终 `e.preventDefault()`，这会阻止浏览器的默认 F11 全屏行为。在 Electron 包装器内这是期望行为，但如果用户以纯网页方式访问，F11 是浏览器的标准全屏快捷键，拦截它可能让用户困惑。

**建议**：在 Electron 环境下拦截，在纯网页环境下不拦截。可通过检测 `electronAPI` 存在性判断：

```typescript
const isElectron = typeof electronAPI !== 'undefined' && electronAPI !== null;
if (!isElectron) return; // 不拦截浏览器默认 F11
```

---

## 4. 音效开关

### 4.1 已实现功能

- **全局开关**：`settingsStore.game.soundEnabled`（默认 `true`）
- **音效系统**：`frontend/src/utils/soundfx.ts` — 使用 Web Audio API 合成音效，零外部依赖
- **覆盖场景**：按钮点击、攻击、暴击、技能、治疗、逃跑、胜利/失败、回合开始、菜单开关、存档等 15+ 种音效
- **浏览器策略兼容**：`AudioContext.state === 'suspended'` 时自动 `resume()`，失败静默处理

### 4.2 发现的问题

#### 🟡 P5 — 缺少音量大小调节

**问题描述**：音效只有「开/关」二元控制，没有音量滑块。所有音效固定音量 0.12-0.15，用户无法根据个人偏好或环境调节。

**建议**：在 `GameConfig` 中增加 `soundVolume: number`（0-1），在设置面板「音频与显示」区域添加音量滑块，并在 `playTone()` 等函数中应用增益系数。

#### 🟢 正面发现

- `soundEnabled()` 使用 `useSettingsStore.getState()` 读取，不触发重渲染，性能友好。
- 所有音效函数入口统一检查开关，没有遗漏路径。

---

## 5. 设置面板交互

### 5.1 已实现功能

- **Tab 导航**：LLM 配置 / 图片配置 / 游戏设置 / 主题设置
- **实时验证**：字段级验证（baseUrl 格式、API Key 格式、数值范围等）
- **错误指示**：Tab 按钮上的红色圆点提示该页有校验错误
- **敏感字段加密**：API Key 等通过 `crypto.ts` 加密后传输到后端
- **本地持久化**：非敏感字段备份到 `localStorage`
- **加载状态**：`loaded` 标志控制「加载中...」提示

### 5.2 发现的问题

#### 🔴 P4 — 保存错误被静默吞掉

**问题描述**：`settingsStore.ts` 中 `saveToBackend()` 的 catch 块为空注释 `/* no-op */`：

```typescript
saveToBackend: async () => {
  // ...
  try {
    await apiPost('/api/settings', encrypted);
  } catch (err) {
    /* no-op */  // ← 这里
  }
},
```

这意味着如果后端保存失败（网络断开、后端崩溃、验证失败），前端 UI 仍会通过 `saveMsg` 显示「设置已保存」成功提示，因为 `SettingsPage.tsx` 的 `handleSave` 中 `await saveToBackend()` 不会抛错。

**代码位置**：`settingsStore.ts:186-189`

**建议修复**：移除内层 catch，让错误冒泡到 `handleSave` 统一处理。或者在内层记录日志并重新抛出。

#### 🟡 后端加载失败时使用默认值无提示

**问题描述**：`loadFromBackend()` 在 catch 中仅设置 `loaded: true`，不提示用户后端不可用：

```typescript
} catch (err) {
  set({ loaded: true });
}
```

用户可能以为设置加载成功，但实际上使用的是本地默认值或 `localStorage` 备份。

**建议**：在 catch 中触发一个轻量提示（如 console.warn 或通过 Toast），告知用户「无法连接到设置服务，使用本地默认值」。

#### 🟡 Slider 变更未自动保存

**问题描述**：打字机速度、字体大小、自动前进延迟等 Slider 调整后，需要用户手动点击「保存」按钮才会持久化。部分用户可能期望滑动后立即生效并自动保存。

**建议**：这属于设计决策，非 bug。但可考虑在 Slider `onChange` 中添加 debounced auto-save（300ms 防抖），提升「即时感」。

#### 🟢 正面发现

- 验证规则完整且合理：maxTokens 范围 64-8192、temperature 0-2、timeout 5000-120000ms。
- API Key 显示/隐藏切换（Eye/EyeOff 图标）交互流畅。
- 主题切换即时生效（dark/light/auto），无需保存。
- `fromGame` 状态传递正确，设置页「返回」按钮显示「返回游戏」。

---

## 6. 问题汇总与优先级

| 优先级 | 问题 | 影响 | 建议修复文件 |
|--------|------|------|-------------|
| 🔴 P1 | 全屏状态双向同步缺失 | 设置开关与实际状态不一致 | `PlayPage.tsx` |
| 🔴 P2 | Escape 事件竞争 | 菜单可能异常开关 | `InGameMenu.tsx` |
| 🔴 P4 | 保存错误静默吞掉 | 用户误以为保存成功 | `settingsStore.ts` |
| 🟡 P3 | 设置页内全屏体验 | 非游戏上下文全屏困惑 | `SettingsPage.tsx` |
| 🟡 P5 | 缺少音量调节 | 用户无法精细控制 | `soundfx.ts` + `SettingsPage.tsx` + `settingsStore.ts` |
| 🟡 P6 | 子菜单数字键上限 | 大量物品/技能时无法键盘访问 | `CombatOverlay.tsx` |
| 🟢 — | 键盘处理器依赖引用 | 低风险，引用在修复后稳定 | `CombatOverlay.tsx`（可选） |
| 🟢 — | F11 浏览器环境拦截 | 仅影响网页版 | `PlayPage.tsx`（可选） |

---

## 7. 总体评价

UX 整体水准在线，核心交互路径（战斗快捷键、全屏、音效、设置面板）均已实现且基本可用。主要风险集中在：

1. **状态同步**（全屏、保存反馈）— 用户可能感知到「不一致」或「不可靠」。
2. **事件竞争**（Escape）— 在特定时序下可能出现异常行为，建议快速修复。
3. **功能缺失**（音量调节）— 属于增强项，非阻塞。

建议 **P1、P2、P4** 在 D7 或 D8 优先修复，单文件改动量均不超过 10 行。

---

*报告生成：黑子*  
*Day one. Logged.* ✍️🔥
