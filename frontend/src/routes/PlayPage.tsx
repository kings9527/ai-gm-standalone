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
import { IntentParser, type IntentResult } from '../engine/intent-parser';
import { LLMClient } from '../llm/client';
import { ActionHandler } from '../engine/action-handler';

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
      inputHistory: [], // Phase 1-B: 初始化空输入历史
    };

    setCampaign(initialCampaign);
    const sm = new GameStateMachine(module, initialCampaign, null);
    setStateMachine(sm);
  }, [module, loadedFromSave, campaign, setCampaign, setStateMachine]);

  const handleSceneChange = useCallback(
    (sceneId: string) => {
      const currentCampaign = useGameStore.getState().campaign;
      const currentModule = useGameStore.getState().module;
      const sm = useGameStore.getState().stateMachine;
      if (!currentCampaign || !currentModule || !sm) return;

      // 避免重复添加场景历史
      const newHistory = currentCampaign.scene_history.includes(sceneId)
        ? currentCampaign.scene_history
        : [...currentCampaign.scene_history, sceneId];

      const updatedCampaign = {
        ...currentCampaign,
        current_scene: sceneId,
        scene_history: newHistory,
      };

      setCampaign(updatedCampaign);
      // 同步更新 stateMachine，确保后续状态操作一致
      sm.campaign = updatedCampaign;
      sm.currentScene = currentModule.scenes[sceneId];
    },
    [setCampaign]
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

  // 处理自由输入：通过 GameStateMachine / ActionHandler 处理玩家输入并显示 AI 响应
  // Phase 1-E: 当意图为高置信度（>=0.6）非 'chat' 时，触发行动模式
  // Phase 1-D: 当意图为 chat 或 confidence < 0.6 时，进入闲聊模式，直接调用 LLM streaming
  const handleFreeInput = useCallback(
    async (text: string) => {
      const sm = useGameStore.getState().stateMachine;
      if (!sm || !module) return;

      // 先显示玩家输入作为对话
      vnRef.current?.displayNarration(`> ${text}`, '你');

      // 获取 LLM 配置并解析意图
      const { llm } = useSettingsStore.getState();
      const llmClient = new LLMClient(llm);
      const parser = new IntentParser(llmClient);

      let intentResult: IntentResult;
      try {
        intentResult = await parser.parse(text);
      } catch (err) {
        console.error('意图解析失败:', err);
        intentResult = { intent: 'chat', confidence: 0, extractedParams: {} };
      }

      // Phase 1-E: 高置信度非 chat 意图 → 行动模式
      if (intentResult.confidence >= 0.6 && intentResult.intent !== 'chat') {
        const actionHandler = new ActionHandler(sm);
        const actionResult = await actionHandler.dispatch(intentResult, text);

        // 显示系统反馈叙事
        if (actionResult.narration) {
          vnRef.current?.displayNarration(actionResult.narration, null);
        }

        // 根据行动模式触发对应系统
        if (actionResult.uiAction === 'save') {
          handleOpenSave();
          return;
        }
        if (actionResult.uiAction === 'settings') {
          handleSettings();
          return;
        }

        // 战斗启动：手动触发 CombatOverlay
        if (actionResult.combatStart) {
          vnRef.current?.triggerCombat(actionResult.combatStart.enemies);
          return;
        }

        // 场景切换：通过 VN 引擎切换（触发 onSceneChange 同步更新 gameStore + stateMachine）
        if (actionResult.sceneChange) {
          const snapshot = vnRef.current?.getSnapshot();
          if (snapshot) {
            vnRef.current?.restoreSnapshot({
              ...snapshot,
              currentSceneId: actionResult.sceneChange.to,
            });
          }
          return;
        }

        // 事件触发：narration 已显示，无需额外操作
        if (actionResult.eventTrigger) {
          return;
        }

        return;
      }

      // Phase 1-D: 闲聊模式 — 当意图为 chat 或 confidence < 0.6 时，直接调用 LLM 生成叙事回复
      if (intentResult.intent === 'chat' || intentResult.confidence < 0.6) {
        try {
          const messages = [
            {
              role: 'system' as const,
              content:
                '你是AI-GM，一个TRPG游戏的叙事型AI主持人。根据玩家的自由输入，生成沉浸式的、符合游戏世界观的叙事回复。保持角色扮演风格，回复简洁（1-3句话），中文回答。',
            },
            { role: 'user' as const, content: text },
          ];

          // 开始 streaming 对话
          vnRef.current?.startChatStream('AI-GM');

          const stream = llmClient.streamChat(messages, { maxTokens: 256, temperature: 0.7 });
          let buffer = '';

          // 收集所有 streaming 内容
          for await (const chunk of stream) {
            buffer += chunk;
          }

          // 逐字打字机效果显示
          const chars = Array.from(buffer);
          let idx = 0;
          const typeInterval = setInterval(() => {
            if (idx < chars.length) {
              vnRef.current?.appendChatStream(chars[idx]);
              idx++;
            } else {
              clearInterval(typeInterval);
              vnRef.current?.endChatStream();
            }
          }, 30);
        } catch (err) {
          console.error('Chat streaming failed:', err);
          vnRef.current?.displayNarration('【系统】AI-GM 连接失败，请检查 LLM 配置。', '系统');
        }
        return;
      }

      // 兜底：非 chat 但 confidence < 0.6 已在上层处理，此处不应到达
      // 若到达，回退到 stateMachine 默认流程
      try {
        const result = await sm.processAction({
          action_type: 'free_input',
          player_input: text,
        });

        if (result.narration) {
          const npcId = (result as any).npc_id as string | undefined;
          const speaker = npcId ? module.npcs?.[npcId]?.name || null : null;
          vnRef.current?.displayNarration(result.narration, speaker);
        }

        // 如果 result 包含可用动作，转换为选项显示
        if (result.available_actions && result.available_actions.length > 0) {
          const newChoices = result.available_actions.map((action: any, idx: number) => ({
            id: `action_${idx}_${action.type}`,
            text: action.label || action.type,
            disabled: false,
          }));
          // 通过更新 VN 状态添加选项（需要访问 vnRef 的 snapshot 再 restore）
          const snapshot = vnRef.current?.getSnapshot();
          if (snapshot) {
            vnRef.current?.restoreSnapshot({
              ...snapshot,
              choices: newChoices,
            });
          }
        }
      } catch (err: any) {
        console.error('自由输入处理失败:', err);
        vnRef.current?.displayNarration('【系统】处理输入时出错，请重试。', null);
      }
    },
    [module, handleOpenSave, handleSettings]
  );

  // 游戏启动时应用全屏设置
  useEffect(() => {
    const { game } = useSettingsStore.getState();
    if (game.fullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  // 监听全屏变化，同步到 settingsStore（解决 P1：双向同步缺失）
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!document.fullscreenElement;
      useSettingsStore.getState().setGame({ fullscreen: isFullscreen });
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 监听 F11 全屏快捷键（仅在 Electron 环境下拦截，避免影响浏览器默认行为）
  useEffect(() => {
    const isElectron = typeof electronAPI !== 'undefined' && electronAPI !== null;
    const handleFullscreenKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        if (isElectron) e.preventDefault();
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
        onFreeInput={handleFreeInput}
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
