import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VNSprite } from '../../types/engine';

interface SpriteLayerProps {
  sprites: VNSprite[];
}

/**
 * SpriteLayer
 * Renders character sprites with position, expression, and enter animations.
 * Highlights the speaker, fades non-speakers.
 */
export const SpriteLayer: React.FC<SpriteLayerProps> = ({ sprites }) => {
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: '5%', bottom: '5%' },
    center: { left: '50%', bottom: '5%', transform: 'translateX(-50%)' },
    right: { right: '5%', bottom: '5%' },
  };

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {sprites.map((sprite) => (
          <motion.div
            key={sprite.charId}
            className="absolute pointer-events-auto"
            style={{
              ...positionStyles[sprite.position],
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
          >
            {/* Sprite container with border based on speaking state */}
            <div
              className={`w-full h-full rounded-lg overflow-hidden transition-all duration-300 ${
                sprite.isSpeaking ? 'ring-2 ring-red-800 shadow-lg shadow-red-900/30' : ''
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
                  className="w-full h-full flex items-center justify-center text-6xl font-bold"
                  style={{
                    background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
                    color: '#666',
                  }}
                >
                  {sprite.name.charAt(0)}
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
      return { opacity: 0 };
    case 'slide_left':
      return { opacity: 0, x: -100 };
    case 'slide_right':
      return { opacity: 0, x: 100 };
    default:
      return { opacity: 0 };
  }
}

function getExitAnimation(enter: string) {
  switch (enter) {
    case 'fade':
      return { opacity: 0 };
    case 'slide_left':
      return { opacity: 0, x: -100 };
    case 'slide_right':
      return { opacity: 0, x: 100 };
    default:
      return { opacity: 0 };
  }
}

export default SpriteLayer;
