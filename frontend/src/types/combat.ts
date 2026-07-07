import type { NPC } from './module';

/**
 * 战斗实体类型
 */
export type CombatEntityType = 'player' | 'npc' | 'enemy';

/**
 * 战斗实体（玩家/NPC/敌人通用接口）
 */
export interface CombatEntity {
  id: string;
  name: string;
  type: CombatEntityType;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  sanity?: number;
  maxSanity?: number;
  stats: Record<string, number>;
  statusEffects: CombatStatusEffect[];
  sprite?: string; // 立绘URL
  position?: 'left' | 'center' | 'right';
}

/**
 * 战斗状态效果
 */
export interface CombatStatusEffect {
  type: string;
  name: string;
  duration: number; // 剩余回合数，-1为永久
  description: string;
  modifier?: Record<string, number>; // 属性修正
}

/**
 * 战斗行动类型
 */
export type CombatActionType = 'attack' | 'skill' | 'item' | 'flee' | 'wait' | 'defend';

/**
 * 战斗行动
 */
export interface CombatAction {
  type: CombatActionType;
  sourceId: string;
  targetId?: string;
  skillId?: string;
  itemId?: string;
  data?: Record<string, unknown>;
}

/**
 * 战斗日志条目
 */
export interface CombatLogEntry {
  id: string;
  timestamp: number;
  type: 'info' | 'attack' | 'skill' | 'item' | 'flee' | 'damage' | 'heal' | 'status' | 'system';
  actor?: string;
  target?: string;
  message: string;
  damage?: number;
  isCritical?: boolean;
  isFumble?: boolean;
}

/**
 * 战斗回合阶段
 */
export type CombatPhase = 'init' | 'player_turn' | 'npc_turn' | 'enemy_turn' | 'resolution' | 'victory' | 'defeat' | 'fled';

/**
 * 完整的战斗状态
 */
export interface CombatState {
  active: boolean;
  phase: CombatPhase;
  round: number;
  turnQueue: string[]; // 按DEX排序的实体ID队列
  currentTurnIndex: number;
  currentTurnEntityId: string | null;
  entities: Record<string, CombatEntity>;
  playerId: string;
  enemyIds: string[];
  allyIds: string[]; // NPC盟友
  log: CombatLogEntry[];
  turnHistory: CombatAction[];
  pendingAction: CombatAction | null;
  ambush: boolean; // 是否被突袭
  isPlayerTurn: boolean;
  targetSelectionMode: boolean; // 是否在选择目标
  selectedTargetId: string | null;
  selectedSkillId: string | null;
  selectedItemId: string | null;
}

/**
 * 技能定义
 */
export interface CombatSkill {
  id: string;
  name: string;
  description: string;
  cost: { mp?: number; sanity?: number };
  targetType: 'self' | 'single' | 'all_enemies' | 'all_allies';
  effect: {
    type: 'damage' | 'heal' | 'buff' | 'debuff' | 'status';
    formula?: string; // 伤害公式如 "1d6+2"
    statusEffect?: CombatStatusEffect;
    statModifier?: Record<string, number>;
  };
  requirement?: Record<string, number>; // 使用条件（属性要求）
}

/**
 * 战斗物品效果
 */
export interface CombatItemEffect {
  type: 'heal_hp' | 'heal_mp' | 'heal_sanity' | 'buff' | 'damage' | 'status';
  value: number | string; // 数值或骰子表达式
  target: 'self' | 'single' | 'all_enemies' | 'all_allies';
  description: string;
}

/**
 * 战斗结果
 */
export interface CombatResult {
  success: boolean;
  type: 'hit' | 'miss' | 'critical' | 'fumble' | 'flee_success' | 'flee_fail';
  damage?: number;
  roll?: number;
  target?: number;
  narration: string;
}

/**
 * 战斗初始化选项
 */
export interface CombatInitOptions {
  enemies: string[]; // NPC IDs
  allies?: string[]; // NPC盟友IDs
  ambush?: boolean;
  playerStats?: Partial<CombatEntity>;
}
