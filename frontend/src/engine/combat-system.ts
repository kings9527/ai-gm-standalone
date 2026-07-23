/**
 * Combat System — 回合制战斗状态机
 * 负责战斗初始化、回合流转、行动执行、战斗结算
 */

import type {
  CombatState,
  CombatEntity,
  CombatAction,
  CombatActionType,
  CombatLogEntry,
  CombatResult,
  CombatSkill,
  CombatStatusEffect,
  CombatPhase,
} from '../types/combat';
import type { NPC, Player } from '../types/module';
import { DiceRoller } from './dice';

const diceRoller = new DiceRoller();

/**
 * 生成唯一ID
 */
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 默认战斗技能库（COC规则基础技能）
 */
export const DEFAULT_SKILLS: Record<string, CombatSkill> = {
  brawl: {
    id: 'brawl',
    name: '徒手格斗',
    description: '用拳头或近战武器进行基础攻击',
    cost: {},
    targetType: 'single',
    effect: { type: 'damage', formula: '1d3+db' },
  },
  firearm: {
    id: 'firearm',
    name: '射击',
    description: '使用枪械进行远程攻击',
    cost: {},
    targetType: 'single',
    effect: { type: 'damage', formula: '1d6+2' },
  },
  dodge: {
    id: 'dodge',
    name: '闪避',
    description: '本回合防御力+20，闪避检定+20',
    cost: { mp: 0 },
    targetType: 'self',
    effect: { type: 'buff', statModifier: { dodge: 20, defense: 20 } },
  },
  first_aid: {
    id: 'first_aid',
    name: '急救',
    description: '恢复少量HP',
    cost: { sanity: 1 },
    targetType: 'single',
    effect: { type: 'heal', formula: '1d3' },
  },
  inspire: {
    id: 'inspire',
    name: '激励',
    description: '恢复SAN值，减轻精神压力',
    cost: { mp: 5 },
    targetType: 'single',
    effect: { type: 'heal', formula: '1d6' },
  },
  aim: {
    id: 'aim',
    name: '瞄准',
    description: '下一回合射击命中+20',
    cost: { mp: 0 },
    targetType: 'self',
    effect: { type: 'buff', statModifier: { firearm: 20 } },
  },
  desperate_strike: {
    id: 'desperate_strike',
    name: '舍命一击',
    description: '消耗SAN造成双倍伤害',
    cost: { sanity: 3 },
    targetType: 'single',
    effect: { type: 'damage', formula: '2d6' },
  },
  intimidate: {
    id: 'intimidate',
    name: '恐吓',
    description: '降低敌人命中率',
    cost: { sanity: 2 },
    targetType: 'single',
    effect: {
      type: 'debuff',
      statusEffect: {
        type: 'frightened',
        name: '恐惧',
        duration: 2,
        description: '命中率-20',
        modifier: { attack: -20 },
      },
    },
  },
};

/**
 * 计算伤害加值（DB）
 * COC规则: STR + SIZ，根据总和决定DB
 */
function calculateDamageBonus(str: number = 50, siz: number = 50): string {
  const sum = str + siz;
  if (sum <= 64) return '-2';
  if (sum <= 84) return '-1';
  if (sum <= 124) return '0';
  if (sum <= 164) return '+1d4';
  if (sum <= 204) return '+1d6';
  return '+2d6';
}

/**
 * 解析并计算伤害表达式
 */
function resolveDamageFormula(formula: string, str: number = 50, siz: number = 50): number {
  let expr = formula.replace(/db/gi, calculateDamageBonus(str, siz));
  try {
    const result = diceRoller.roll(expr);
    return result.total;
  } catch {
    return 1;
  }
}

/**
 * 初始化战斗状态
 */
export function initCombat(
  player: Player,
  enemyNPCs: NPC[],
  allyNPCs: NPC[] = [],
  ambush: boolean = false
): CombatState {
  const entities: Record<string, CombatEntity> = {};
  const turnQueue: string[] = [];

  // 玩家实体
  const playerEntity: CombatEntity = {
    id: 'player',
    name: player.name,
    type: 'player',
    hp: player.hp,
    maxHp: player.max_hp,
    mp: 100,
    maxMp: 100,
    sanity: player.sanity,
    maxSanity: player.max_sanity,
    stats: { ...player.stats, dex: player.stats.dex || 50 },
    statusEffects: [...(player.status_effects || [])].map((se) => ({
      type: se.type,
      name: se.type,
      duration: parseDuration(se.duration),
      description: se.description,
    })),
  };
  entities['player'] = playerEntity;
  turnQueue.push('player');

  // 敌人实体
  const enemyIds: string[] = [];
  enemyNPCs.forEach((npc, idx) => {
    const eid = `enemy_${npc.id}_${idx}`;
    entities[eid] = {
      id: eid,
      name: npc.name,
      type: 'enemy',
      hp: npc.hp,
      maxHp: npc.hp,
      mp: 50,
      maxMp: 50,
      sanity: npc.sanity || 30,
      maxSanity: npc.sanity || 30,
      stats: { ...npc.stats, dex: npc.stats.dex || 50 },
      statusEffects: [],
      sprite: npc.sprites?.normal || '',
    };
    enemyIds.push(eid);
    turnQueue.push(eid);
  });

  // 盟友实体
  const allyIds: string[] = [];
  allyNPCs.forEach((npc, idx) => {
    const aid = `ally_${npc.id}_${idx}`;
    entities[aid] = {
      id: aid,
      name: npc.name,
      type: 'npc',
      hp: npc.hp,
      maxHp: npc.hp,
      mp: 50,
      maxMp: 50,
      stats: { ...npc.stats, dex: npc.stats.dex || 50 },
      statusEffects: [],
      sprite: npc.sprites?.normal || '',
    };
    allyIds.push(aid);
    turnQueue.push(aid);
  });

  // 按DEX排序行动顺序
  turnQueue.sort((a, b) => {
    const dexA = entities[a]?.stats.dex || 50;
    const dexB = entities[b]?.stats.dex || 50;
    return dexB - dexA; // DEX高的先行动
  });

  const firstEntity = turnQueue[0] || 'player';

  return {
    active: true,
    phase: ambush ? 'enemy_turn' : 'player_turn',
    round: 1,
    turnQueue,
    currentTurnIndex: 0,
    currentTurnEntityId: firstEntity,
    entities,
    playerId: 'player',
    enemyIds,
    allyIds,
    log: [createLogEntry('system', ambush ? '⚠️ 你遭到了突袭！' : '⚔️ 战斗开始！')],
    turnHistory: [],
    pendingAction: null,
    ambush,
    isPlayerTurn: !ambush && firstEntity === 'player',
    targetSelectionMode: false,
    selectedTargetId: null,
    selectedSkillId: null,
    selectedItemId: null,
  };
}

function parseDuration(dur: string): number {
  const match = dur.match(/(\d+)/);
  return match ? parseInt(match[1]) : 1;
}

function createLogEntry(
  type: CombatLogEntry['type'],
  message: string,
  extra: Partial<CombatLogEntry> = {}
): CombatLogEntry {
  return {
    id: uid(),
    timestamp: Date.now(),
    type,
    message,
    ...extra,
  };
}

/**
 * 执行d100检定
 */
export function d100Check(skillValue: number, modifier: number = 0): CombatResult {
  const roll = Math.floor(Math.random() * 100) + 1;
  const target = skillValue + modifier;
  const critical = roll <= 5;
  const fumble = roll >= 96;
  const success = roll <= target;

  let narration: string;
  let type: CombatResult['type'];

  if (fumble) {
    type = 'fumble';
    narration = `大失败！骰出了 ${roll}... 灾难性的失误！`;
  } else if (critical) {
    type = 'critical';
    narration = `大成功！骰出了 ${roll}！完美的表现！`;
  } else if (success) {
    type = 'hit';
    narration = `成功！${roll} ≤ ${target}`;
  } else {
    type = 'miss';
    narration = `失败。${roll} > ${target}`;
  }

  return { success: critical || success, type, roll, target, narration };
}

/**
 * 执行攻击
 */
export function executeAttack(
  state: CombatState,
  attackerId: string,
  targetId: string,
  skillId: string = 'brawl'
): { state: CombatState; result: CombatResult } {
  const attacker = state.entities[attackerId];
  const target = state.entities[targetId];
  if (!attacker || !target) {
    return {
      state,
      result: { success: false, type: 'miss', narration: '目标不存在。' },
    };
  }

  const skill = DEFAULT_SKILLS[skillId] || DEFAULT_SKILLS.brawl;

  // d100命中检定
  const attackSkill = attacker.type === 'player' ? attacker.stats.格斗 || 25 : attacker.stats.格斗 || 40;
  let modifier = 0;

  // 应用状态效果修正
  attacker.statusEffects.forEach((se) => {
    if (se.modifier?.attack) modifier += se.modifier.attack;
  });
  target.statusEffects.forEach((se) => {
    if (se.modifier?.dodge) modifier -= se.modifier.dodge;
  });

  const check = d100Check(attackSkill, modifier);

  const log: CombatLogEntry[] = [];
  log.push(
    createLogEntry('attack', `${attacker.name} 对 ${target.name} 使用 ${skill.name}！`, {
      actor: attackerId,
      target: targetId,
    })
  );
  log.push(createLogEntry(check.type === 'hit' || check.type === 'critical' ? 'info' : 'info', check.narration));

  let damage = 0;

  if (check.type === 'fumble') {
    // 大失败：攻击者自己受伤或摔倒
    const selfDamage = Math.floor(Math.random() * 3) + 1;
    attacker.hp = Math.max(0, attacker.hp - selfDamage);
    log.push(
      createLogEntry('damage', `${attacker.name} 失误了！自己受到 ${selfDamage} 点伤害。`, {
        actor: attackerId,
        damage: selfDamage,
        isFumble: true,
      })
    );
  } else if (check.type === 'critical') {
    // 大成功：双倍伤害
    damage = resolveDamageFormula(skill.effect.formula || '1d3', attacker.stats.力量, attacker.stats.体型) * 2;
    target.hp = Math.max(0, target.hp - damage);
    log.push(
      createLogEntry('damage', `暴击！${target.name} 受到 ${damage} 点伤害！`, {
        actor: attackerId,
        target: targetId,
        damage,
        isCritical: true,
      })
    );
  } else if (check.success) {
    // 普通命中
    damage = resolveDamageFormula(skill.effect.formula || '1d3', attacker.stats.力量, attacker.stats.体型);
    target.hp = Math.max(0, target.hp - damage);
    log.push(
      createLogEntry('damage', `${target.name} 受到 ${damage} 点伤害。`, {
        actor: attackerId,
        target: targetId,
        damage,
      })
    );
  } else {
    log.push(createLogEntry('info', `${attacker.name} 的攻击落空了！`));
  }

  const newState: CombatState = {
    ...state,
    entities: { ...state.entities, [attackerId]: { ...attacker }, [targetId]: { ...target } },
    log: [...state.log, ...log],
  };

  return {
    state: newState,
    result: {
      success: check.success,
      type: check.type,
      damage,
      roll: check.roll,
      target: check.target,
      narration: log.map((l) => l.message).join('\n'),
    },
  };
}

/**
 * 执行技能
 */
export function executeSkill(
  state: CombatState,
  userId: string,
  targetId: string,
  skillId: string
): { state: CombatState; result: CombatResult } {
  const user = state.entities[userId];
  const target = state.entities[targetId];
  const skill = DEFAULT_SKILLS[skillId];

  if (!user || !skill) {
    return {
      state,
      result: { success: false, type: 'miss', narration: '技能不存在。' },
    };
  }

  const log: CombatLogEntry[] = [];

  // 检查消耗
  if (skill.cost.mp && user.mp < skill.cost.mp) {
    return {
      state,
      result: { success: false, type: 'miss', narration: 'MP不足，无法使用该技能。' },
    };
  }
  if (skill.cost.sanity && (user.sanity || 0) < skill.cost.sanity) {
    return {
      state,
      result: { success: false, type: 'miss', narration: 'SAN值不足，无法使用该技能。' },
    };
  }

  // 扣除消耗
  if (skill.cost.mp) user.mp -= skill.cost.mp;
  if (skill.cost.sanity) user.sanity = (user.sanity || 0) - skill.cost.sanity;

  log.push(createLogEntry('skill', `${user.name} 使用了 ${skill.name}！`, { actor: userId }));

  let damage = 0;
  const effect = skill.effect;

  switch (effect.type) {
    case 'damage': {
      if (!target) break;
      damage = resolveDamageFormula(effect.formula || '1d3', user.stats.力量, user.stats.体型);
      target.hp = Math.max(0, target.hp - damage);
      log.push(
        createLogEntry('damage', `${target.name} 受到 ${damage} 点伤害。`, {
          actor: userId,
          target: targetId,
          damage,
        })
      );
      break;
    }
    case 'heal': {
      const healTarget = target || user;
      const healAmount = resolveDamageFormula(effect.formula || '1d3');
      const oldHp = healTarget.hp;
      healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmount);
      const actualHeal = healTarget.hp - oldHp;
      log.push(
        createLogEntry('heal', `${healTarget.name} 恢复了 ${actualHeal} 点HP。`, {
          actor: userId,
          target: healTarget.id,
        })
      );
      break;
    }
    case 'buff': {
      const buffTarget = target || user;
      if (effect.statModifier) {
        const buffEffect: CombatStatusEffect = {
          type: `buff_${skillId}`,
          name: skill.name,
          duration: 1,
          description: skill.description,
          modifier: effect.statModifier,
        };
        buffTarget.statusEffects.push(buffEffect);
        log.push(
          createLogEntry('status', `${buffTarget.name} 获得了「${skill.name}」效果。`, {
            actor: userId,
            target: buffTarget.id,
          })
        );
      }
      break;
    }
    case 'debuff':
    case 'status': {
      if (!target) break;
      if (effect.statusEffect) {
        target.statusEffects.push({ ...effect.statusEffect });
        log.push(
          createLogEntry('status', `${target.name} 陷入「${effect.statusEffect.name}」状态。`, {
            actor: userId,
            target: targetId,
          })
        );
      }
      break;
    }
    default:
      // 未知效果类型，记录日志但不执行
      log.push(
        createLogEntry('system', `未知技能效果类型: ${(effect as any).type}`, { actor: userId })
      );
      break;
  }

  const newEntities = { ...state.entities };
  newEntities[userId] = { ...user };
  if (target) newEntities[targetId] = { ...target };

  return {
    state: { ...state, entities: newEntities, log: [...state.log, ...log] },
    result: {
      success: true,
      type: 'hit',
      damage,
      narration: log.map((l) => l.message).join('\n'),
    },
  };
}

/**
 * 执行逃跑
 */
export function executeFlee(state: CombatState, entityId: string): { state: CombatState; result: CombatResult } {
  const entity = state.entities[entityId];
  if (!entity) {
    return {
      state,
      result: { success: false, type: 'flee_fail', narration: '实体不存在。' },
    };
  }

  // 敏捷检定
  const dex = entity.stats.dex || 50;
  // 逃跑难度 = 50 + 敌人数量 * 10
  const difficulty = 50 + state.enemyIds.filter((id) => state.entities[id]?.hp > 0).length * 10;
  const modifier = dex - difficulty;

  const check = d100Check(50, modifier);

  const log: CombatLogEntry[] = [];
  log.push(createLogEntry('flee', `${entity.name} 尝试逃跑！`, { actor: entityId }));
  log.push(createLogEntry('info', check.narration));

  if (check.success) {
    log.push(createLogEntry('system', `${entity.name} 成功逃脱了！`));
    return {
      state: { ...state, log: [...state.log, ...log] },
      result: {
        success: true,
        type: 'flee_success',
        narration: `${entity.name} 成功逃脱！`,
      },
    };
  } else {
    log.push(createLogEntry('system', '逃跑失败，敌人拦住了去路！'));
    return {
      state: { ...state, log: [...state.log, ...log] },
      result: {
        success: false,
        type: 'flee_fail',
        narration: '逃跑失败，被敌人拦住了！',
      },
    };
  }
}

/**
 * 执行NPC/敌人的AI行动
 */
export function executeAIAction(state: CombatState, entityId: string): CombatState {
  const entity = state.entities[entityId];
  if (!entity || entity.hp <= 0) return state;

  // 简单AI：优先攻击HP最少的敌人
  const targets = entity.type === 'enemy'
    ? [state.playerId, ...state.allyIds].filter((id) => state.entities[id]?.hp > 0)
    : state.enemyIds.filter((id) => state.entities[id]?.hp > 0);

  if (targets.length === 0) return state;

  // 找HP最少的
  let targetId = targets[0];
  let minHp = state.entities[targetId]?.hp ?? Infinity;
  for (const tid of targets) {
    const t = state.entities[tid];
    if (t && t.hp < minHp && t.hp > 0) {
      minHp = t.hp;
      targetId = tid;
    }
  }

  // 随机决定是否使用技能（30%概率）
  const useSkill = Math.random() < 0.3;
  const skillPool = ['brawl', 'firearm', 'desperate_strike'];
  const skillId = useSkill ? skillPool[Math.floor(Math.random() * skillPool.length)] : 'brawl';

  if (skillId !== 'brawl' && entity.type === 'enemy') {
    const { state: newState } = executeSkill(state, entityId, targetId, skillId);
    return newState;
  }

  const { state: newState } = executeAttack(state, entityId, targetId, skillId);
  return newState;
}

/**
 * 推进到下一回合
 */
export function advanceTurn(state: CombatState): CombatState {
  let nextIndex = state.currentTurnIndex + 1;
  let nextRound = state.round;

  // 如果队列走完，回到开头，轮数+1
  if (nextIndex >= state.turnQueue.length) {
    nextIndex = 0;
    nextRound += 1;
  }

  // 跳过已死亡的实体
  while (nextIndex < state.turnQueue.length) {
    const entityId = state.turnQueue[nextIndex];
    const entity = state.entities[entityId];
    if (entity && entity.hp > 0) break;
    nextIndex++;
    if (nextIndex >= state.turnQueue.length) {
      nextIndex = 0;
      nextRound += 1;
    }
  }

  const nextEntityId = state.turnQueue[nextIndex];
  const nextEntity = state.entities[nextEntityId];
  const isPlayer = nextEntityId === state.playerId;

  // 减少状态效果持续时间
  const updatedEntities = { ...state.entities };
  for (const [eid, ent] of Object.entries(updatedEntities)) {
    if (ent.statusEffects.length > 0) {
      const newEffects = ent.statusEffects
        .map((se) => ({ ...se, duration: se.duration - 1 }))
        .filter((se) => se.duration !== 0);
      updatedEntities[eid] = { ...ent, statusEffects: newEffects };
    }
  }

  const log: CombatLogEntry[] = [];
  if (nextRound > state.round) {
    log.push(createLogEntry('system', `─── 第 ${nextRound} 回合 ───`));
  }
  log.push(createLogEntry('info', `${nextEntity?.name || nextEntityId} 的回合`));

  return {
    ...state,
    entities: updatedEntities,
    round: nextRound,
    currentTurnIndex: nextIndex,
    currentTurnEntityId: nextEntityId,
    isPlayerTurn: isPlayer,
    phase: isPlayer ? 'player_turn' : nextEntity?.type === 'enemy' ? 'enemy_turn' : 'npc_turn',
    log: [...state.log, ...log],
    pendingAction: null,
    targetSelectionMode: false,
    selectedTargetId: null,
    selectedSkillId: null,
    selectedItemId: null,
  };
}

/**
 * 检查战斗是否结束
 */
export function checkCombatEnd(state: CombatState): CombatState {
  const player = state.entities[state.playerId];
  const aliveEnemies = state.enemyIds.filter((id) => state.entities[id]?.hp > 0);
  const aliveAllies = state.allyIds.filter((id) => state.entities[id]?.hp > 0);

  let phase: CombatPhase = state.phase;
  const log: CombatLogEntry[] = [];

  if (!player || player.hp <= 0) {
    phase = 'defeat';
    log.push(createLogEntry('system', '☠️ 你倒下了...战斗失败。'));
  } else if (aliveEnemies.length === 0) {
    phase = 'victory';
    log.push(createLogEntry('system', '🏆 所有敌人已被消灭！战斗胜利！'));
  } else if (state.phase === 'fled') {
    log.push(createLogEntry('system', '💨 你成功逃离了战斗！'));
  }

  if (log.length > 0) {
    return { ...state, phase, log: [...state.log, ...log], active: phase !== 'victory' && phase !== 'defeat' && phase !== 'fled' };
  }

  return state;
}

/**
 * 获取可用的技能列表
 */
export function getAvailableSkills(entity: CombatEntity): CombatSkill[] {
  return Object.values(DEFAULT_SKILLS).filter((skill) => {
    if (skill.cost.mp && entity.mp < skill.cost.mp) return false;
    if (skill.cost.sanity && (entity.sanity || 0) < skill.cost.sanity) return false;
    if (skill.requirement) {
      for (const [stat, val] of Object.entries(skill.requirement)) {
        if ((entity.stats[stat] || 0) < val) return false;
      }
    }
    return true;
  });
}

/**
 * 获取实体当前的总属性（含状态效果修正）
 */
export function getEffectiveStats(entity: CombatEntity): Record<string, number> {
  const stats = { ...entity.stats };
  entity.statusEffects.forEach((se) => {
    if (se.modifier) {
      for (const [key, val] of Object.entries(se.modifier)) {
        stats[key] = (stats[key] || 0) + val;
      }
    }
  });
  return stats;
}
