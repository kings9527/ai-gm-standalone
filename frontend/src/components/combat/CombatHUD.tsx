import React from 'react';
import { motion } from 'framer-motion';
import type { CombatEntity } from '../../types/combat';

interface CombatHUDProps {
  player: CombatEntity;
  enemies: CombatEntity[];
  allies?: CombatEntity[];
  currentTurnEntityId: string | null;
  selectedTargetId: string | null;
  targetSelectionMode: boolean;
  onSelectTarget?: (entityId: string) => void;
}

/**
 * HP条组件
 */
const HPBar: React.FC<{
  current: number;
  max: number;
  label?: string;
  color?: string;
  height?: number;
}> = ({ current, max, label, color = '#dc2626', height = 8 }) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  let barColor = color;
  if (pct <= 25) barColor = '#ef4444';
  else if (pct <= 50) barColor = '#f59e0b';

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-gray-300">{label}</span>
          <span className="text-gray-400">{current}/{max}</span>
        </div>
      )}
      <div
        className="w-full rounded-full bg-gray-800/80 overflow-hidden"
        style={{ height }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};

/**
 * SAN条组件
 */
const SANBar: React.FC<{
  current: number;
  max: number;
  height?: number;
}> = ({ current, max, height = 6 }) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-purple-300">SAN</span>
        <span className="text-purple-400">{current}/{max}</span>
      </div>
      <div
        className="w-full rounded-full bg-gray-800/80 overflow-hidden"
        style={{ height }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: '#a855f7' }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};

/**
 * MP条组件
 */
const MPBar: React.FC<{
  current: number;
  max: number;
  height?: number;
}> = ({ current, max, height = 4 }) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-blue-300">MP</span>
        <span className="text-blue-400">{current}/{max}</span>
      </div>
      <div
        className="w-full rounded-full bg-gray-800/80 overflow-hidden"
        style={{ height }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: '#3b82f6' }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};

/**
 * 实体卡片（敌人/盟友/玩家）
 */
const EntityCard: React.FC<{
  entity: CombatEntity;
  isCurrentTurn: boolean;
  isSelected: boolean;
  isTargetable: boolean;
  onClick?: () => void;
  compact?: boolean;
}> = ({ entity, isCurrentTurn, isSelected, isTargetable, onClick, compact = false }) => {
  const isDead = entity.hp <= 0;

  if (compact) {
    return (
      <motion.div
        className={`
          relative px-3 py-2 rounded-lg border backdrop-blur-sm cursor-default
          ${isDead ? 'opacity-40 grayscale' : ''}
          ${isCurrentTurn ? 'border-yellow-500/60 bg-yellow-900/20' : 'border-gray-700/50 bg-gray-900/70'}
          ${isSelected ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-transparent' : ''}
          ${isTargetable ? 'cursor-pointer hover:border-red-500/60 hover:bg-red-950/20' : ''}
        `}
        onClick={isTargetable && !isDead ? onClick : undefined}
        whileHover={isTargetable && !isDead ? { scale: 1.02 } : {}}
        whileTap={isTargetable && !isDead ? { scale: 0.98 } : {}}
        layout
      >
        <div className="flex items-center gap-2">
          {entity.sprite && (
            <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden border border-gray-600">
              <img src={entity.sprite} alt={entity.name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-gray-200 truncate">{entity.name}</span>
              {isCurrentTurn && <span className="text-xs text-yellow-400 animate-pulse">▶</span>}
              {isDead && <span className="text-xs text-gray-500">☠</span>}
            </div>
            <HPBar current={entity.hp} max={entity.maxHp} height={4} />
          </div>
        </div>
        {isTargetable && !isDead && (
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-[10px] text-white">⚔</span>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`
        relative p-3 rounded-xl border backdrop-blur-sm
        ${isDead ? 'opacity-40 grayscale' : ''}
        ${isCurrentTurn ? 'border-yellow-500/60 bg-yellow-900/20' : 'border-gray-700/50 bg-gray-900/80'}
        ${isSelected ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-transparent' : ''}
        ${isTargetable ? 'cursor-pointer hover:border-red-500/60' : ''}
      `}
      onClick={isTargetable && !isDead ? onClick : undefined}
      whileHover={isTargetable && !isDead ? { scale: 1.02 } : {}}
      whileTap={isTargetable && !isDead ? { scale: 0.98 } : {}}
      layout
    >
      <div className="flex items-center gap-3 mb-2">
        {entity.sprite && (
          <div className="w-10 h-10 rounded-lg bg-gray-800 overflow-hidden border border-gray-600">
            <img src={entity.sprite} alt={entity.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-100">{entity.name}</span>
            {isCurrentTurn && (
              <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[10px]">
                回合
              </span>
            )}
            {isDead && <span className="text-gray-500">☠ 已倒下</span>}
          </div>
          {/* 状态效果 */}
          {entity.statusEffects.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {entity.statusEffects.map((se) => (
                <span
                  key={se.type}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-purple-900/40 text-purple-300 border border-purple-700/30"
                  title={se.description}
                >
                  {se.name} ({se.duration}T)
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <HPBar current={entity.hp} max={entity.maxHp} label="HP" />
        {entity.maxMp > 0 && <MPBar current={entity.mp} max={entity.maxMp} />}
        {(entity.sanity !== undefined && entity.maxSanity !== undefined) && (
          <SANBar current={entity.sanity} max={entity.maxSanity} />
        )}
      </div>

      {isTargetable && !isDead && (
        <motion.div
          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <span className="text-xs">⚔</span>
        </motion.div>
      )}
    </motion.div>
  );
};

/**
 * 战斗HUD主组件
 */
export const CombatHUD: React.FC<CombatHUDProps> = ({
  player,
  enemies,
  allies = [],
  currentTurnEntityId,
  selectedTargetId,
  targetSelectionMode,
  onSelectTarget,
}) => {
  return (
    <div className="absolute inset-0 z-15 pointer-events-none flex flex-col justify-between p-4">
      {/* 顶部：敌人信息 */}
      <div className="pointer-events-auto">
        <div className="flex flex-wrap gap-2 justify-end">
          {enemies.map((enemy) => (
            <EntityCard
              key={enemy.id}
              entity={enemy}
              isCurrentTurn={currentTurnEntityId === enemy.id}
              isSelected={selectedTargetId === enemy.id}
              isTargetable={targetSelectionMode}
              onClick={() => onSelectTarget?.(enemy.id)}
              compact
            />
          ))}
        </div>
        {allies.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end mt-2">
            {allies.map((ally) => (
              <EntityCard
                key={ally.id}
                entity={ally}
                isCurrentTurn={currentTurnEntityId === ally.id}
                isSelected={selectedTargetId === ally.id}
                isTargetable={targetSelectionMode}
                onClick={() => onSelectTarget?.(ally.id)}
                compact
              />
            ))}
          </div>
        )}
      </div>

      {/* 底部左侧：玩家信息 */}
      <div className="pointer-events-auto w-72">
        <EntityCard
          entity={player}
          isCurrentTurn={currentTurnEntityId === player.id}
          isSelected={false}
          isTargetable={false}
          compact={false}
        />
      </div>
    </div>
  );
};

export default CombatHUD;
