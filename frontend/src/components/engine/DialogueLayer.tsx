import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VNDialogue, VNChoice } from '../../types/engine';

interface DialogueLayerProps {
  dialogue: VNDialogue | null;
  choices: VNChoice[];
  onAdvance: () => void;
  onChoice: (choiceId: string) => void;
  isPaused?: boolean;
}

/**
 * DialogueLayer
 * Renders the dialogue box with typewriter effect and choice buttons.
 * Supports pause/resume for in-game menu overlay.
 * Uses CSS variables for dynamic theming (--agm-dialogue-bg, --agm-accent, --agm-text).
 */
export const DialogueLayer: React.FC<DialogueLayerProps> = ({
  dialogue,
  choices,
  onAdvance,
  onChoice,
  isPaused = false,
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const typewriterRef = useRef<number | null>(null);
  const indexRef = useRef(0);
  const isPausedRef = useRef(isPaused);

  // Sync pause ref without re-triggering effect
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Read CSS variables for dynamic theming
  const getCSSVar = (name: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || fallback;
  };

  const accentColor = getCSSVar('--agm-accent', '#8b0000');
  const textColor = getCSSVar('--agm-text', '#e2e8f0');
  const dialogueBg = getCSSVar('--agm-dialogue-bg', 'rgba(10,10,10,0.9)');

  // Typewriter effect with pause/resume support and progress restore
  useEffect(() => {
    if (!dialogue || !dialogue.typewriter) {
      setDisplayedText(dialogue?.text || '');
      setIsTyping(false);
      setShowChoices(true);
      return;
    }

    const fullText = dialogue.text || '';
    const savedProgress = dialogue.typewriterProgress ?? 0;
    const startIndex = Math.floor(savedProgress * fullText.length);

    setDisplayedText(fullText.substring(0, startIndex));
    indexRef.current = startIndex;
    setIsTyping(startIndex < fullText.length);
    setShowChoices(startIndex >= fullText.length);

    const speed = dialogue.typewriterSpeed || 30;

    const type = () => {
      if (isPausedRef.current) {
        // 暂停时保持轮询，检查恢复状态
        typewriterRef.current = window.setTimeout(type, speed);
        return;
      }
      if (indexRef.current < fullText.length) {
        const nextIndex = indexRef.current + 1;
        setDisplayedText(fullText.substring(0, nextIndex));
        indexRef.current = nextIndex;
        typewriterRef.current = window.setTimeout(type, speed);
      } else {
        setIsTyping(false);
        setShowChoices(true);
      }
    };

    if (startIndex < fullText.length) {
      typewriterRef.current = window.setTimeout(type, speed);
    }

    return () => {
      if (typewriterRef.current) clearTimeout(typewriterRef.current);
    };
  }, [dialogue?.text, dialogue?.typewriter, dialogue?.typewriterSpeed, dialogue?.typewriterProgress]);

  // Click to skip typewriter or advance
  const handleClick = () => {
    if (isTyping) {
      // Skip to end
      if (typewriterRef.current) clearTimeout(typewriterRef.current);
      setDisplayedText(dialogue?.text || '');
      setIsTyping(false);
      setShowChoices(true);
    } else if (!showChoices && choices.length === 0) {
      onAdvance();
    }
  };

  if (!dialogue) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end items-center pb-8 pointer-events-none">
      {/* Dialogue Box */}
      <motion.div
        className="w-full max-w-4xl mx-auto pointer-events-auto cursor-pointer"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        onClick={handleClick}
      >
        <div
          className="rounded-xl p-6 mx-4 backdrop-blur-sm border transition-colors"
          style={{
            background: dialogueBg,
            borderColor: `${accentColor}30`,
            boxShadow: `0 0 40px ${accentColor}15`,
          }}
        >
          {/* Speaker Name */}
          {dialogue.speaker && (
            <div className="mb-2 flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: accentColor }}
              />
              <span
                className="font-bold text-sm tracking-wider uppercase"
                style={{ color: accentColor }}
              >
                {dialogue.speaker}
              </span>
            </div>
          )}

          {/* Text */}
          <div
            className="text-lg leading-relaxed min-h-[3rem]"
            style={{ color: textColor }}
          >
            {displayedText}
            {isTyping && (
              <span
                className="inline-block w-2 h-5 ml-1 align-middle animate-pulse"
                style={{ backgroundColor: accentColor }}
              />
            )}
          </div>

          {/* Advance hint */}
          {!isTyping && choices.length === 0 && (
            <div
              className="mt-3 text-right text-xs animate-bounce"
              style={{ color: `${accentColor}99` }}
            >
              ▼ 点击继续
            </div>
          )}
        </div>

        {/* Choices */}
        <AnimatePresence>
          {showChoices && choices.length > 0 && (
            <motion.div
              className="flex flex-col gap-2 mt-4 mx-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, staggerChildren: 0.1 }}
            >
              {choices.map((choice) => (
                <motion.button
                  key={choice.id}
                  className={`w-full text-left px-5 py-3 rounded-lg border transition-all duration-200 ${
                    choice.disabled
                      ? 'opacity-40 cursor-not-allowed border-gray-700 bg-gray-900/50'
                      : 'hover:translate-x-2'
                  }`}
                  disabled={choice.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChoice(choice.id);
                  }}
                  style={choice.disabled ? undefined : {
                    borderColor: `${accentColor}40`,
                    backgroundColor: 'rgba(10,10,10,0.8)',
                  }}
                  whileHover={!choice.disabled ? { scale: 1.02 } : {}}
                  whileTap={!choice.disabled ? { scale: 0.98 } : {}}
                  onMouseEnter={(e) => {
                    if (!choice.disabled) {
                      e.currentTarget.style.backgroundColor = `${accentColor}15`;
                      e.currentTarget.style.borderColor = `${accentColor}60`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!choice.disabled) {
                      e.currentTarget.style.backgroundColor = 'rgba(10,10,10,0.8)';
                      e.currentTarget.style.borderColor = `${accentColor}40`;
                    }
                  }}
                >
                  <span style={{ color: textColor }}>{choice.text}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default DialogueLayer;
