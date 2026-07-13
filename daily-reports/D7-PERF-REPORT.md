# D7 性能优化报告

**任务**: 检查首屏加载时间，分析 bundle 大小，确认 CombatOverlay 懒加载生效，检查新的性能瓶颈。
**执行时间**: 2026-07-13 11:00 (Asia/Shanghai)
**构建工具**: Vite v6.4.3

---

## 1. 首屏加载分析

### 首屏资源（HomePage `/`）

| 资源 | 原始大小 | Gzip 大小 | 说明 |
|------|---------|----------|------|
| index-*.js | 11.61 KB | 4.41 KB | 主入口：App.tsx + HomePage + 框架代码 |
| vendor-react | 166.86 KB | 50.93 KB | React 18 + ReactDOM |
| vendor-motion | 115.07 KB | 38.08 KB | framer-motion（HomePage 动画依赖） |
| vendor-router | 37.84 KB | 13.74 KB | react-router-dom |
| vendor-zustand | 2.77 KB | 1.37 KB | 状态管理 |
| index-*.css | 42.51 KB | 8.63 KB | Tailwind CSS |
| **首屏总计** | **~377 KB** | **~117 KB** | ✅ 优秀（< 200KB gzip 警戒线） |

**结论**: 首屏加载量控制良好，117KB gzip 在桌面 Electron 环境下完全可接受。

---

## 2. Bundle 拆分分析

### 路由级代码分割（React.lazy）

| 路由 | Chunk | Gzip 大小 | 状态 |
|------|-------|----------|------|
| `/play` | PlayPage | 19.20 KB | ✅ 懒加载 |
| `/generator` | GeneratorPage | 8.77 KB | ✅ 懒加载 |
| `/style-analyzer` | StyleAnalyzerPanel | 8.53 KB | ✅ 懒加载 |
| `/modules` | ModuleManagerPage | 8.54 KB | ✅ 懒加载 |
| `/images` | ImageManagerPage | 4.26 KB | ✅ 懒加载 |
| `/settings` | SettingsPageRoute | 5.44 KB | ✅ 懒加载 |

### 第三方库拆分（manualChunks）

| Chunk | Gzip 大小 | 按需加载 |
|-------|----------|---------|
| vendor-jszip | 30.38 KB | 仅导出模组时动态导入 |
| vendor-html-to-image | 5.46 KB | 仅存档截图时加载 |
| vendor-icons (lucide) | < 1 KB（tree-shaken）| 随页面按需 |

---

## 3. CombatOverlay 懒加载验证

**✅ 已确认生效**

```tsx
// VisualNovelEngine.tsx
const CombatOverlay = React.lazy(() => import('../combat/CombatOverlay'));

// 渲染时用 Suspense 包裹
<Suspense fallback={null}>
  <CombatOverlay isActive={combatActive} ... />
</Suspense>
```

- CombatOverlay 为**独立 chunk**：`CombatOverlay-BQd7VtQY.js` (34.10 KB raw / 10.41 KB gzip)
- 仅在 `combatActive=true` 时触发加载
- 首屏不加载，验证通过

---

## 4. 性能瓶颈扫描

### 4.1 当前瓶颈（轻微）

| 问题 | 影响 | 建议 |
|------|------|------|
| framer-motion 占首屏 38KB gzip | HomePage 动画依赖 | 可接受；如追求极致可改用 CSS transition |
| 生产构建启用 sourcemap | 构建产物暴露源码 | 建议关闭：`sourcemap: false` |

### 4.2 无严重问题 ✅

- **无 console.log 残留**：仅 crypto.ts 有 2 处 `console.error`（合理错误处理）
- **无重复依赖**：各 chunk 无重叠，tree-shaking 正常
- **无大图片资源**：public 目录仅 demo-module.json (5.4KB)
- **lucide-react 正确 tree-shake**：命名导入，未全量引入
- **jszip 动态导入**：`modshare/exporter.ts` 使用 `await import('jszip')`，非首屏加载

### 4.3 html-to-image 模块级缓存

```ts
// VisualNovelEngine.tsx 中已实现
let htmlToImageModule: typeof import('html-to-image') | null = null;
async function getToPng() {
  if (!htmlToImageModule) htmlToImageModule = await import('html-to-image');
  return htmlToImageModule.toPng;
}
```

✅ 避免重复动态导入，已优化。

---

## 5. 优化建议（按优先级）

### 🔴 建议立即执行

1. **关闭生产 sourcemap**
   ```ts
   // vite.config.ts
   build: {
     sourcemap: false,  // 改为 false
   }
   ```
   - 减少构建产物体积
   - 保护源代码
   - 加快 CI 构建速度

### 🟡 可选优化

2. **评估 framer-motion 必要性**
   - HomePage 当前使用 framer-motion 做简单 fade/slide 动画
   - 可替换为 CSS `@keyframes` + `transition`，减少 38KB 首屏体积
   - 优先级：低（当前体积已可接受）

3. **启用 Brotli 压缩**
   - Vite 已配置 `brotliSize: true`，但 Electron 内部分发不需要
   - 对 Web 版本有意义

---

## 6. 总结

| 检查项 | 状态 |
|--------|------|
| 首屏加载 < 200KB gzip | ✅ 通过（117KB） |
| CombatOverlay 懒加载 | ✅ 已生效 |
| 路由级代码分割 | ✅ 全部生效 |
| 无 console.log 残留 | ✅ 通过 |
| 无重复依赖 | ✅ 通过 |
| sourcemap 生产关闭 | ⚠️ 建议执行 |

**整体评价**：项目性能状况良好，bundle 拆分合理，首屏加载轻量。唯一建议项是关闭生产 sourcemap。

---
*报告生成时间: 2026-07-13 11:10*
