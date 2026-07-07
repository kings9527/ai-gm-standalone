import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CombatLogEntry } from '../../types/combat';

interface CombatLogProps {
  logs: CombatLogEntry[];
  maxHeight?: number;
}

/**
 * 获取日志条目的颜色样式
 */
function getLogStyles(type: CombatLogEntry['type']): {
  borderColor: string;
  bgColor: string;
  textColor: string;
  icon: string;
} {
  switch (type) {
    case 'attack':
      return { borderColor: 'border-red-700/30', bgColor: 'bg-red-950/30', textColor: 'text-red-300', icon: '⚔' };
    case 'skill':
      return { borderColor: 'border-purple-700/30', bgColor: 'bg-purple-950/30', textColor: 'text-purple-300', icon: '✦' };
    case 'damage':
      return { borderColor: 'border-red-600/40', bgColor: 'bg-red-900/40', textColor: 'text-red-200', icon: '💥' };
    case 'heal':
      return { borderColor: 'border-green-600/30', bgColor: 'bg-green-950/30', textColor: 'text-green-300', icon: '💚' };
    case 'flee':
      return { borderColor: 'border-gray-600/30', bgColor: 'bg-gray-900/40', textColor: 'text-gray-300', icon: '🏃' };
    case 'status':
      return { borderColor: 'border-yellow-600/30', bgColor: 'bg-yellow-950/30', textColor: 'text-yellow-300', icon: '⚡' };
    case 'system':
      return { borderColor: 'border-blue-600/30', bgColor: 'bg-blue-950/30', textColor: 'text-blue-300', icon: '📢' };
    default:
      return { borderColor: 'border-gray-700/20', bgColor: 'bg-gray-900/20', textColor: 'text-gray-400', icon: '•' };
  }
}

/**
 * 战斗日志组件
 */
export const CombatLog: React.FC<CombatLogProps> = ({ logs, maxHeight = 200 }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // 只显示最近30条
  const displayLogs = logs.slice(-30);

  return (
    <div
      className="absolute top-20 left-4 z-25 w-80 backdrop-blur-sm rounded-xl border border-gray-700/30 bg-gray-950/70 overflow-hidden"
      style={{ maxHeight: maxHeight + 40 }}
    >
      {/* 标题 */}
      <div className="px-3 py-1.5 border-b border-gray-700/30 flex justify-between items-center">
        <span className="text-xs font-bold text-gray-400 tracking-wider">战斗日志</span>
        <span className="text-[10px] text-gray-600">{logs.length} 条</span>
      </div>

      {/* 日志列表 */}
      <div
        ref={scrollRef}
        className="px-2 py-2 overflow-y-auto space-y-1"
        style={{ maxHeight }}
      >
        <AnimatePresence initial={false}>
          {displayLogs.length === 0 && (
            <div className="text-xs text-gray-600 text-center py-4">战斗尚未开始</div>
          )}
          {displayLogs.map((log) => {
            const styles = getLogStyles(log.type);
            return (
              <motion.div
                key={log.id}
                className={`
                  px-2.5 py-1.5 rounded-lg text-xs border-l-2
                  ${styles.bgColor} ${styles.borderColor}
                `}
                initial={{ opacity: 0, x: -10, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                transition={{ duration: 0.2 }}
              >
                <span className={`${styles.textColor}`}>
                  <span className="mr-1 opacity-70">{styles.icon}</span>
                  {log.message}
                </span>
                {log.damage !== undefined && (
                  <span className={`ml-1 font-bold ${log.isCritical ? 'text-yellow-400' : log.isFumble ? 'text-red-500' : 'text-red-300'}`}>
                    {log.isCritical ? '★' : ''}{log.damage} 伤害
                  </span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CombatLog;
