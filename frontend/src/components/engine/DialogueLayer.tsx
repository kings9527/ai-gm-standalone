import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import InputHistoryPanel from '../vn/InputHistoryPanel';
import { useGameStore } from '../../stores/gameStore';
import type { VNDialogue, VNChoice } from '../../types/engine';

interface DialogueLayerProps {
  dialogue: VNDialogue | null;
  choices: VNChoice[];
  onAdvance: () => void;
  onChoice: (choiceId: string) => void;
  onFreeInput?: (text: string) => void;
  isPaused?: boolean;
  isStreaming?: boolean;
}

/**
 * DialogueLayer
 * Renders the dialogue box with typewriter effect and choice buttons.
 * Supports free input mode with textarea (Enter to send, Shift+Enter for newline).
 * Supports pause/resume for in-game menu overlay.
 * Uses CSS variables for dynamic theming (--agm-dialogue-bg, --agm-accent, --agm-text).
 */
export const DialogueLayer: React.FC<DialogueLayerProps> = ({
  dialogue,
  choices,
  onAdvance,
  onChoice,
  onFreeInput,
  isPaused = false,
  isStreaming = false,
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const [inputMode, setInputMode] = useState<'choice' | 'free'>('choice');
  const [freeText, setFreeText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typewriterRef = useRef<number | null>(null);
  const indexRef = useRef(0);
  const isPausedRef = useRef(isPaused);

  // 当对话变化时，重置为选项模式
  useEffect(() => {
    setInputMode('choice');
    setFreeText('');
  }, [dialogue?.text]);

  // 同步暂停状态，避免重触发效果
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // 自由输入模式：自动聚焦 textarea
  useEffect(() => {
    if (inputMode === 'free' && textareaRef.current && !isPaused) {
      textareaRef.current.focus();
    }
  }, [inputMode, isPaused]);

  // 读取 CSS 变量用于动态主题
  const getCSSVar = (name: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || fallback;
  };

  const accentColor = getCSSVar('--agm-accent', '#8b0000');
  const textColor = getCSSVar('--agm-text', '#e2e8f0');
  const dialogueBg = getCSSVar('--agm-dialogue-bg', 'rgba(10,10,10,0.9)');

  // Phase 1-F: 从 gameStore 读取输入历史，用于快捷输入面板
  const inputHistory = useGameStore((state) => state.inputHistory);

  // 处理自由输入提交
  const handleFreeSubmit = () => {
    const text = freeText.trim();
    if (!text || !onFreeInput) return;
    onFreeInput(text);
    setFreeText('');
  };

  // textarea 键盘事件：Enter 发送，Shift+Enter 换行
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFreeSubmit();
    }
  };

  // 打字机效果，支持暂停/恢复和进度恢复
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

  // 点击跳过打字机或推进
  const handleClick = () => {
    if (isTyping) {
      // 跳过到结尾
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

          {isStreaming && (
            <div className="mt-3 text-right text-xs animate-pulse" style={{ color: `${accentColor}99` }}>
              AI-GM 正在输入...
            </div>
          )}

          {/* Advance hint */}
          {!isTyping && choices.length === 0 && !isStreaming && (
            <div
              className="mt-3 text-right text-xs animate-bounce"
              style={{ color: `${accentColor}99` }}
            >
              ▼ 点击继续
            </div>
          )}
        </div>

        {/* Choices or Free Input */}
        <AnimatePresence>
          {showChoices && !isStreaming && (
            <motion.div
              className="mt-4 mx-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Mode Switch */}
              {onFreeInput && (
                <div className="flex justify-center mb-3">
                  <motion.button
                    className="px-3 py-1 rounded-full text-xs border transition-colors flex items-center gap-1.5"
                    style={{
                      borderColor: `${accentColor}40`,
                      backgroundColor: 'rgba(10,10,10,0.8)',
                      color: `${accentColor}cc`,
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setInputMode((prev) => (prev === 'choice' ? 'free' : 'choice'));
                      setFreeText('');
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${accentColor}15`;
                      e.currentTarget.style.borderColor = `${accentColor}60`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(10,10,10,0.8)';
                      e.currentTarget.style.borderColor = `${accentColor}40`;
                    }}
                  >
                    <span>{inputMode === 'choice' ? '✎ 自由输入' : '☰ 选项模式'}</span>
                  </motion.button>
                </div>
              )}

              {/* Choice Mode */}
              {inputMode === 'choice' && choices.length > 0 && (
                <motion.div
                  className="flex flex-col gap-2"
                  initial={{ opacity: 0, y: 10 }}
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

              {/* Free Input Mode */}
              {inputMode === 'free' && onFreeInput && (
                <motion.div
                  className="flex flex-col gap-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Phase 1-F: 快捷输入历史面板 */}
                  <InputHistoryPanel
                    history={inputHistory}
                    onSelect={(text) => setFreeText(text)}
                    visible={inputMode === 'free'}
                    accentColor={accentColor}
                    textColor={textColor}
                    maxDisplay={8}
                  />
                  <textarea
                    ref={textareaRef}
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder="输入你想做的事情...（Enter 发送，Shift+Enter 换行）"
                    rows={2}
                    className="w-full px-4 py-3 rounded-lg border resize-none text-sm leading-relaxed outline-none focus:ring-2 focus:ring-opacity-20 transition-all"
                    style={{
                      borderColor: `${accentColor}40`,
                      backgroundColor: 'rgba(10,10,10,0.85)',
                      color: textColor,
                      boxShadow: 'none',
                      caretColor: accentColor,
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${accentColor}80`;
                      e.currentTarget.style.backgroundColor = 'rgba(10,10,10,0.95)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = `${accentColor}40`;
                      e.currentTarget.style.backgroundColor = 'rgba(10,10,10,0.85)';
                    }}
                  />
                  <div className="flex justify-end">
                    <motion.button
                      className="px-4 py-2 rounded-lg text-sm font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={!freeText.trim()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFreeSubmit();
                      }}
                      style={{
                        borderColor: `${accentColor}60`,
                        backgroundColor: `${accentColor}20`,
                        color: accentColor,
                      }}
                      whileHover={freeText.trim() ? { scale: 1.03 } : {}}
                      whileTap={freeText.trim() ? { scale: 0.97 } : {}}
                      onMouseEnter={(e) => {
                        if (freeText.trim()) {
                          e.currentTarget.style.backgroundColor = `${accentColor}35`;
                          e.currentTarget.style.borderColor = `${accentColor}80`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = `${accentColor}20`;
                        e.currentTarget.style.borderColor = `${accentColor}60`;
                      }}
                    >
                      发送 ↵
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default DialogueLayer;
