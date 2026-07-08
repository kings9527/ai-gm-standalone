import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CombatEntity, CombatLogEntry } from '../../types/combat';

/* ─────────────────────────────────────────────────────────────── */
//  Damage Event Types
/* ─────────────────────────────────────────────────────────────── */

export interface DamageEvent {
  id: string;
  targetId: string;
  amount: number;
  isCritical: boolean;
  isHeal: boolean;
  isFumble: boolean;
}

interface CombatHUDProps {
  player: CombatEntity;
  enemies: CombatEntity[];
  allies?: CombatEntity[];
  currentTurnEntityId: string | null;
  selectedTargetId: string | null;
  targetSelectionMode: boolean;
  onSelectTarget?: (entityId: string) => void;
  /** 最新战斗日志条目，用于触发飘字 */
  latestLog?: CombatLogEntry[];
}

/* ─────────────────────────────────────────────────────────────── */
//  Floating Damage Number
/* ─────────────────────────────────────────────────────────────── */

const FloatingNumber: React.FC<{
  amount: number;
  isCritical: boolean;
  isHeal: boolean;
  onComplete: () => void;
}> = ({ amount, isCritical, isHeal, onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1200);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const color = isHeal
    ? '#4ade80'
    : isCritical
    ? '#fbbf24'
    : '#ef4444';

  const shadow = isCritical
    ? `0 0 20px ${color}, 0 0 40px ${color}`
    : `0 0 8px ${color}`;

  return (
    <motion.div
      className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-50"
      style={{ top: '-10px' }}
      initial={{ opacity: 0, y: 0, scale: 0.3 }}
      animate={{
        opacity: [0, 1, 1, 0],
        y: [0, -30, -60, -90],
        scale: isCritical ? [0.5, 1.4, 1.2, 1] : [0.5, 1.1, 1, 0.9],
      }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
    >
      <span
        className={`font-black whitespace-nowrap ${isCritical ? 'text-2xl' : 'text-lg'}`}
        style={{
          color,
          textShadow: shadow,
          WebkitTextStroke: isCritical ? '1px rgba(0,0,0,0.5)' : 'none',
        }}
      >
        {isHeal ? '+' : '-'}{amount}
        {isCritical && '!'}
      </span>
    </motion.div>
  );
};

/* ─────────────────────────────────────────────────────────────── */
//  HP Bar with smooth transition + crit flash
/* ─────────────────────────────────────────────────────────────── */

interface BarProps {
  current: number;
  max: number;
  label?: string;
  color?: string;
  height?: number;
  flashTrigger?: boolean; // 触发闪烁
}

const HPBar: React.FC<BarProps> = ({
  current,
  max,
  label,
  color = '#dc2626',
  height = 8,
  flashTrigger = false,
}) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  let barColor = color;
  if (pct <= 25) barColor = '#ef4444';
  else if (pct <= 50) barColor = '#f59e0b';

  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (flashTrigger) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 400);
      return () => clearTimeout(t);
    }
  }, [flashTrigger]);

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-gray-300">{label}</span>
          <span className="text-gray-400">{current}/{max}</span>
        </div>
      )}
      <div
        className="w-full rounded-full bg-gray-800/80 overflow-hidden relative"
        style={{ height }}
      >
        {/* Background bar */}
        <div className="absolute inset-0 rounded-full bg-gray-800/80" />
        {/* Smooth animating fill */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: barColor }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
        {/* Flash overlay on damage */}
        <AnimatePresence>
          {flash && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.6)' }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            />
          )}
        </AnimatePresence>
        {/* Low HP pulse */}
        {pct <= 25 && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: 'inset 0 0 6px rgba(239,68,68,0.4)' }}
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
          />
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────── */
//  SAN Bar
/* ─────────────────────────────────────────────────────────────── */

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
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────── */
//  MP Bar
/* ─────────────────────────────────────────────────────────────── */

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
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────── */
//  Entity Card (with damage events)
/* ─────────────────────────────────────────────────────────────── */

const EntityCard: React.FC<{
  entity: CombatEntity;
  isCurrentTurn: boolean;
  isSelected: boolean;
  isTargetable: boolean;
  onClick?: () => void;
  compact?: boolean;
  damageEvents?: DamageEvent[];
}> = ({ entity, isCurrentTurn, isSelected, isTargetable, onClick, compact = false, damageEvents = [] }) => {
  const isDead = entity.hp <= 0;
  const myEvents = damageEvents.filter((e) => e.targetId === entity.id);

  // Track previous HP for flash detection
  const prevHpRef = useRef(entity.hp);
  const [flashHp, setFlashHp] = useState(false);

  useEffect(() => {
    if (entity.hp < prevHpRef.current) {
      setFlashHp(true);
      const t = setTimeout(() => setFlashHp(false), 400);
      prevHpRef.current = entity.hp;
      return () => clearTimeout(t);
    }
    prevHpRef.current = entity.hp;
  }, [entity.hp]);

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
        whileHover={isTargetable && !isDead ? { scale: 1.03 } : {}}
        whileTap={isTargetable && !isDead ? { scale: 0.97 } : {}}
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
              {isCurrentTurn && <motion.span
                className="text-xs text-yellow-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
              >▶</motion.span>}
              {isDead && <span className="text-xs text-gray-500">☠</span>}
            </div>
            <HPBar current={entity.hp} max={entity.maxHp} height={4} flashTrigger={flashHp} />
          </div>
        </div>
        {/* Damage numbers */}
        <AnimatePresence>
          {myEvents.map((ev) => (
            <FloatingNumber
              key={ev.id}
              amount={ev.amount}
              isCritical={ev.isCritical}
              isHeal={ev.isHeal}
              onComplete={() => {}}
            />
          ))}
        </AnimatePresence>
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
      {/* Crit flash overlay */}
      <AnimatePresence>
        {myEvents.some((e) => e.isCritical) && (
          <motion.div
            className="absolute inset-0 rounded-xl z-10 pointer-events-none"
            style={{ backgroundColor: 'rgba(251,191,36,0.15)' }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>

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
              <motion.span
                className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[10px]"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                回合
              </motion.span>
            )}
            {isDead && <span className="text-gray-500">☠ 已倒下</span>}
          </div>
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
        <HPBar current={entity.hp} max={entity.maxHp} label="HP" flashTrigger={flashHp} />
        {entity.maxMp > 0 && <MPBar current={entity.mp} max={entity.maxMp} />}
        {(entity.sanity !== undefined && entity.maxSanity !== undefined) && (
          <SANBar current={entity.sanity} max={entity.maxSanity} />
        )}
      </div>

      {/* Damage numbers */}
      <AnimatePresence>
        {myEvents.map((ev) => (
          <FloatingNumber
            key={ev.id}
            amount={ev.amount}
            isCritical={ev.isCritical}
            isHeal={ev.isHeal}
            onComplete={() => {}}
          />
        ))}
      </AnimatePresence>

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

/* ─────────────────────────────────────────────────────────────── */
//  CombatHUD Main
/* ─────────────────────────────────────────────────────────────── */

export const CombatHUD: React.FC<CombatHUDProps> = ({
  player,
  enemies,
  allies = [],
  currentTurnEntityId,
  selectedTargetId,
  targetSelectionMode,
  onSelectTarget,
  latestLog = [],
}) => {
  // Convert latest log entries into damage events
  const [damageEvents, setDamageEvents] = useState<DamageEvent[]>([]);
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newEvents: DamageEvent[] = [];
    for (const entry of latestLog) {
      if (processedRef.current.has(entry.id)) continue;
      processedRef.current.add(entry.id);

      if (entry.type === 'damage' && entry.damage && entry.target) {
        newEvents.push({
          id: entry.id,
          targetId: entry.target,
          amount: entry.damage,
          isCritical: entry.isCritical || false,
          isHeal: false,
          isFumble: entry.isFumble || false,
        });
      } else if (entry.type === 'heal' && entry.target) {
        // Heal amount estimation from message
        const match = entry.message.match(/(\d+)\s*点/);
        const amount = match ? parseInt(match[1]) : 1;
        newEvents.push({
          id: entry.id,
          targetId: entry.target,
          amount,
          isCritical: false,
          isHeal: true,
          isFumble: false,
        });
      }
    }

    if (newEvents.length > 0) {
      setDamageEvents((prev) => [...prev, ...newEvents]);
      // Auto cleanup after animation
      setTimeout(() => {
        setDamageEvents((prev) => prev.filter((e) => !newEvents.find((ne) => ne.id === e.id)));
      }, 1300);
    }
  }, [latestLog]);

  return (
    <div className="absolute inset-0 z-15 pointer-events-none flex flex-col justify-between p-4">
      {/* Top: Enemy info */}
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
              damageEvents={damageEvents}
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
                damageEvents={damageEvents}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom-left: Player info */}
      <div className="pointer-events-auto w-72">
        <EntityCard
          entity={player}
          isCurrentTurn={currentTurnEntityId === player.id}
          isSelected={false}
          isTargetable={false}
          compact={false}
          damageEvents={damageEvents}
        />
      </div>
    </div>
  );
};

export default CombatHUD;
