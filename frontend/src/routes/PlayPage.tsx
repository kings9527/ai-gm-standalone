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
import type { VNChoice } from '../types/engine';
import { electronAPI } from '../api/electron';
import { sfxMenuOpen, sfxMenuClose, sfxClick, sfxSave } from '../utils/soundfx';

import { useSettingsStore } from '../stores/settingsStore';
import SettingsPage from '../components/settings/SettingsPage';
import { IntentParser, type IntentResult } from '../engine/intent-parser';
import { LLMClient } from '../llm/client';
import { ActionHandler, type SettingsCommand } from '../engine/action-handler';
import { ImageBridge } from '../engine/image-bridge';
import { NPCDialogueSystem } from '../engine/npc-system';
import { ExploreSystem } from '../engine/explore-system';
import { LLMOptionGenerator } from '../llm/llm-option-generator';
import { StoryEngine } from '../engine/story-engine';
import { EmotionEngine } from '../engine/emotion-engine';

const PlayPage: React.FC = () => {
  const navigate = useNavigate();
  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [savePanelMode, setSavePanelMode] = useState<'save' | 'load'>('save');
  const [savePanelOpen, setSavePanelOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsCommand, setSettingsCommand] = useState<SettingsCommand | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const {
    campaign,
    currentSceneId,
    setCampaign,
    setModule: setStoreModule,
    setStateMachine,
    reset: resetGameStore,
    restoreFromSave,
    addInputHistory,
  } = useGameStore();

  const [loadedFromSave, setLoadedFromSave] = useState(false);
  const [loadedSceneId, setLoadedSceneId] = useState<string | undefined>(undefined);

  const vnRef = useRef<VisualNovelEngineHandle>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const combatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Phase 2-F: NPC 对话系统实例 */
  const npcDialogueRef = useRef<NPCDialogueSystem | null>(null);
  /** Phase 3-A: LLM 动态选项生成器实例 */
  const llmOptionGeneratorRef = useRef<LLMOptionGenerator | null>(null);

  /** Phase 3-E: 情绪/氛围引擎实例 */
  const emotionEngineRef = useRef<EmotionEngine | null>(null);
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
        // Phase 3-E: 初始化情绪/氛围引擎
        if (!emotionEngineRef.current) {
          emotionEngineRef.current = new EmotionEngine({
            onAtmosphereChange: (prev, next, event) => {
              console.log(`[EmotionEngine] ${prev?.type} → ${next.type} (${event.source})`);
              useGameStore.getState().setAtmosphere(next.type);
            },
            onVisualFeedback: (effects) => {
              const engine = emotionEngineRef.current;
              if (!engine || !vnRef.current) return;
              const overlay = engine.getOverlayStyle();
              const filter = engine.getCSSFilter();
              const vnEffects = engine.getVisualEffects();
              vnRef.current.applyAtmosphere(overlay, filter, [...vnEffects, ...effects]);
              useGameStore.getState().setAtmosphereOverlay(overlay);
              useGameStore.getState().setAtmosphereFilter(filter);
              // Phase 3-E: 更新 CSS 变量（动态主题）
              const cssVars = engine.getCSSVariables();
              Object.entries(cssVars).forEach(([key, val]) => {
                document.documentElement.style.setProperty(key, val);
              });
            },
          });
        }
        emotionEngineRef.current.setModule(data);
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
      npcDialogueHistory: {}, // Phase 3-D: 初始化空对话历史
    };

    setCampaign(initialCampaign);
    const { llm } = useSettingsStore.getState();
    const llmClient = new LLMClient(llm);
    const sm = new GameStateMachine(module, initialCampaign, llmClient);
    setStateMachine(sm);

    // Phase 2-F: 初始化 NPC 对话系统（Phase 3-D: 传入历史回调实现跨场景记忆）
    npcDialogueRef.current = new NPCDialogueSystem(initialCampaign, module, {
      npcDialogueHistory: initialCampaign.npcDialogueHistory ?? {},
      onHistoryUpdate: (history) => useGameStore.getState().setNpcDialogueHistory(history),
    });

    // Phase 3-A: 初始化 LLM 动态选项生成器
    llmOptionGeneratorRef.current = new LLMOptionGenerator(llmClient);
  }, [module, loadedFromSave, campaign, setCampaign, setStateMachine]);

  // Phase 1-F: 从 store 读取输入历史，用于触发选项重新生成
  const inputHistory = useGameStore((state) => state.inputHistory);

  /**
   * Phase 3-A: 生成 LLM 动态选项并更新 VN 引擎 choices
   */
  const generateAndUpdateChoices = useCallback(async () => {
    const currentCampaign = useGameStore.getState().campaign;
    const currentModule = useGameStore.getState().module;
    const currentSceneId = useGameStore.getState().currentSceneId;
    const gen = llmOptionGeneratorRef.current;
    if (!gen || !currentCampaign || !currentModule || !currentSceneId) return;

    const scene = currentModule.scenes[currentSceneId];
    if (!scene) return;

    try {
      const { inputHistory } = useGameStore.getState();
      const dialogue = vnRef.current?.getSnapshot()?.dialogue;

      const choices = await gen.generateOptions({
        scene,
        campaign: currentCampaign,
        module: currentModule,
        inputHistory: inputHistory.slice(-10),
        lastPlayerInput: inputHistory[inputHistory.length - 1],
        currentDialogue: dialogue?.text || undefined,
        currentSpeaker: dialogue?.speaker || undefined,
      });

      // 更新 VN 引擎的 choices
      const snapshot = vnRef.current?.getSnapshot();
      if (snapshot && vnRef.current) {
        vnRef.current.restoreSnapshot({
          ...snapshot,
          choices,
        });
      }
    } catch (err) {
      console.warn('[PlayPage] 生成选项失败:', err);
    }
  }, []);

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

      // Phase 2-F: 检查 NPC 主动发起对话（Phase 3-D: 保留历史上下文实现跨场景记忆）
      if (npcDialogueRef.current) {
        const currentHistory = useGameStore.getState().npcDialogueHistory;
        npcDialogueRef.current = new NPCDialogueSystem(updatedCampaign, currentModule, {
          npcDialogueHistory: currentHistory,
          onHistoryUpdate: (history) => useGameStore.getState().setNpcDialogueHistory(history),
        });
        const initiative = npcDialogueRef.current.checkNPCInitiative(sceneId);
        if (initiative.triggered && initiative.npcId) {
          const npc = currentModule.npcs?.[initiative.npcId];
          if (npc && vnRef.current) {
            vnRef.current.displayNPCDialogue(
              initiative.text || '',
              npc.name,
              initiative.emotion || 'alert',
              true, // initiative = true
            );
          }
        }
      }

      // Phase 3-A: 场景切换后由 useEffect 监听 currentSceneId 变化自动触发选项生成
      // 无需在此手动调用，避免重复生成

      // Phase 3-E: 分析新场景氛围并触发视觉反馈
      const newScene = currentModule.scenes[sceneId];
      if (newScene && emotionEngineRef.current) {
        const event = emotionEngineRef.current.analyzeScene(newScene);
        if (event) {
          emotionEngineRef.current.triggerEvent(event);
        }
      }
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

        const { llm } = useSettingsStore.getState();
        const llmClient = new LLMClient(llm);
        const sm = new GameStateMachine(restoredModule, restoredCampaign, llmClient);
        setStateMachine(sm);

        if (save.vnSnapshot && vnRef.current) {
          vnRef.current.restoreSnapshot(save.vnSnapshot);
        }

        // Phase 2-F: 重置 NPC 对话状态（Phase 3-D: 恢复历史记忆）
        npcDialogueRef.current = new NPCDialogueSystem(restoredCampaign, restoredModule, {
          npcDialogueHistory: restoredCampaign.npcDialogueHistory ?? {},
          onHistoryUpdate: (history) => useGameStore.getState().setNpcDialogueHistory(history),
        });

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
    setSettingsCommand(null);
    setSettingsModalOpen(true);
  }, []);

  const handleCloseSettingsModal = useCallback(() => {
    setSettingsModalOpen(false);
    setSettingsCommand(null);
    setIsPaused(false);
  }, []);

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

      // 清除待触发的战斗定时器，防止自由输入与战斗触发状态冲突
      if (combatTimerRef.current) {
        clearTimeout(combatTimerRef.current);
        combatTimerRef.current = null;
      }

      // 先显示玩家输入作为对话
      vnRef.current?.displayNarration(`> ${text}`, '你');

      // Phase 2-F: 优先检查 NPC 对话系统 — 如果玩家输入涉及场景中的 NPC，先尝试 NPC 回应
      const currentSceneId = useGameStore.getState().currentSceneId;
      if (npcDialogueRef.current && currentSceneId) {
        const { llm } = useSettingsStore.getState();
        const llmClient = new LLMClient(llm);
        const npcResult = await npcDialogueRef.current.processPlayerInput(
          text,
          currentSceneId,
          llmClient,
        );

        if (npcResult) {
          // NPC 匹配成功，显示 NPC 对话
          const npc = module.npcs?.[npcResult.npcId];
          if (npc && vnRef.current) {
            vnRef.current.displayNPCDialogue(
              npcResult.result.text,
              npc.name,
              npcResult.result.emotion,
              false, // 不是主动发起
            );

            // 应用对话效果到 campaign 状态
            npcDialogueRef.current.applyDialogueEffects(npcResult.npcId, npcResult.result);

            // 如果对话结束，清除 NPC 对话状态
            if (npcResult.result.endDialogue) {
              npcDialogueRef.current.endDialogue(npcResult.npcId);
            }
          }
          return; // NPC 处理完毕，不再进入 AI-GM 流程
        }
      }

      // Phase 1-F: 保存玩家输入到历史（限制20条，去重）
      addInputHistory(text);

      // 获取 LLM 配置并解析意图
      const { llm } = useSettingsStore.getState();
      const llmClient = new LLMClient(llm);
      const parser = new IntentParser(llmClient);

      let intentResult: IntentResult;
      try {
        intentResult = await parser.parse(text);
      } catch (err) {
        // 解析失败时回退到 chat 意图
        intentResult = { intent: 'chat', confidence: 0, extractedParams: {} };
      }

      // Phase 1-E: 高置信度非 chat 意图 → 行动模式
      if (intentResult.confidence >= 0.6 && intentResult.intent !== 'chat') {
        const actionHandler = new ActionHandler(sm, llmClient);
        const actionResult = await actionHandler.dispatch(intentResult, text);

        // 显示系统反馈叙事
        if (actionResult.narration) {
          vnRef.current?.displayNarration(actionResult.narration, null);
        }

        // 根据行动模式触发对应系统
        // Phase 2-D: save 自然语言触发已由 ActionHandler 直接完成存档
        // narration 已在上方显示，无需打开面板
        if (actionResult.uiAction === 'save') {
          return;
        }
        // Phase 2-E: 设置面板自然语言触发
        if (actionResult.uiAction === 'settings') {
          setSettingsCommand(actionResult.settingsCommand || { action: 'open' });
          setSettingsModalOpen(true);
          setIsPaused(true);
          return;
        }

        // Phase 2-B: 战斗系统自然语言触发 — 先显示 LLM 生成的战斗开场描述，再延迟触发 CombatOverlay
        if (actionResult.combatStart) {
          // Phase 3-E: 触发战斗氛围（史诗感）
          emotionEngineRef.current?.triggerCombat(1);
          const textLength = (actionResult.narration || '').length;
          // 打字机速度 30ms/字符 + 1.5s 阅读缓冲，最少 2.5s
          const delay = Math.max(2500, textLength * 30 + 1500);
          combatTimerRef.current = setTimeout(() => {
            vnRef.current?.triggerCombat(actionResult.combatStart!.enemies);
          }, delay);
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

          // Phase 1-G: 图片联动桥接 — explore 意图下自动获取背景图
          if (intentResult.intent === 'explore') {
            const imageBridge = new ImageBridge();
            const imgResult = await imageBridge.bridge(text, intentResult);
            if (imgResult && vnRef.current) {
              const currentSnapshot = vnRef.current.getSnapshot();
              vnRef.current.restoreSnapshot({
                ...currentSnapshot,
                bg: imgResult.imageUrl,
                bgTransition: 'fade',
              });
            }
          }
          return;
        }

        // Phase 2-G: 探索意图下，如果无场景切换，尝试 searchable_areas 搜索
        if (intentResult.intent === 'explore' && !actionResult.sceneChange) {
          const exploreSystem = new ExploreSystem();
          const currentSceneId = useGameStore.getState().currentSceneId;
          const currentScene = currentSceneId ? module.scenes[currentSceneId] : null;
          const currentCampaign = useGameStore.getState().campaign;

          if (currentScene && currentCampaign) {
            const exploreResult = await exploreSystem.search(
              text,
              currentScene,
              currentCampaign,
              llmClient,
            );

            // 显示发现描述（覆盖 ActionHandler 的默认叙事）
            if (exploreResult.description) {
              vnRef.current?.displayNarration(exploreResult.description, null);
            }

            // ImageBridge 联动：发现新区域时切换背景图
            if (exploreResult.newBgUrl && vnRef.current) {
              const snapshot = vnRef.current.getSnapshot();
              vnRef.current.restoreSnapshot({
                ...snapshot,
                bg: exploreResult.newBgUrl,
                bgTransition: 'fade',
              });
            }

            // 如果有解锁互动物品，更新场景和 stateMachine
            if (
              exploreResult.unlockedInteractables &&
              exploreResult.unlockedInteractables.length > 0
            ) {
              const updatedInteractables = [
                ...(currentScene.interactables || []),
                ...exploreResult.unlockedInteractables,
              ];
              const updatedScene = { ...currentScene, interactables: updatedInteractables };
              // 更新 stateMachine 当前场景引用
              sm.currentScene = updatedScene;
              // 更新 module 中的场景数据
              sm.module = {
                ...sm.module,
                scenes: { ...sm.module.scenes, [currentScene.id]: updatedScene },
              };
            }

            // 显示获得物品提示
            if (exploreResult.items && exploreResult.items.length > 0) {
              const itemNames = exploreResult.items
                .map((id) => module.items?.[id]?.name || id)
                .join('、');
              setTimeout(() => {
                vnRef.current?.displayNarration(`【获得物品】${itemNames} 已加入背包。`, '系统');
              }, 500);
            }

            // 显示线索提示
            if (exploreResult.clues && exploreResult.clues.length > 0) {
              setTimeout(() => {
                vnRef.current?.displayNarration(
                  `【线索】${exploreResult.clues!.join('；')}`,
                  '系统',
                );
              }, 800);
            }

            return;
          }
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
          // Phase 1-F: 构建带历史上下文的 messages
          const { inputHistory } = useGameStore.getState();
          const recentHistory = inputHistory.slice(-10); // 最近10条作为上下文

          const historyContext = recentHistory.length > 0
            ? `以下是玩家最近的输入历史（供你参考上下文，但不要直接回复历史内容）：\n${recentHistory.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\n`
            : '';

          // Phase 3-E: 获取当前氛围语调提示
          const tonePrompt = emotionEngineRef.current?.getTonePrompt() || '';

          const messages = [
            {
              role: 'system' as const,
              content:
                '你是AI-GM，一个TRPG游戏的叙事型AI主持人。根据玩家的自由输入，生成沉浸式的、符合游戏世界观的叙事回复。保持角色扮演风格，回复简洁（1-3句话），中文回答。' +
                (tonePrompt ? '\n\n【当前氛围指令】' + tonePrompt : ''),
            },
            // Phase 1-F: 在历史非空时，以 assistant 角色注入历史上下文提示
            ...(recentHistory.length > 0
              ? [{ role: 'assistant' as const, content: historyContext }]
              : []),
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

        // Phase 3-C: 处理 LLM 驱动的剧情推进结果
        if (result.type === 'story_progression' || result.type === 'story_progression_scene_change') {
          // 显示叙事
          if (result.narration) {
            vnRef.current?.displayNarration(result.narration, null);
          }

          // Phase 3-C: 显示 NPC 对话（如果 StoryEngine 生成了）
          const sp = (result as any).storyProgression;
          if (sp?.npcDialogue) {
            const npc = module.npcs?.[sp.npcDialogue.npcId];
            if (npc && vnRef.current) {
              setTimeout(() => {
                vnRef.current?.displayNPCDialogue(
                  sp.npcDialogue.text,
                  npc.name,
                  sp.npcDialogue.emotion || 'neutral',
                  false,
                );
              }, 500);
            }
          }

          // Phase 3-C: 应用全局变量更新到 store
          const gvu = (result as any).globalVarUpdates;
          if (gvu && Object.keys(gvu).length > 0) {
            const currentCampaign = useGameStore.getState().campaign;
            if (currentCampaign) {
              setCampaign({
                ...currentCampaign,
                global_vars: { ...currentCampaign.global_vars, ...gvu },
              });
              // 同步到 stateMachine
              sm.campaign = {
                ...sm.campaign,
                global_vars: { ...sm.campaign.global_vars, ...gvu },
              };
            }
          }

          // Phase 3-C: 应用 NPC 状态更新到 store
          const nsu = (result as any).npcStateUpdates;
          if (nsu && Object.keys(nsu).length > 0) {
            const currentCampaign = useGameStore.getState().campaign;
            if (currentCampaign) {
              const updatedNpcs = { ...currentCampaign.npcs_state };
              for (const [npcId, updates] of Object.entries(nsu)) {
                const base = updatedNpcs[npcId] || {};
                updatedNpcs[npcId] = Object.assign({}, base, updates as Record<string, unknown>);
              }
              setCampaign({ ...currentCampaign, npcs_state: updatedNpcs });
              sm.campaign = { ...sm.campaign, npcs_state: updatedNpcs };
            }
          }

          // Phase 3-C: 处理场景切换建议
          if (result.type === 'story_progression_scene_change') {
            const sc = (result as any).sceneChange;
            if (sc?.to) {
              setTimeout(() => {
                handleSceneChange(sc.to);
              }, 1500);
            }
          }

          // Phase 3-C: 更新建议动作到 VN 选项
          if (result.available_actions && result.available_actions.length > 0) {
            const newChoices = result.available_actions.map((action: any, idx: number) => ({
              id: `story_${idx}_${action.type}`,
              text: action.label || action.type,
              disabled: false,
            }));
            const snapshot = vnRef.current?.getSnapshot();
            if (snapshot) {
              vnRef.current?.restoreSnapshot({ ...snapshot, choices: newChoices });
            }
          }

          return;
        }

        // 原有兜底逻辑
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
      } catch (_err) {
        vnRef.current?.displayNarration('【系统】处理输入时出错，请重试。', null);
      }
    },
    [module, handleOpenSave, handleSettings, addInputHistory]
  );

  // Phase 3-A: 处理 VN 引擎中特殊选项（combat / custom）
  const handleChoice = useCallback(
    (choice: VNChoice) => {
      if (choice.action === 'combat') {
        const currentSceneId = useGameStore.getState().currentSceneId;
        const currentModule = useGameStore.getState().module;
        if (!currentSceneId || !currentModule) return;
        const scene = currentModule.scenes[currentSceneId];
        if (scene?.combat?.enabled && scene.combat.enemies.length > 0) {
          vnRef.current?.triggerCombat(scene.combat.enemies);
        }
      } else if (choice.action === 'custom' && choice.target) {
        const currentModule = useGameStore.getState().module;
        const npc = currentModule?.npcs?.[choice.target];
        const item = currentModule?.items?.[choice.target];
        const label = npc?.name || item?.name || choice.target;
        vnRef.current?.displayNarration(`你决定调查 ${label}...`, '你');
      }
    },
    []
  );

  // Phase 3-A: 当场景切换或玩家输入历史更新时，重新生成 LLM 动态选项
  useEffect(() => {
    if (!module || loading || !currentSceneId) return;
    generateAndUpdateChoices();
   
  }, [currentSceneId, inputHistory.length, module, loading]);

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
      if (combatTimerRef.current) clearTimeout(combatTimerRef.current);
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
        onChoice={handleChoice} // Phase 3-A: 传递选项选择回调
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
      {/* Phase 2-E: 设置面板模态框 */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-4xl h-[85vh] mx-4">
            <SettingsPage
              isModal
              fromGame
              onClose={handleCloseSettingsModal}
              externalCommand={settingsCommand}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayPage;
