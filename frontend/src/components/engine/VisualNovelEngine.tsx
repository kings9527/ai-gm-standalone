import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import BackgroundLayer from './BackgroundLayer';
import SpriteLayer from './SpriteLayer';
import DialogueLayer from './DialogueLayer';
import EffectLayer from './EffectLayer';
import type { VNState, VNEffect } from '../../types/engine';
import type { Module, Scene } from '../../types/module';
import { useGameStore } from '../../stores/gameStore';

interface VisualNovelEngineProps {
  module: Module;
  initialSceneId?: string;
  onSave?: () => void;
  onMenuToggle?: () => void;
  onSceneChange?: (sceneId: string) => void;
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
  const { updateScene, setCurrentSceneId } = useGameStore();

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

    // Notify parent of scene change for auto-save
    onSceneChange?.(vnState.currentSceneId);

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
