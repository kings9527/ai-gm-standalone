import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VNState } from '../../types/engine';

interface BackgroundLayerProps {
  bg: string;
  transition: 'fade' | 'slide' | 'none';
  style?: React.CSSProperties;
}

/**
 * BackgroundLayer
 * Renders the scene background with transition effects.
 * Supports image URLs, CSS gradients, or solid colors.
 */
export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({ bg, transition, style }) => {
  const isImage = bg.startsWith('http') || bg.startsWith('data:image') || bg.startsWith('blob:');
  const bgStyle: React.CSSProperties = isImage
    ? { backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: bg };

  return (
    <motion.div
      className="absolute inset-0 z-0"
      style={{ ...bgStyle, ...style }}
      initial={transition === 'fade' ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={transition === 'fade' ? { opacity: 0 } : undefined}
      transition={{ duration: 1.2, ease: 'easeInOut' }}
    />
  );
};

export default BackgroundLayer;
