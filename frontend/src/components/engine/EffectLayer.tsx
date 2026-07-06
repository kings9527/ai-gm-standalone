import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VNEffect } from '../../types/engine';

interface EffectLayerProps {
  effects: VNEffect[];
  onEffectEnd?: (index: number) => void;
}

/**
 * EffectLayer
 * Renders screen effects: shake, grain, vignette, chromatic aberration, fade in/out, flash.
 * Overlay on top of everything.
 * Grain and vignette are persistent; other effects auto-remove after duration.
 */
export const EffectLayer: React.FC<EffectLayerProps> = ({ effects, onEffectEnd }) => {
  // Auto-remove non-persistent effects after their duration
  useEffect(() => {
    effects.forEach((effect, index) => {
      if (effect.type !== 'grain' && effect.type !== 'vignette') {
        const timer = setTimeout(() => {
          onEffectEnd?.(index);
        }, effect.duration);
        return () => clearTimeout(timer);
      }
    });
  }, [effects, onEffectEnd]);

  return (
    <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
      <AnimatePresence>
        {effects.map((effect, index) => (
          <motion.div
            key={`${effect.type}-${index}-${effect.duration}`}
            className="absolute inset-0"
            initial={getInitialState(effect)}
            animate={getAnimateState(effect)}
            exit={getExitState(effect)}
            transition={getTransition(effect)}
          >
            {renderEffectContent(effect)}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Persistent grain overlay with subtle animation */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
        }}
      />

      {/* Persistent vignette */}
      <div
        className="absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 150px 60px rgba(0,0,0,0.7)',
        }}
      />
    </div>
  );
};

function getTransition(effect: VNEffect) {
  const base = { ease: 'easeInOut' as const };

  switch (effect.type) {
    case 'shake':
      return {
        ...base,
        duration: effect.duration / 1000,
        repeat: Infinity,
        repeatType: 'reverse' as const,
      };
    case 'flash':
      return {
        ...base,
        duration: effect.duration / 1000,
        times: [0, 0.5, 1],
      };
    default:
      return {
        ...base,
        duration: effect.duration / 1000,
      };
  }
}

function getInitialState(effect: VNEffect) {
  switch (effect.type) {
    case 'fade_in':
      return { opacity: 0 };
    case 'fade_out':
      return { opacity: 1 };
    case 'shake':
      return { x: 0, y: 0 };
    case 'flash':
      return { opacity: 0 };
    default:
      return {};
  }
}

function getAnimateState(effect: VNEffect) {
  switch (effect.type) {
    case 'fade_in':
      return { opacity: 1 };
    case 'fade_out':
      return { opacity: 0 };
    case 'shake':
      return {
        x: [0, -10 * effect.intensity, 10 * effect.intensity, -10 * effect.intensity, 10 * effect.intensity, 0],
        y: [0, 5 * effect.intensity, -5 * effect.intensity, 5 * effect.intensity, -5 * effect.intensity, 0],
      };
    case 'flash':
      return { opacity: [0, effect.intensity, 0] };
    default:
      return {};
  }
}

function getExitState(effect: VNEffect) {
  switch (effect.type) {
    case 'fade_in':
      return { opacity: 1 };
    case 'fade_out':
      return { opacity: 0 };
    default:
      return {};
  }
}

function renderEffectContent(effect: VNEffect) {
  switch (effect.type) {
    case 'chromatic':
      return (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,0,0,0.1) 0%, transparent 50%, rgba(0,0,255,0.1) 100%)',
            mixBlendMode: 'screen',
          }}
        />
      );
    case 'flash':
      return <div className="absolute inset-0 bg-white" style={{ opacity: effect.intensity }} />;
    default:
      return null;
  }
}

export default EffectLayer;
