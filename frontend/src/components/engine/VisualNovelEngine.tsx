import React, { useState, useCallback, useEffect, useRef, useImperativeHandle, forwardRef, Suspense } from 'react';
import { motion } from 'framer-motion';
import BackgroundLayer from './BackgroundLayer';
import SpriteLayer from './SpriteLayer';
import DialogueLayer from './DialogueLayer';
import EffectLayer from './EffectLayer';
import type { VNState, VNEffect, VNChoice } from '../../types/engine';
import type { Module, Scene, NPC } from '../../types/module';
import { useGameStore } from '../../stores/gameStore';
import { sfxMenuOpen, sfxMenuClose, sfxSave, sfxClick } from '../../utils/soundfx';

// CombatOverlay is lazy-loaded because combat is not always triggered
const CombatOverlay = React.lazy(() => import('../combat/CombatOverlay'));

// Module-level cache for html-to-image to avoid repeated dynamic imports
let htmlToImageModule: typeof import('html-to-image') | null = null;
async function getToPng() {
  if (!htmlToImageModule) {
    htmlToImageModule = await import('html-to-image');
  }
  return htmlToImageModule.toPng;
}

export interface VisualNovelEngineHandle {
  getSnapshot: () => VNState;
  takeThumbnail: () => Promise<string | undefined>;
  restoreSnapshot: (snapshot: VNState) => void;
  displayNarration: (text: string, speaker?: string | null) => void;
  startChatStream: (speaker?: string | null) => void;
  appendChatStream: (chunk: string) => void;
  endChatStream: () => void;
  triggerCombat: (enemies: string[]) => void;
  /** Phase 2-F: 显示 NPC 对话 */
  displayNPCDialogue: (text: string, speaker: string, emotion: string, initiative?: boolean) => void;
  /** Phase 3-E: 应用氛围视觉反馈 */
  applyAtmosphere: (overlay: React.CSSProperties, filter: string, effects?: VNEffect[]) => void;
  /** Phase 3-E: 清除氛围视觉反馈 */
  clearAtmosphere: () => void;
}

interface VisualNovelEngineProps {
  module: Module;
  initialSceneId?: string;
  isPaused?: boolean;
  onSave?: () => void;
  onMenuToggle?: () => void;
  onSceneChange?: (sceneId: string) => void;
  onCombatEnd?: (result: 'victory' | 'defeat' | 'fled') => void;
  onAutoSave?: (snapshot: VNState, thumbnail: string) => void; // 关键节点自动存档
  onFreeInput?: (text: string) => void;
  /** Phase 3-A: 选项选择回调 — 当玩家选择非标准选项（combat/custom/dice_check 等）时触发 */
  onChoice?: (choice: VNChoice) => void;
}

/**
 * VisualNovelEngine
 * Main orchestrator: composes BG → Sprite → Dialogue → Effect layers.
 * Manages scene transitions, state updates, and sprite interactions.
 * Integrates with gameStore for save/load state synchronization.
 * Supports pause/resume for in-game menu overlay.
 * Supports snapshot save/restore for save/load system.
 */
export const VisualNovelEngine = forwardRef<VisualNovelEngineHandle, VisualNovelEngineProps>(
  ({ module, initialSceneId, isPaused = false, onSave, onMenuToggle, onSceneChange, onCombatEnd, onAutoSave, onFreeInput, onChoice }, ref) => {
    const startScene = initialSceneId || module.start_scene;
    const [vnState, setVnState] = useState<VNState>({
      currentSceneId: startScene,
      bg: '',
      bgTransition: 'fade',
      sprites: [],
      dialogue: null,
      choices: [],
      effects: [],
      isTransitioning: false,
      isChatStreaming: false,
      atmosphereOverlay: {},
      atmosphereFilter: '',
    });

    const [currentScene, setCurrentScene] = useState<Scene | null>(null);
    const [combatActive, setCombatActive] = useState(false);
    const [combatEnemies, setCombatEnemies] = useState<NPC[]>([]);
    /** Phase 2-F: NPC 对话状态 */
    const [npcDialogueState, setNpcDialogueState] = useState<{
      active: boolean;
      emotion: string;
      initiative: boolean;
    }>({ active: false, emotion: '', initiative: false });

    const { updateScene, setCurrentSceneId, campaign, setCombatState } = useGameStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const vnStateRef = useRef(vnState);
    const isPausedRef = useRef(isPaused);
    const prevSceneIdRef = useRef<string | null>(null);
    const prevCombatActiveRef = useRef(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingAutoSaveRef = useRef(false);

    // Sync refs to latest values without triggering effects
    useEffect(() => { vnStateRef.current = vnState; }, [vnState]);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    // Load scene data when scene changes
    useEffect(() => {
      const scene = module.scenes[vnState.currentSceneId];
      if (!scene) {
        return;
      }

      setCurrentScene(scene);
      setCurrentSceneId(vnState.currentSceneId);
      updateScene(vnState.currentSceneId);

      // Determine who is speaking from dialogue
      const speakerId = scene.dialogue?.speaker
        ? Object.keys(module.npcs || {}).find(
            (id) => module.npcs[id]?.name === scene.dialogue!.speaker
          )
        : null;

      // Map scene data to VN state
      const newState: Partial<VNState> = {
        bg: scene.bg || '#0a0a0a',
        bgTransition: 'fade',
        sprites: (scene.sprites || []).map((s) => {
          const npc = module.npcs[s.char_id];
          return {
            charId: s.char_id,
            name: npc?.name || s.char_id,
            imageUrl: npc?.sprites?.[s.expression] || '',
            position: s.position,
            expression: s.expression,
            isSpeaking: speakerId === s.char_id,
            enterAnimation: s.enter_animation,
            opacity: 1,
          };
        }),
        dialogue: scene.dialogue
          ? {
              speaker: scene.dialogue.speaker,
              text: scene.dialogue.text,
              typewriter: scene.dialogue.typewriter ?? true,
              typewriterSpeed: 30,
              speakerColor: '#e2e8f0',
            }
          : null,
        choices: (scene.choices || []).map((c) => ({
          id: c.id,
          text: c.text,
          disabled: false,
        })),
        effects: [],
        isTransitioning: false,
      };

      setVnState((prev) => ({ ...prev, ...newState }));

      // 检查场景是否有战斗配置，自动触发战斗
      if (scene.combat?.enabled && scene.combat.enemies && scene.combat.enemies.length > 0) {
        const enemyNPCs = scene.combat.enemies
          .map((eid) => module.npcs?.[eid])
          .filter(Boolean) as NPC[];
        setCombatEnemies(enemyNPCs);
        setCombatActive(true);
      } else {
        setCombatActive(false);
        setCombatEnemies([]);
      }

      // Auto-clear transition flag after animation
      const timer = setTimeout(() => {
        setVnState((prev) => ({ ...prev, isTransitioning: false }));
      }, 1200);

      return () => clearTimeout(timer);
     
    }, [vnState.currentSceneId, module]);

    // 关键节点自动存档：场景切换
    useEffect(() => {
      if (prevSceneIdRef.current && prevSceneIdRef.current !== vnState.currentSceneId) {
        // 场景切换触发自动存档（防抖）
        if (onAutoSave && !isPausedRef.current) {
          debouncedAutoSave();
        }
        onSceneChange?.(vnState.currentSceneId);
      }
      prevSceneIdRef.current = vnState.currentSceneId;
     
    }, [vnState.currentSceneId]);

    // 关键节点自动存档：战斗开始
    useEffect(() => {
      if (combatActive && !prevCombatActiveRef.current) {
        // 战斗开始触发自动存档（防抖）
        if (onAutoSave && !isPausedRef.current) {
          debouncedAutoSave();
        }
      }
      prevCombatActiveRef.current = combatActive;
     
    }, [combatActive]);

    const takeSnapshotAndSave = useCallback(async () => {
      if (!containerRef.current) return;
      try {
        const toPng = await getToPng();
        const dataUrl = await toPng(containerRef.current, {
          width: 320,
          height: 180,
          pixelRatio: 1,
          cacheBust: true,
          style: {
            transform: 'scale(0.25)',
            transformOrigin: 'top left',
          },
        });
        onAutoSave?.(vnStateRef.current, dataUrl);
      } catch (err) {
        // 降级：使用背景图作为缩略图
        const bg = vnStateRef.current.bg;
        onAutoSave?.(vnStateRef.current, bg);
      }
    }, [onAutoSave]);

    /**
     * BUG-9 修复：自动存档防抖
     * 快速切场景时，只保留最后一次存档请求，延迟 800ms 执行。
     * 避免高频场景切换导致存档泛滥和缩略图生成堆积。
     */
    const debouncedAutoSave = useCallback(() => {
      pendingAutoSaveRef.current = true;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        pendingAutoSaveRef.current = false;
        requestAnimationFrame(() => {
          takeSnapshotAndSave();
        });
      }, 800);
    }, [takeSnapshotAndSave]);

    // 组件卸载时清理防抖定时器，防止内存泄漏和悬空存档
    useEffect(() => {
      return () => {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
      };
    }, []);

    // ESC key handler for menu (only when not paused by external)
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          // 战斗激活时让 CombatOverlay 优先处理 Escape
          if (combatActive) return;
          onMenuToggle?.();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onMenuToggle, combatActive]);

    const handleAdvance = useCallback(() => {
      if (currentScene?.exits && currentScene.exits.length > 0) {
        const exit = currentScene.exits[0];
        if (exit) {
          setVnState((prev) => ({
            ...prev,
            currentSceneId: exit.target,
            isTransitioning: true,
          }));
        }
      }
    }, [currentScene]);

    const handleChoice = useCallback(
      (choiceId: string) => {
        // Phase 3-A: 从 vnState.choices 查找（支持 LLM 动态生成的选项）
        const choice = vnState.choices.find((c) => c.id === choiceId);
        if (!choice) return;

        if (choice.action === 'scene' && choice.target) {
          setVnState((prev) => ({
            ...prev,
            currentSceneId: choice.target!,
            isTransitioning: true,
          }));
        } else if (choice.action === 'next') {
          handleAdvance();
        } else if (choice.action === 'dice_check') {
          const diceEffect: VNEffect = {
            type: 'shake',
            intensity: 0.8,
            duration: 800,
          };
          setVnState((prev) => ({
            ...prev,
            effects: [...prev.effects, diceEffect],
          }));
        } else if (choice.action === 'combat') {
          // Phase 3-A: 触发战斗（由上层 PlayPage 处理具体逻辑）
          onChoice?.(choice);
        } else if (choice.action === 'free_input') {
          // Phase 3-A: 自由输入 — 不处理，由 DialogueLayer 直接触发 onFreeInput
          // 这里不需要额外操作
        } else {
          // Phase 3-A: custom 或其他未知 action，委托给上层 PlayPage
          onChoice?.(choice);
        }
      },
      [vnState.choices, handleAdvance, onChoice]
    );

    const handleSpriteClick = useCallback((charId: string) => {
      setVnState((prev) => ({
        ...prev,
        sprites: prev.sprites.map((s) => ({
          ...s,
          isSpeaking: s.charId === charId,
        })),
      }));
    }, []);

    // 战斗结束回调
    const handleCombatEnd = useCallback(
      (result: 'victory' | 'defeat' | 'fled') => {
        setCombatActive(false);
        setCombatState(null);
        onCombatEnd?.(result);

        // 战斗结束后根据结果推进场景
        if (result === 'victory' && currentScene?.exits && currentScene.exits.length > 0) {
          handleAdvance();
        } else if (result === 'fled' && currentScene?.exits && currentScene.exits.length > 0) {
          const history = campaign?.scene_history;
          const prevScene = history && history.length >= 2 ? history[history.length - 2] : undefined;
          if (prevScene) {
            setVnState((prev) => ({
              ...prev,
              currentSceneId: prevScene,
              isTransitioning: true,
            }));
          }
        }
      },
       
      [currentScene, campaign, onCombatEnd]
    );

    // 战斗状态更新
    const handleCombatUpdate = useCallback(
      (cState: any) => {
        setCombatState(cState);
      },
      [setCombatState]
    );

    const handleEffectEnd = useCallback((index: number) => {
      setVnState((prev) => ({
        ...prev,
        effects: prev.effects.filter((_, i) => i !== index),
      }));
    }, []);

    const handleAddEffect = useCallback((effect: VNEffect) => {
      setVnState((prev) => ({
        ...prev,
        effects: [...prev.effects, effect],
      }));
    }, []);

    // Expose imperative methods for save/load system
    useImperativeHandle(ref, () => ({
      getSnapshot: () => vnStateRef.current,
      takeThumbnail: async () => {
        if (!containerRef.current) return undefined;
        try {
          const toPng = await getToPng();
          return await toPng(containerRef.current, {
            width: 320,
            height: 180,
            pixelRatio: 1,
            cacheBust: true,
            style: {
              transform: 'scale(0.25)',
              transformOrigin: 'top left',
            },
          });
        } catch (err) {
          return vnStateRef.current.bg;
        }
      },
      restoreSnapshot: (snapshot: VNState) => {
        setVnState(snapshot);
        // 同步更新 gameStore 中的场景ID
        setCurrentSceneId(snapshot.currentSceneId);
        updateScene(snapshot.currentSceneId);
      },
      displayNarration: (text: string, speaker?: string | null) => {
        setVnState((prev) => ({
          ...prev,
          dialogue: {
            speaker: speaker ?? null,
            text,
            typewriter: true,
            typewriterSpeed: 30,
            speakerColor: '#e2e8f0',
          },
          choices: [],
          isChatStreaming: false,
        }));
      },
      // Phase 1-D: 闲聊模式 streaming 支持
      startChatStream: (speaker?: string | null) => {
        setVnState((prev) => ({
          ...prev,
          dialogue: {
            speaker: speaker ?? null,
            text: '',
            typewriter: false,
            typewriterSpeed: 30,
            speakerColor: '#e2e8f0',
          },
          choices: [],
          isChatStreaming: true,
        }));
      },
      appendChatStream: (chunk: string) => {
        setVnState((prev) => ({
          ...prev,
          dialogue: prev.dialogue
            ? {
                ...prev.dialogue,
                text: prev.dialogue.text + chunk,
              }
            : null,
        }));
      },
      endChatStream: () => {
        setVnState((prev) => ({ ...prev, isChatStreaming: false }));
      },
      // Phase 2-F: 手动触发战斗（自由输入 combat 意图）
      triggerCombat: (enemies: string[]) => {
        const enemyNPCs = enemies
          .map((eid) => module.npcs?.[eid])
          .filter(Boolean) as NPC[];
        setCombatEnemies(enemyNPCs);
        setCombatActive(true);
      },
      // Phase 2-F: 显示 NPC 对话
      displayNPCDialogue: (text: string, speaker: string, emotion: string, initiative = false) => {
        setVnState((prev) => ({
          ...prev,
          dialogue: {
            speaker,
            text,
            typewriter: true,
            typewriterSpeed: 30,
            speakerColor: '#e2e8f0',
          },
          choices: [],
          isChatStreaming: false,
        }));
        setNpcDialogueState({ active: true, emotion, initiative });
      },
      // Phase 3-E: 应用氛围视觉反馈
      applyAtmosphere: (overlay: React.CSSProperties, filter: string, effects?: VNEffect[]) => {
        setVnState((prev) => ({
          ...prev,
          atmosphereOverlay: overlay,
          atmosphereFilter: filter,
          effects: effects ? [...prev.effects, ...effects] : prev.effects,
        }));
      },
      // Phase 3-E: 清除氛围视觉反馈
      clearAtmosphere: () => {
        setVnState((prev) => ({
          ...prev,
          atmosphereOverlay: {},
          atmosphereFilter: '',
        }));
      },
    }));

    if (!currentScene) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black text-gray-400">
          加载场景中...
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden bg-black select-none"
        style={{ transform: 'translateZ(0)' }} // 开启 GPU 加速，提高截图稳定性
      >
        {/* Layer 1: Background */}
        <BackgroundLayer
          bg={vnState.bg}
          transition={vnState.bgTransition}
          isPaused={isPaused}
          atmosphereOverlay={vnState.atmosphereOverlay}
          atmosphereFilter={vnState.atmosphereFilter}
        />

        {/* Layer 2: Sprites */}
        <SpriteLayer sprites={vnState.sprites} onSpriteClick={handleSpriteClick} isPaused={isPaused} />

        {/* Layer 3: Dialogue + Choices */}
        <DialogueLayer
          dialogue={vnState.dialogue}
          choices={vnState.choices}
          onAdvance={handleAdvance}
          onChoice={handleChoice}
          onFreeInput={onFreeInput}
          isPaused={isPaused}
          isStreaming={vnState.isChatStreaming}
          npcInitiative={npcDialogueState.initiative}
          npcEmotion={npcDialogueState.emotion}
          mixedDisplay={true} // Phase 3-A: 启用混合显示模式
        />

        {/* Layer 4: Effects */}
        <EffectLayer effects={vnState.effects} onEffectEnd={handleEffectEnd} isPaused={isPaused} />

        <Suspense fallback={null}>
          <CombatOverlay
            isActive={combatActive}
            player={campaign?.player || {
              name: '调查员',
              stats: {},
              hp: 12, max_hp: 12,
              sanity: 60, max_sanity: 60,
              inventory: [],
            }}
            enemies={combatEnemies}
            ambush={currentScene?.combat?.ambush || false}
            onCombatEnd={handleCombatEnd}
            onCombatUpdate={handleCombatUpdate}
            moduleItems={module.items || {}}
            playerInventory={campaign?.player?.inventory || []}
          />
        </Suspense>

        {/* Debug: Effect test buttons */}
        <div className="absolute top-4 left-4 z-30 flex flex-col gap-2">
          <span className="text-xs text-gray-600 mb-1">特效测试</span>
          <motion.button
            className="px-3 py-1.5 rounded bg-gray-900/80 border border-red-800/40 text-red-400 text-xs hover:bg-red-950/40 transition-colors"
            onClick={() => handleAddEffect({ type: 'shake', intensity: 1, duration: 600 })}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            震动
          </motion.button>
          <motion.button
            className="px-3 py-1.5 rounded bg-gray-900/80 border border-red-800/40 text-red-400 text-xs hover:bg-red-950/40 transition-colors"
            onClick={() => handleAddEffect({ type: 'flash', intensity: 0.8, duration: 400 })}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            闪光
          </motion.button>
          <motion.button
            className="px-3 py-1.5 rounded bg-gray-900/80 border border-red-800/40 text-red-400 text-xs hover:bg-red-950/40 transition-colors"
            onClick={() => handleAddEffect({ type: 'chromatic', intensity: 0.5, duration: 2000 })}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            色差
          </motion.button>
        </div>

        {/* UI Overlay: Save button */}
        {onSave && (
          <motion.button
            className="absolute top-4 right-4 z-30 px-3 py-1.5 rounded bg-gray-900/80 border border-red-800/40 text-red-400 text-sm hover:bg-red-950/40 transition-colors"
            onClick={() => {
              sfxSave();
              onSave();
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            保存
          </motion.button>
        )}
      </div>
    );
  }
);

VisualNovelEngine.displayName = 'VisualNovelEngine';

export default VisualNovelEngine;
