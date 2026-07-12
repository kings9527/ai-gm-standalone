/**
 * PlayPage.tsx
 * Game play route - lazy-loaded for performance.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import VisualNovelEngine from '../components/engine/VisualNovelEngine';
import type { VisualNovelEngineHandle } from '../components/engine/VisualNovelEngine';
import { InGameMenu } from '../components/menu';
import { SaveLoadPanel } from '../components/save-load';
import { SkeletonCard } from '../components/ui';
import { useGameStore } from '../stores/gameStore';
import { useSaveStore } from '../stores/saveStore';
import { GameStateMachine } from '../engine/state-machine';
import type { Module, Campaign } from '../types/module';
import { electronAPI } from '../api/electron';
import { sfxMenuOpen, sfxMenuClose, sfxClick, sfxSave } from '../utils/soundfx';

import { useSettingsStore } from '../stores/settingsStore';

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
    sfxClick();
    setMenuOpen(false);
    setSavePanelMode('save');
    setSavePanelOpen(true);
  }, []);

  const handleOpenLoad = useCallback(() => {
    sfxClick();
    setMenuOpen(false);
    setSavePanelMode('load');
    setSavePanelOpen(true);
  }, []);

  const handleQuit = useCallback(() => {
    sfxClick();
    resetGameStore();
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    navigate('/');
  }, [navigate, resetGameStore]);

  const handleResume = useCallback(() => {
    sfxMenuClose();
    setMenuOpen(false);
    setIsPaused(false);
  }, []);

  const handleMenuToggle = useCallback(() => {
    setMenuOpen((prev) => {
      const next = !prev;
      if (next) sfxMenuOpen();
      else sfxMenuClose();
      setIsPaused(next);
      return next;
    });
  }, []);

  const handleSettings = useCallback(() => {
    sfxClick();
    setMenuOpen(false);
    setIsPaused(true);
    navigate('/settings', { state: { fromGame: true } });
  }, [navigate]);

  const handleExitApplication = useCallback(() => {
    sfxClick();
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

  // 游戏启动时应用全屏设置
  useEffect(() => {
    const { game } = useSettingsStore.getState();
    if (game.fullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  // 监听 F11 全屏快捷键和全屏设置
  useEffect(() => {
    const handleFullscreenKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handleFullscreenKey);
    return () => window.removeEventListener('keydown', handleFullscreenKey);
  }, []);

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

export default PlayPage;
