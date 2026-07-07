import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CombatActionType, CombatSkill } from '../../types/combat';

interface ActionMenuProps {
  isPlayerTurn: boolean;
  isTargetSelectionMode: boolean;
  skills: CombatSkill[];
  inventory: Array<{ id: string; name: string; description: string; usable?: boolean }>;
  onAction: (type: CombatActionType, skillId?: string, itemId?: string) => void;
  onCancelTargetSelection: () => void;
  disabled?: boolean;
}

/**
 * 行动菜单 — 攻击/技能/物品/逃跑
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({
  isPlayerTurn,
  isTargetSelectionMode,
  skills,
  inventory,
  onAction,
  onCancelTargetSelection,
  disabled = false,
}) => {
  const [submenu, setSubmenu] = useState<'skills' | 'items' | null>(null);

  // 目标选择模式下只显示取消按钮
  if (isTargetSelectionMode) {
    return (
      <motion.div
        className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="px-4 py-2 rounded-lg bg-red-900/80 border border-red-600/50 text-red-200 text-sm">
          点击目标选择攻击对象
        </div>
        <motion.button
          className="px-4 py-2 rounded-lg bg-gray-800/80 border border-gray-600/50 text-gray-300 text-sm hover:bg-gray-700/80 transition-colors"
          onClick={onCancelTargetSelection}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          取消选择
        </motion.button>
      </motion.div>
    );
  }

  if (!isPlayerTurn || disabled) {
    return (
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
        <div className="px-4 py-2 rounded-lg bg-gray-900/60 border border-gray-700/40 text-gray-500 text-sm animate-pulse">
          {disabled ? '等待中...' : '敌方回合...'}
        </div>
      </div>
    );
  }

  const mainActions = [
    { type: 'attack' as CombatActionType, label: '⚔ 攻击', color: '#dc2626', desc: '选择目标进行攻击' },
    { type: 'skill' as CombatActionType, label: '✦ 技能', color: '#a855f7', desc: '使用特殊技能' },
    { type: 'item' as CombatActionType, label: '🎒 物品', color: '#16a34a', desc: '使用背包物品' },
    { type: 'flee' as CombatActionType, label: '🏃 逃跑', color: '#6b7280', desc: '尝试逃离战斗' },
  ];

  const handleMainAction = (type: CombatActionType) => {
    if (type === 'skill') {
      setSubmenu('skills');
      return;
    }
    if (type === 'item') {
      setSubmenu('items');
      return;
    }
    if (type === 'attack') {
      // 攻击需要选择目标，先通知父组件进入目标选择模式
      onAction('attack');
      return;
    }
    // 逃跑直接执行
    onAction(type);
  };

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
      <AnimatePresence mode="wait">
        {/* 子菜单：技能列表 */}
        {submenu === 'skills' && (
          <motion.div
            key="skills"
            className="bg-gray-900/95 border border-purple-700/40 rounded-xl p-4 backdrop-blur-sm min-w-[280px]"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-purple-300 font-bold text-sm">选择技能</span>
              <button
                className="text-xs text-gray-500 hover:text-gray-300"
                onClick={() => setSubmenu(null)}
              >
                ← 返回
              </button>
            </div>
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {skills.length === 0 && (
                <div className="text-xs text-gray-500 py-2 text-center">无可用的技能</div>
              )}
              {skills.map((skill) => (
                <motion.button
                  key={skill.id}
                  className="text-left px-3 py-2 rounded-lg border border-gray-700/40 bg-gray-800/60 hover:bg-purple-900/30 hover:border-purple-600/40 transition-colors"
                  onClick={() => {
                    setSubmenu(null);
                    onAction('skill', skill.id);
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-200 font-medium">{skill.name}</span>
                    <div className="flex gap-1.5">
                      {skill.cost.mp !== undefined && skill.cost.mp > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">
                          MP {skill.cost.mp}
                        </span>
                      )}
                      {skill.cost.sanity !== undefined && skill.cost.sanity > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300">
                          SAN {skill.cost.sanity}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{skill.description}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* 子菜单：物品列表 */}
        {submenu === 'items' && (
          <motion.div
            key="items"
            className="bg-gray-900/95 border border-green-700/40 rounded-xl p-4 backdrop-blur-sm min-w-[280px]"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-green-300 font-bold text-sm">选择物品</span>
              <button
                className="text-xs text-gray-500 hover:text-gray-300"
                onClick={() => setSubmenu(null)}
              >
                ← 返回
              </button>
            </div>
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {inventory.length === 0 && (
                <div className="text-xs text-gray-500 py-2 text-center">背包是空的</div>
              )}
              {inventory.map((item) => (
                <motion.button
                  key={item.id}
                  className="text-left px-3 py-2 rounded-lg border border-gray-700/40 bg-gray-800/60 hover:bg-green-900/30 hover:border-green-600/40 transition-colors"
                  onClick={() => {
                    setSubmenu(null);
                    onAction('item', undefined, item.id);
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="text-sm text-gray-200 font-medium">{item.name}</span>
                  <p className="text-[11px] text-gray-500 mt-0.5">{item.description}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* 主菜单 */}
        {!submenu && (
          <motion.div
            key="main"
            className="flex gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            {mainActions.map((action) => (
              <motion.button
                key={action.type}
                className="px-4 py-3 rounded-xl border backdrop-blur-sm transition-colors flex flex-col items-center gap-1 min-w-[72px]"
                style={{
                  borderColor: `${action.color}40`,
                  backgroundColor: `${action.color}15`,
                }}
                onClick={() => handleMainAction(action.type)}
                whileHover={{
                  scale: 1.08,
                  backgroundColor: `${action.color}30`,
                }}
                whileTap={{ scale: 0.92 }}
                title={action.desc}
              >
                <span className="text-sm">{action.label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ActionMenu;
