import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface InputHistoryPanelProps {
  /** 历史输入列表（已去重，最新的在前） */
  history: string[];
  /** 点击历史条目时的回调 */
  onSelect: (text: string) => void;
  /** 是否可见 */
  visible: boolean;
  /** 主题色 */
  accentColor?: string;
  /** 文字颜色 */
  textColor?: string;
  /** 最大显示条数 */
  maxDisplay?: number;
}

/**
 * InputHistoryPanel
 * Phase 1-F: 快捷输入历史面板
 *
 * 显示玩家最近的自由输入历史作为快捷选项，点击后自动填充到输入框。
 * 支持动画展开/收起，去重显示，限制条数。
 */
export const InputHistoryPanel: React.FC<InputHistoryPanelProps> = ({
  history,
  onSelect,
  visible,
  accentColor = '#8b0000',
  textColor = '#e2e8f0',
  maxDisplay = 8,
}) => {
  // 去重 + 限制显示条数（保留最新的）
  const uniqueHistory = React.useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    // 从后往前遍历（最新在前），但去重时保留第一次出现（即最新的）
    for (const item of history) {
      const trimmed = item.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
      if (result.length >= maxDisplay) break;
    }
    return result;
  }, [history, maxDisplay]);

  if (!visible || uniqueHistory.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="w-full"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <div className="mb-2 flex items-center gap-2">
          <div
            className="w-1 h-1 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <span
            className="text-xs tracking-wider opacity-60"
            style={{ color: textColor }}
          >
            快捷输入
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {uniqueHistory.map((item, index) => (
            <motion.button
              key={`${item}-${index}`}
              className="px-2.5 py-1 rounded-md text-xs border transition-all duration-150 truncate max-w-[200px]"
              style={{
                borderColor: `${accentColor}30`,
                backgroundColor: 'rgba(10,10,10,0.7)',
                color: `${textColor}cc`,
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.03, duration: 0.2 }}
              whileHover={{
                scale: 1.04,
                backgroundColor: `${accentColor}18`,
                borderColor: `${accentColor}60`,
              }}
              whileTap={{ scale: 0.96 }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item);
              }}
              title={item}
            >
              {item.length > 18 ? `${item.slice(0, 18)}...` : item}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default InputHistoryPanel;
