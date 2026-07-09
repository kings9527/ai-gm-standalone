import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import VisualNovelEngine from './components/engine/VisualNovelEngine';
import type { VisualNovelEngineHandle } from './components/engine/VisualNovelEngine';
import GeneratorPage from './components/generator/GeneratorPage';
import { StyleAnalyzerPanel } from './components/style-analyzer';
import { ImageSelector } from './components/image-selector';
import { SaveLoadPanel } from './components/save-load';
import { InGameMenu } from './components/menu';
import { ModuleManagerPage } from './components/module-manager';
import { ToastProvider, GlobalErrorBoundary, PageTransition, SkeletonCard } from './components/ui';
import { useGameStore } from './stores/gameStore';
import { useSaveStore } from './stores/saveStore';
import { GameStateMachine } from './engine/state-machine';
import type { Module, Campaign } from './types/module';
import { electronAPI } from './api/electron';

/**
 * App.tsx
 * Main router for AI-GM Standalone.
 * Routes: / (home), /generator, /play, /settings, /images
 *
 * NEW: Global ToastProvider, ErrorBoundary, PageTransition animations,
 *      Skeleton loading states, enhanced button hover feedback,
 *      responsive layout.
 */

/* ── Button hover component ───────────────────────────────────── */

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

/* ── Home Page ────────────────────────────────────────────────── */

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

/* ── Loading & Error Fallbacks ───────────────────────────────── */

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

const GeneratorPageRoute: React.FC = () => (
  <Suspense fallback={<PageLoading message="加载生成器..." />}>
    <GeneratorPage />
  </Suspense>
);

const ImageManagerPage: React.FC = () => {
  const [selected, setSelected] = useState<any>(null);
  return (
    <div className="w-full h-full bg-gray-950">
      <ImageSelector
        type="all"
        modal={false}
        title="图片管理"
        onSelect={(img) => {
          setSelected(img);
        }}
      />
    </div>
  );
};

// Settings Page Route - wraps SettingsPage with back-to-game support
const SettingsPageRoute: React.FC = () => {
  const location = useLocation();
  const fromGame = location.state?.fromGame === true;
  return <SettingsPage fromGame={fromGame} />;
};

/* ── Play Page ────────────────────────────────────────────────── */

const PlayPage: React.FC = () => {
  const navigate = useNavigate();
  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [savePanelMode, setSavePanelMode] = useState<'save' | 'load'>('save');
  const [savePanelOpen, setSavePanelOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const {
    campaign,
    stateMachine,
    currentSceneId,
    setCampaign,
    setModule: setStoreModule,
    setStateMachine,
    reset: resetGameStore,
    restoreFromSave,
  } = useGameStore();

  const [loadedFromSave, setLoadedFromSave] = useState(false);
  const [loadedSceneId, setLoadedSceneId] = useState<string | undefined>(undefined);

  const vnRef = useRef<VisualNovelEngineHandle>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load module on mount
  useEffect(() => {
    fetch('/demo-module.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Module) => {
        setModule(data);
        setStoreModule(data);
        setLoading(false);
      })
      .catch((err) => {
        setError('加载模组失败，请检查网络连接');
        setLoading(false);
      });
  }, [setStoreModule]);

  // Initialize campaign when module is loaded (if not loading from save)
  useEffect(() => {
    if (!module || loadedFromSave) return;
    if (campaign) return;

    const initialCampaign: Campaign = {
      id: `campaign_${Date.now()}`,
      module_id: module.id,
      player: {
        name: '调查员',
        stats: { 侦查: 60, 聆听: 50, 图书馆使用: 50, 格斗: 40, 射击: 40, 闪避: 40, 说服: 50, 心理学: 50 },
        hp: 12,
        max_hp: 12,
        sanity: 60,
        max_sanity: 60,
        inventory: [],
        status_effects: [],
      },
      current_scene: module.start_scene,
      scene_history: [module.start_scene],
      global_vars: {},
      npcs_state: {},
      combat_state: null,
      flags: {},
      turn: 0,
    };

    setCampaign(initialCampaign);
    const sm = new GameStateMachine(module, initialCampaign, null);
    setStateMachine(sm);
  }, [module, loadedFromSave, campaign, setCampaign, setStateMachine]);

  const handleSceneChange = useCallback(
    (sceneId: string) => {
      if (!campaign || !module) return;
      setCampaign({ ...campaign, current_scene: sceneId, scene_history: [...campaign.scene_history, sceneId] });
    },
    [campaign, module, setCampaign]
  );

  const handleAutoSave = useCallback(
    async (snapshot: any, thumbnail: string) => {
      const currentCampaign = useGameStore.getState().campaign;
      if (!currentCampaign || !module) return;
      try {
        await useSaveStore.getState().autoSave({
          campaign: currentCampaign,
          module,
          thumbnail,
          vnSnapshot: snapshot,
        });
      } catch (err: any) {
      /* no-op */ }
    },
    [module]
  );

  const handleLoadSave = useCallback(
    async (saveId: string) => {
      setSavePanelOpen(false);
      setMenuOpen(false);
      setLoading(true);

      try {
        const save = await useSaveStore.getState().loadSave(saveId);
        if (!save) throw new Error('存档加载失败');

        const restoredModule = save.module;
        const restoredCampaign = save.campaign;

        setModule(restoredModule);
        setStoreModule(restoredModule);
        restoreFromSave(save);
        setLoadedFromSave(true);
        setLoadedSceneId(restoredCampaign.current_scene);

        const sm = new GameStateMachine(restoredModule, restoredCampaign, null);
        setStateMachine(sm);

        if (save.vnSnapshot && vnRef.current) {
          vnRef.current.restoreSnapshot(save.vnSnapshot);
        }

        setLoading(false);
      } catch (err: any) {
        setError(err.message || '读档失败');
        setLoading(false);
      }
    },
    [setStoreModule, restoreFromSave, setStateMachine]
  );

  const handleOpenSave = useCallback(() => {
    setMenuOpen(false);
    setSavePanelMode('save');
    setSavePanelOpen(true);
  }, []);

  const handleOpenLoad = useCallback(() => {
    setMenuOpen(false);
    setSavePanelMode('load');
    setSavePanelOpen(true);
  }, []);

  const handleQuit = useCallback(() => {
    resetGameStore();
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    navigate('/');
  }, [navigate, resetGameStore]);

  const handleResume = useCallback(() => {
    setMenuOpen(false);
    setIsPaused(false);
  }, []);

  const handleMenuToggle = useCallback(() => {
    setMenuOpen((prev) => {
      const next = !prev;
      setIsPaused(next);
      return next;
    });
  }, []);

  const handleSettings = useCallback(() => {
    setMenuOpen(false);
    setIsPaused(true);
    navigate('/settings', { state: { fromGame: true } });
  }, [navigate]);

  const handleExitApplication = useCallback(() => {
    if (typeof electronAPI?.quit === 'function') {
      electronAPI.quit();
    } else {
      window.close();
    }
  }, []);

  const handleManualSave = useCallback(async () => {
    if (!campaign || !module) return null;
    const snapshot = vnRef.current?.getSnapshot();
    const thumbnail = await vnRef.current?.takeThumbnail();
    if (!thumbnail) return null;
    return { snapshot, thumbnail };
  }, [campaign, module]);

  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black text-gray-400 gap-6 p-4">
        <motion.div
          className="w-10 h-10 border-2 border-red-800 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        />
        <span className="text-sm">加载模组中...</span>
        {/* Skeleton preview */}
        <div className="w-full max-w-md space-y-3 opacity-30">
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error || !module) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full h-full flex flex-col items-center justify-center bg-black text-gray-400 gap-4 p-4"
      >
        <span className="text-red-500 text-lg">⚠ {error || '模组加载失败'}</span>
        <motion.button
          onClick={() => navigate('/')}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="text-sm text-gray-500 hover:text-gray-300 underline"
        >
          返回主页
        </motion.button>
      </motion.div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <VisualNovelEngine
        ref={vnRef}
        module={module}
        initialSceneId={loadedSceneId}
        isPaused={isPaused}
        onSave={handleOpenSave}
        onMenuToggle={handleMenuToggle}
        onSceneChange={handleSceneChange}
        onAutoSave={handleAutoSave}
      />

      <InGameMenu
        isOpen={menuOpen}
        onClose={() => {
          setMenuOpen(false);
          setIsPaused(false);
        }}
        onSave={handleOpenSave}
        onLoad={handleOpenLoad}
        onSettings={handleSettings}
        onQuit={handleQuit}
        onResume={handleResume}
        onExitApplication={handleExitApplication}
      />

      <SaveLoadPanel
        mode={savePanelMode}
        isOpen={savePanelOpen}
        onClose={() => setSavePanelOpen(false)}
        campaign={campaign}
        module={module}
        currentSceneId={currentSceneId}
        onLoadSave={handleLoadSave}
        onSnapshotRequest={handleManualSave}
        onSaveComplete={() => {}}
      />
    </div>
  );
};

import { SettingsPage } from './components/settings';

/* ── App Root ─────────────────────────────────────────────────── */

const App: React.FC = () => {
  return (
    <GlobalErrorBoundary>
      <ToastProvider>
        <div className="w-full h-screen bg-black text-gray-100 overflow-hidden">
          <HashRouter>
            <PageTransition mode="slide">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/generator" element={<GeneratorPageRoute />} />
                <Route path="/style-analyzer" element={<StyleAnalyzerPanel />} />
                <Route path="/images" element={<ImageManagerPage />} />
                <Route path="/play" element={<PlayPage />} />
                <Route path="/modules" element={<ModuleManagerPage />} />
                <Route path="/settings" element={<SettingsPageRoute />} />
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
