import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VNDialogue, VNChoice } from '../../types/engine';

interface DialogueLayerProps {
  dialogue: VNDialogue | null;
  choices: VNChoice[];
  onAdvance: () => void;
  onChoice: (choiceId: string) => void;
}

/**
 * DialogueLayer
 * Renders the dialogue box with typewriter effect and choice buttons.
 * Bottom-center, overlay on all layers.
 */
export const DialogueLayer: React.FC<DialogueLayerProps> = ({
  dialogue,
  choices,
  onAdvance,
  onChoice,
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const typewriterRef = useRef<number | null>(null);

  // Typewriter effect
  useEffect(() => {
    if (!dialogue || !dialogue.typewriter) {
      setDisplayedText(dialogue?.text || '');
      setIsTyping(false);
      setShowChoices(true);
      return;
    }

    setDisplayedText('');
    setIsTyping(true);
    setShowChoices(false);

    let index = 0;
    const speed = dialogue.typewriterSpeed || 30;

    const type = () => {
      if (index < dialogue.text.length) {
        setDisplayedText(dialogue.text.substring(0, index + 1));
        index++;
        typewriterRef.current = window.setTimeout(type, speed);
      } else {
        setIsTyping(false);
        setShowChoices(true);
      }
    };

    typewriterRef.current = window.setTimeout(type, speed);

    return () => {
      if (typewriterRef.current) clearTimeout(typewriterRef.current);
    };
  }, [dialogue?.text, dialogue?.typewriter, dialogue?.typewriterSpeed]);

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
          className="rounded-xl p-6 mx-4 backdrop-blur-sm border border-red-900/30"
          style={{
            background: 'rgba(10,10,10,0.9)',
            boxShadow: '0 0 40px rgba(139,0,0,0.15)',
          }}
        >
          {/* Speaker Name */}
          {dialogue.speaker && (
            <div className="mb-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-700 animate-pulse" />
              <span className="text-red-400 font-bold text-sm tracking-wider uppercase">
                {dialogue.speaker}
              </span>
            </div>
          )}

          {/* Text */}
          <div className="text-gray-100 text-lg leading-relaxed min-h-[3rem]">
            {displayedText}
            {isTyping && (
              <span className="inline-block w-2 h-5 ml-1 bg-red-500 animate-pulse align-middle" />
            )}
          </div>

          {/* Advance hint */}
          {!isTyping && choices.length === 0 && (
            <div className="mt-3 text-right text-xs text-red-500/60 animate-bounce">
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
                      : 'border-red-800/40 bg-gray-900/80 hover:bg-red-950/40 hover:border-red-700/60 hover:translate-x-2'
                  }`}
                  disabled={choice.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChoice(choice.id);
                  }}
                  whileHover={!choice.disabled ? { scale: 1.02 } : {}}
                  whileTap={!choice.disabled ? { scale: 0.98 } : {}}
                >
                  <span className="text-gray-200">{choice.text}</span>
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
