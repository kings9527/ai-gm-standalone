import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VNSprite } from '../../types/engine';

interface SpriteLayerProps {
  sprites: VNSprite[];
  onSpriteClick?: (charId: string) => void;
}

/**
 * SpriteLayer
 * Renders character sprites with position, expression, and enter animations.
 * Highlights the speaker, fades non-speakers.
 * Supports left/center/right positioning.
 */
export const SpriteLayer: React.FC<SpriteLayerProps> = ({ sprites, onSpriteClick }) => {
  const getPositionClass = (position: string) => {
    switch (position) {
      case 'left':
        return 'left-[5%]';
      case 'center':
        return 'left-1/2 -translate-x-1/2';
      case 'right':
        return 'right-[5%]';
      default:
        return 'left-[5%]';
    }
  };

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {sprites.map((sprite) => (
          <motion.div
            key={sprite.charId}
            className={`absolute bottom-[5%] pointer-events-auto ${getPositionClass(sprite.position)}`}
            style={{
              width: '300px',
              height: '500px',
            }}
            initial={getInitialAnimation(sprite.enterAnimation)}
            animate={{
              opacity: sprite.isSpeaking ? 1 : 0.7,
              scale: sprite.isSpeaking ? 1.02 : 1,
              filter: sprite.isSpeaking ? 'brightness(1.1)' : 'brightness(0.85)',
            }}
            exit={getExitAnimation(sprite.enterAnimation)}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            onClick={() => onSpriteClick?.(sprite.charId)}
          >
            {/* Sprite container with border based on speaking state */}
            <div
              className={`w-full h-full rounded-lg overflow-hidden transition-all duration-300 ${
                sprite.isSpeaking
                  ? 'ring-2 ring-red-800 shadow-lg shadow-red-900/30'
                  : ''
              }`}
            >
              {sprite.imageUrl ? (
                <img
                  src={sprite.imageUrl}
                  alt={sprite.name}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <div
                  className="w-full h-full flex flex-col items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
                  }}
                >
                  <span className="text-6xl font-bold text-gray-600">
                    {sprite.name.charAt(0)}
                  </span>
                  <span className="text-sm text-gray-500">{sprite.name}</span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

function getInitialAnimation(enter: string) {
  switch (enter) {
    case 'fade':
      return { opacity: 0, scale: 0.95 };
    case 'slide_left':
      return { opacity: 0, x: -150 };
    case 'slide_right':
      return { opacity: 0, x: 150 };
    default:
      return { opacity: 0 };
  }
}

function getExitAnimation(enter: string) {
  switch (enter) {
    case 'fade':
      return { opacity: 0, scale: 0.95 };
    case 'slide_left':
      return { opacity: 0, x: -150 };
    case 'slide_right':
      return { opacity: 0, x: 150 };
    default:
      return { opacity: 0 };
  }
}

export default SpriteLayer;
