/**
 * App.tsx
 * Main router for AI-GM Standalone.
 * Routes: / (home), /generator, /play, /settings, /images
 *
 * PERF-OPT: Route-level code splitting via React.lazy + Suspense.
 * HomePage stays eager (landing page, lightweight).
 * All other routes are lazy-loaded to reduce initial chunk size.
 */
import React, { Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ToastProvider, GlobalErrorBoundary, PageTransition } from './components/ui';

/* ── Eager routes (landing page, always needed) ─────────────── */

const HomePage: React.FC = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black p-4"
  >
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.5 }}
    >
      <h1 className="text-4xl md:text-5xl font-bold mb-2 text-red-500 tracking-wider text-center">
        AI-GM
      </h1>
    </motion.div>
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.25, duration: 0.5 }}
      className="text-gray-400 mb-8 text-center"
    >
      AI 驱动的视觉小说 RPG 引擎
    </motion.p>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.5 }}
      className="flex flex-col gap-3 w-full max-w-xs sm:w-64"
    >
      <HoverButton href="#/style-analyzer" variant="primary">
        AI 风格分析器
      </HoverButton>
      <HoverButton href="#/generator" variant="primary">
        上传故事，创建模组
      </HoverButton>
      <HoverButton href="#/play">
        继续游戏
      </HoverButton>
      <HoverButton href="#/modules">
        模组管理
      </HoverButton>
      <HoverButton href="#/images">
        图片管理
      </HoverButton>
      <HoverButton href="#/settings">
        设置
      </HoverButton>
    </motion.div>
  </motion.div>
);

/* ── Lazy-loaded routes (heavy pages) ───────────────────────── */

const PlayPage = React.lazy(() => import('./routes/PlayPage'));
const GeneratorPage = React.lazy(() => import('./components/generator/GeneratorPage'));
const StyleAnalyzerPanel = React.lazy(() => import('./components/style-analyzer/StyleAnalyzerPanel'));
const ModuleManagerPage = React.lazy(() => import('./components/module-manager/ModuleManagerPage'));
const ImageManagerPage = React.lazy(() => import('./routes/ImageManagerPage'));
const SettingsPageRoute = React.lazy(() => import('./routes/SettingsPageRoute'));

/* ── Shared components ──────────────────────────────────────── */

const HoverButton: React.FC<{
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
}> = ({ href, children, variant = 'secondary', className = '' }) => {
  const isPrimary = variant === 'primary';
  return (
    <motion.a
      href={href}
      whileHover={{ scale: 1.03, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className={`block px-6 py-3 rounded-lg border text-center transition-colors ${
        isPrimary
          ? 'bg-red-900/40 border-red-800/40 text-red-200 hover:bg-red-800/50 hover:shadow-lg hover:shadow-red-900/20'
          : 'bg-gray-800/40 border-gray-700/40 text-gray-200 hover:bg-gray-700/50 hover:shadow-lg hover:shadow-gray-900/20'
      } ${className}`}
    >
      {children}
    </motion.a>
  );
};

const PageLoading: React.FC<{ message?: string }> = ({ message = '加载中...' }) => (
  <div className="w-full h-full flex flex-col items-center justify-center bg-black text-gray-400 gap-4">
    <motion.div
      className="w-8 h-8 border-2 border-red-800 border-t-transparent rounded-full"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
    />
    <span>{message}</span>
  </div>
);

/* ── Route wrappers with Suspense ─────────────────────────── */

const LazyPlay = () => (
  <Suspense fallback={<PageLoading message="加载游戏引擎..." />}>
    <PlayPage />
  </Suspense>
);

const LazyGenerator = () => (
  <Suspense fallback={<PageLoading message="加载生成器..." />}>
    <GeneratorPage />
  </Suspense>
);

const LazyStyleAnalyzer = () => (
  <Suspense fallback={<PageLoading message="加载风格分析器..." />}>
    <StyleAnalyzerPanel />
  </Suspense>
);

const LazyModules = () => (
  <Suspense fallback={<PageLoading message="加载模组管理..." />}>
    <ModuleManagerPage />
  </Suspense>
);

const LazyImages = () => (
  <Suspense fallback={<PageLoading message="加载图片管理..." />}>
    <ImageManagerPage />
  </Suspense>
);

const LazySettings = () => (
  <Suspense fallback={<PageLoading message="加载设置..." />}>
    <SettingsPageRoute />
  </Suspense>
);

/* ── App Root ───────────────────────────────────────────────── */

const App: React.FC = () => {
  return (
    <GlobalErrorBoundary>
      <ToastProvider>
        <div className="w-full h-screen bg-black text-gray-100 overflow-hidden">
          <HashRouter>
            <PageTransition mode="slide">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/generator" element={<LazyGenerator />} />
                <Route path="/style-analyzer" element={<LazyStyleAnalyzer />} />
                <Route path="/images" element={<LazyImages />} />
                <Route path="/play" element={<LazyPlay />} />
                <Route path="/modules" element={<LazyModules />} />
                <Route path="/settings" element={<LazySettings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </PageTransition>
          </HashRouter>
        </div>
      </ToastProvider>
    </GlobalErrorBoundary>
  );
};

export default App;
