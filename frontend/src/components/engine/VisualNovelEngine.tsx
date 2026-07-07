import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import BackgroundLayer from './BackgroundLayer';
import SpriteLayer from './SpriteLayer';
import DialogueLayer from './DialogueLayer';
import EffectLayer from './EffectLayer';
import { CombatOverlay } from '../combat/CombatOverlay';
import type { VNState, VNEffect } from '../../types/engine';
import type { Module, Scene, NPC } from '../../types/module';
import { useGameStore } from '../../stores/gameStore';

interface VisualNovelEngineProps {
  module: Module;
  initialSceneId?: string;
  onSave?: () => void;
  onMenuToggle?: () => void;
  onSceneChange?: (sceneId: string) => void;
  onCombatEnd?: (result: 'victory' | 'defeat' | 'fled') => void;
}

/**
 * VisualNovelEngine
 * Main orchestrator: composes BG → Sprite → Dialogue → Effect layers.
 * Manages scene transitions, state updates, and sprite interactions.
 * Integrates with gameStore for save/load state synchronization.
 */
export const VisualNovelEngine: React.FC<VisualNovelEngineProps> = ({
  module,
  initialSceneId,
  onSave,
  onMenuToggle,
  onSceneChange,
  onCombatEnd,
}) => {
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
  });

  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [combatActive, setCombatActive] = useState(false);
  const [combatEnemies, setCombatEnemies] = useState<NPC[]>([]);

  const { updateScene, setCurrentSceneId, campaign, setCombatState } = useGameStore();

  // Load scene data when scene changes
  useEffect(() => {
    const scene = module.scenes[vnState.currentSceneId];
    if (!scene) {
      console.warn(`Scene not found: ${vnState.currentSceneId}`);
      return;
    }

    setCurrentScene(scene);
    setCurrentSceneId(vnState.currentSceneId);
    updateScene(vnState.currentSceneId);

    // Determine who is speaking from dialogue
    const speakerId = scene.dialogue?.speaker
      ? Object.keys(module.npcs).find(
          (id) => module.npcs[id].name === scene.dialogue!.speaker
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
    if (scene.combat?.enabled && scene.combat.enemies.length > 0) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vnState.currentSceneId, module]);

  // ESC key handler for menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onMenuToggle?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMenuToggle]);

  const handleAdvance = useCallback(() => {
    if (currentScene?.exits && currentScene.exits.length > 0) {
      const exit = currentScene.exits[0];
      setVnState((prev) => ({
        ...prev,
        currentSceneId: exit.target,
        isTransitioning: true,
      }));
    }
  }, [currentScene]);

  const handleChoice = useCallback(
    (choiceId: string) => {
      const choice = currentScene?.choices?.find((c) => c.id === choiceId);
      if (!choice) return;

      if (choice.action === 'scene' && choice.target) {
        setVnState((prev) => ({
          ...prev,
          currentSceneId: choice.target!,
          isTransitioning: true,
        }));
      } else if (choice.action === 'next') {
        handleAdvance();
      } else if (choice.action === 'dice_check' && choice.dice_check) {
        const diceEffect: VNEffect = {
          type: 'shake',
          intensity: 0.8,
          duration: 800,
        };
        setVnState((prev) => ({
          ...prev,
          effects: [...prev.effects, diceEffect],
        }));
      }
    },
    [currentScene, handleAdvance]
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
        // 胜利后继续前进
        handleAdvance();
      } else if (result === 'fled' && currentScene?.exits && currentScene.exits.length > 0) {
        // 逃跑后回到上一个场景
        const prevScene = campaign?.scene_history[campaign.scene_history.length - 2];
        if (prevScene) {
          setVnState((prev) => ({
            ...prev,
            currentSceneId: prevScene,
            isTransitioning: true,
          }));
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (!currentScene) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-gray-400">
        加载场景中...
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-black select-none">
      {/* Layer 1: Background */}
      <BackgroundLayer bg={vnState.bg} transition={vnState.bgTransition} />

      {/* Layer 2: Sprites */}
      <SpriteLayer sprites={vnState.sprites} onSpriteClick={handleSpriteClick} />

      {/* Layer 3: Dialogue + Choices */}
      <DialogueLayer
        dialogue={vnState.dialogue}
        choices={vnState.choices}
        onAdvance={handleAdvance}
        onChoice={handleChoice}
      />

      {/* Layer 4: Effects */}
      <EffectLayer effects={vnState.effects} onEffectEnd={handleEffectEnd} />

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
          onClick={onSave}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          保存
        </motion.button>
      )}
    </div>
  );
};

export default VisualNovelEngine;
