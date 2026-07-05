import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import BackgroundLayer from './BackgroundLayer';
import SpriteLayer from './SpriteLayer';
import DialogueLayer from './DialogueLayer';
import EffectLayer from './EffectLayer';
import type { VNState, VNEffect } from '../../types/engine';
import type { Module, Scene } from '../../types/module';

interface VisualNovelEngineProps {
  module: Module;
  onSave?: () => void;
}

/**
 * VisualNovelEngine
 * Main orchestrator: composes BG → Sprite → Dialogue → Effect layers.
 * Manages scene transitions and state updates.
 */
export const VisualNovelEngine: React.FC<VisualNovelEngineProps> = ({ module, onSave }) => {
  const [vnState, setVnState] = useState<VNState>({
    currentSceneId: module.start_scene,
    bg: '',
    bgTransition: 'fade',
    sprites: [],
    dialogue: null,
    choices: [],
    effects: [],
    isTransitioning: false,
  });

  const [currentScene, setCurrentScene] = useState<Scene | null>(null);

  // Load scene data
  React.useEffect(() => {
    const scene = module.scenes[vnState.currentSceneId];
    if (!scene) return;

    setCurrentScene(scene);

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
          isSpeaking: false,
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
  }, [vnState.currentSceneId, module]);

  const handleAdvance = useCallback(() => {
    // If no choices, advance to next scene or default exit
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
        // Trigger dice check effect
        const diceEffect: VNEffect = {
          type: 'shake',
          intensity: 0.5,
          duration: 500,
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
      <SpriteLayer sprites={vnState.sprites} />

      {/* Layer 3: Dialogue + Choices */}
      <DialogueLayer
        dialogue={vnState.dialogue}
        choices={vnState.choices}
        onAdvance={handleAdvance}
        onChoice={handleChoice}
      />

      {/* Layer 4: Effects */}
      <EffectLayer effects={vnState.effects} />

      {/* UI Overlay: Save button */}
      {onSave && (
        <motion.button
          className="absolute top-4 right-4 z-40 px-3 py-1.5 rounded bg-gray-900/80 border border-red-800/40 text-red-400 text-sm hover:bg-red-950/40 transition-colors"
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
