import React, { useCallback, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CombatState, CombatAction, CombatActionType } from '../../types/combat';
import type { NPC, Player } from '../../types/module';
import {
  initCombat,
  executeAttack,
  executeSkill,
  executeFlee,
  executeAIAction,
  advanceTurn,
  checkCombatEnd,
  getAvailableSkills,
} from '../../engine/combat-system';
import { CombatHUD } from './CombatHUD';
import { ActionMenu } from './ActionMenu';
import { CombatLog } from './CombatLog';

interface CombatOverlayProps {
  isActive: boolean;
  player: Player;
  enemies: NPC[];
  allies?: NPC[];
  ambush?: boolean;
  onCombatEnd: (result: 'victory' | 'defeat' | 'fled', state: CombatState) => void;
  onCombatUpdate?: (state: CombatState) => void;
  moduleItems?: Record<string, { id: string; name: string; description: string; usable?: boolean }>;
  playerInventory?: string[];
}

/**
 * CombatOverlay
 * 战斗覆盖层 — 作为VN引擎的overlay显示，接管画面交互
 */
export const CombatOverlay: React.FC<CombatOverlayProps> = ({
  isActive,
  player,
  enemies,
  allies = [],
  ambush = false,
  onCombatEnd,
  onCombatUpdate,
  moduleItems = {},
  playerInventory = [],
}) => {
  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const onCombatUpdateRef = useRef(onCombatUpdate);
  onCombatUpdateRef.current = onCombatUpdate;
  const [submenu, setSubmenu] = useState<'skills' | 'items' | null>(null);
  // 将子菜单状态传递给 ActionMenu 用于键盘快捷键管理
  const handleSubmenuChange = useCallback((v: 'skills' | 'items' | null) => {
    setSubmenu(v);
  }, []);

  // 初始化战斗
  useEffect(() => {
    if (isActive && !initializedRef.current) {
      initializedRef.current = true;
      const state = initCombat(player, enemies, allies, ambush);
      setCombatState(state);
      onCombatUpdate?.(state);
    }
    if (!isActive) {
      initializedRef.current = false;
      setCombatState(null);
    }
  }, [isActive]);

  // AI回合自动执行
  useEffect(() => {
    if (!combatState || !combatState.active) return;

    // 检查战斗是否结束
    const endedState = checkCombatEnd(combatState);
    if (endedState.phase === 'victory' || endedState.phase === 'defeat' || endedState.phase === 'fled') {
      setCombatState(endedState);
      onCombatUpdateRef.current?.(endedState);
      const result = endedState.phase === 'victory' ? 'victory' : endedState.phase === 'defeat' ? 'defeat' : 'fled';
      // 延迟通知战斗结束，让玩家看到结果
      aiTimerRef.current = setTimeout(() => {
        onCombatEnd(result, endedState);
      }, 2000);
      return;
    }

    // 非玩家回合：AI自动执行
    if (!combatState.isPlayerTurn && combatState.currentTurnEntityId) {
      setIsProcessing(true);
      aiTimerRef.current = setTimeout(() => {
        let nextState: CombatState | null = null;
        setCombatState((prev) => {
          if (!prev) return prev;
          let newState = executeAIAction(prev, prev.currentTurnEntityId!);
          newState = advanceTurn(newState);
          nextState = newState;
          return newState;
        });
        if (nextState) {
          onCombatUpdateRef.current?.(nextState);
        }
        setIsProcessing(false);
      }, 1200);
    }

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [combatState?.currentTurnEntityId, combatState?.isPlayerTurn, combatState?.active]);

  // 玩家行动
  const handlePlayerAction = useCallback(
    (type: CombatActionType, skillId?: string, itemId?: string) => {
      if (!combatState || !combatState.isPlayerTurn || isProcessing) return;

      if (type === 'attack') {
        // 进入目标选择模式
        setCombatState((prev) => {
          if (!prev) return prev;
          return { ...prev, targetSelectionMode: true, selectedSkillId: null, selectedItemId: null };
        });
        return;
      }

      if (type === 'skill' && skillId) {
        // 技能需要选择目标（如果是单体）
        const skillDef = getAvailableSkills(combatState.entities[combatState.playerId]).find(
          (s) => s.id === skillId
        );
        if (skillDef?.targetType === 'single') {
          setCombatState((prev) => {
            if (!prev) return prev;
            return { ...prev, targetSelectionMode: true, selectedSkillId: skillId, selectedItemId: null };
          });
          return;
        }
        // 无需目标的技能（自身/全体）直接执行
        const action: CombatAction = {
          type: 'skill',
          sourceId: combatState.playerId,
          skillId,
        };
        executeAndAdvance(action);
        return;
      }

      if (type === 'flee') {
        const action: CombatAction = {
          type: 'flee',
          sourceId: combatState.playerId,
        };
        executeAndAdvance(action);
        return;
      }

      if (type === 'item' && itemId) {
        const action: CombatAction = {
          type: 'item',
          sourceId: combatState.playerId,
          itemId,
        };
        executeAndAdvance(action);
        return;
      }
    },
    [combatState, isProcessing]
  );

  // 选择目标
  const handleSelectTarget = useCallback(
    (targetId: string) => {
      if (!combatState || !combatState.targetSelectionMode) return;

      const action: CombatAction = {
        type: combatState.selectedSkillId ? 'skill' : 'attack',
        sourceId: combatState.playerId,
        targetId,
        skillId: combatState.selectedSkillId || undefined,
      };

      executeAndAdvance(action);
    },
    [combatState]
  );

  // 取消目标选择
  const handleCancelTargetSelection = useCallback(() => {
    setCombatState((prev) => {
      if (!prev) return prev;
      return { ...prev, targetSelectionMode: false, selectedTargetId: null, selectedSkillId: null };
    });
  }, []);

  // 执行行动并推进回合
  const executeAndAdvance = useCallback(
    (action: CombatAction) => {
      setIsProcessing(true);

      let nextState: CombatState | null = null;

      setCombatState((prev) => {
        if (!prev) return prev;

        let newState = { ...prev };

        switch (action.type) {
          case 'attack': {
            if (!action.targetId) break;
            const { state } = executeAttack(newState, action.sourceId, action.targetId);
            newState = state;
            break;
          }
          case 'skill': {
            if (!action.targetId && action.skillId) {
              // 无需目标的技能
              const { state } = executeSkill(newState, action.sourceId, action.sourceId, action.skillId);
              newState = state;
            } else if (action.targetId && action.skillId) {
              const { state } = executeSkill(newState, action.sourceId, action.targetId, action.skillId);
              newState = state;
            }
            break;
          }
          case 'flee': {
            const { state, result } = executeFlee(newState, action.sourceId);
            newState = state;
            if (result.type === 'flee_success') {
              newState = { ...newState, phase: 'fled', active: false };
            }
            break;
          }
          case 'item': {
            // 物品效果简化为恢复HP（可扩展）
            const item = moduleItems[action.itemId || ''];
            if (item) {
              const healAmount = Math.floor(Math.random() * 4) + 2;
              const player = newState.entities[newState.playerId];
              if (player) {
                player.hp = Math.min(player.maxHp, player.hp + healAmount);
                newState.entities = { ...newState.entities, [player.id]: { ...player } };
                newState.log = [
                  ...newState.log,
                  {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    timestamp: Date.now(),
                    type: 'heal',
                    actor: player.id,
                    message: `${player.name} 使用了 ${item.name}，恢复 ${healAmount} 点HP。`,
                  },
                ];
              }
            }
            break;
          }
        }

        newState = advanceTurn(newState);
        nextState = newState;
        return newState;
      });

      // 副作用必须在 updater 外部执行，避免 React 状态更新丢失
      if (nextState) {
        onCombatUpdateRef.current?.(nextState);
      }

      // 使用 setTimeout 打破 React 18 自动批处理，确保 isProcessing=true 至少渲染一次
      // 防止快速点击导致状态竞争和更新丢失
      setTimeout(() => setIsProcessing(false), 0);
    },
    [moduleItems]
  );

  // ─── 键盘快捷键 ───────────────────────────────
  useEffect(() => {
    if (!isActive || !combatState || !combatState.isPlayerTurn || isProcessing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框聚焦时的按键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // 目标选择模式下的快捷键
      if (combatState.targetSelectionMode) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const aliveEnemies = combatState.enemyIds
            .map((id) => combatState.entities[id])
            .filter((en) => en && en.hp > 0);
          if (aliveEnemies.length > 0) {
            handleSelectTarget(aliveEnemies[0].id);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCancelTargetSelection();
          return;
        }
        const num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          const aliveEnemies = combatState.enemyIds
            .map((id) => combatState.entities[id])
            .filter((en) => en && en.hp > 0);
          const target = aliveEnemies[num - 1];
          if (target) {
            e.preventDefault();
            handleSelectTarget(target.id);
          }
        }
        return;
      }

      // 主菜单快捷键（1-4）
      if (e.key === '1') {
        e.preventDefault();
        handlePlayerAction('attack');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        setSubmenu('skills');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        setSubmenu('items');
        return;
      }
      if (e.key === '4') {
        e.preventDefault();
        handlePlayerAction('flee');
        return;
      }

      // Escape 关闭子菜单
      if (e.key === 'Escape') {
        if (submenu) {
          e.preventDefault();
          setSubmenu(null);
        }
        return;
      }

      // 子菜单中的数字选择
      const num = parseInt(e.key, 10);
      if (isNaN(num) || num < 1 || num > 9) return;

      if (submenu === 'skills') {
        const playerEntity = combatState.entities[combatState.playerId];
        const skills = playerEntity ? getAvailableSkills(playerEntity) : [];
        const skill = skills[num - 1];
        if (skill) {
          e.preventDefault();
          setSubmenu(null);
          handlePlayerAction('skill', skill.id);
        }
        return;
      }

      if (submenu === 'items') {
        const items = playerInventory
          .map((id) => moduleItems[id])
          .filter(Boolean);
        const item = items[num - 1];
        if (item) {
          e.preventDefault();
          setSubmenu(null);
          handlePlayerAction('item', undefined, item.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, combatState, isProcessing, handlePlayerAction, handleSelectTarget, handleCancelTargetSelection, submenu, moduleItems, playerInventory]);

  if (!isActive || !combatState) return null;

  const playerEntity = combatState.entities[combatState.playerId];
  const enemyEntities = combatState.enemyIds
    .map((id) => combatState.entities[id])
    .filter(Boolean);
  const allyEntities = combatState.allyIds
    .map((id) => combatState.entities[id])
    .filter(Boolean);

  const availableSkills = playerEntity ? getAvailableSkills(playerEntity) : [];
  const inventory = playerInventory
    .map((id) => moduleItems[id])
    .filter(Boolean);

  // 战斗结束画面
  const isEnded = combatState.phase === 'victory' || combatState.phase === 'defeat' || combatState.phase === 'fled';

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 z-50 flex flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* 暗色遮罩 */}
        <div className="absolute inset-0 bg-black/40" />

        {/* 回合指示器 */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
          <motion.div
            className="px-4 py-1.5 rounded-full border backdrop-blur-sm"
            style={{
              borderColor: combatState.isPlayerTurn ? '#dc262640' : '#6b728040',
              backgroundColor: combatState.isPlayerTurn ? 'rgba(220,38,38,0.15)' : 'rgba(10,10,10,0.6)',
            }}
            animate={{ scale: combatState.isPlayerTurn ? [1, 1.05, 1] : 1 }}
            transition={{ repeat: combatState.isPlayerTurn ? Infinity : 0, duration: 1.5 }}
          >
            <span className="text-sm font-bold tracking-wider">
              {isEnded
                ? combatState.phase === 'victory'
                  ? '🏆 战斗胜利！'
                  : combatState.phase === 'defeat'
                  ? '☠ 战斗失败...'
                  : '💨 成功逃脱'
                : `第 ${combatState.round} 回合 — ${combatState.isPlayerTurn ? '你的回合' : '敌方回合'}`}
            </span>
          </motion.div>
        </div>

        {/* HUD层 */}
        <CombatHUD
          player={playerEntity}
          enemies={enemyEntities}
          allies={allyEntities}
          currentTurnEntityId={combatState.currentTurnEntityId}
          selectedTargetId={combatState.selectedTargetId}
          targetSelectionMode={combatState.targetSelectionMode}
          onSelectTarget={handleSelectTarget}
          latestLog={combatState.log.slice(-5)}
        />

        {/* 战斗日志 */}
        {!isEnded && <CombatLog logs={combatState.log} />}

        {/* 行动菜单 */}
        {!isEnded && (
          <ActionMenu
            isPlayerTurn={combatState.isPlayerTurn}
            isTargetSelectionMode={combatState.targetSelectionMode}
            skills={availableSkills}
            inventory={inventory}
            onAction={handlePlayerAction}
            onCancelTargetSelection={handleCancelTargetSelection}
            disabled={isProcessing}
            externalSubmenu={submenu}
            onSubmenuChange={handleSubmenuChange}
          />
        )}

        {/* 战斗结束覆盖层 */}
        {isEnded && (
          <motion.div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.5, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <div className="text-6xl mb-4">
                {combatState.phase === 'victory' ? '🏆' : combatState.phase === 'defeat' ? '☠' : '💨'}
              </div>
              <h2 className="text-3xl font-bold mb-2">
                {combatState.phase === 'victory' ? '战斗胜利！' : combatState.phase === 'defeat' ? '你倒下了...' : '成功逃脱'}
              </h2>
              <p className="text-gray-400 text-sm">
                {combatState.phase === 'victory'
                  ? `共经历 ${combatState.round} 回合`
                  : combatState.phase === 'defeat'
                  ? 'SAN值归零或HP耗尽'
                  : '你成功逃离了危险'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default CombatOverlay;