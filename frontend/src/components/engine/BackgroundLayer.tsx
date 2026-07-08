import React from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';

interface BackgroundLayerProps {
  bg: string;
  transition: 'fade' | 'slide' | 'none';
  style?: React.CSSProperties;
  isPaused?: boolean;
}

/**
 * BackgroundLayer
 * Renders the scene background with transition effects.
 * Supports pause/resume via useAnimationControls.
 * Supports image URLs (http, data, blob, local paths), CSS gradients, or solid colors.
 */
export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({ bg, transition, style, isPaused }) => {
  const isImage =
    bg.startsWith('http') ||
    bg.startsWith('data:image') ||
    bg.startsWith('blob:') ||
    bg.startsWith('/') ||
    bg.startsWith('./');

  const bgStyle: React.CSSProperties = isImage
    ? { backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: bg };

  const controls = useAnimationControls();

  React.useEffect(() => {
    if (isPaused) {
      controls.stop();
    } else {
      controls.start({ opacity: 1 });
    }
  }, [isPaused, controls]);

  return (
    <AnimatePresence mode="sync">
      <motion.div
        key={bg}
        className="absolute inset-0 z-0"
        style={{ ...bgStyle, ...style }}
        initial={transition === 'fade' ? { opacity: 0 } : false}
        animate={controls}
        exit={transition === 'fade' ? { opacity: 0 } : undefined}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
      />
    </AnimatePresence>
  );
};

export default BackgroundLayer;
