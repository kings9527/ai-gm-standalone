/**
 * Phase 3-G: 世界动态响应引擎
 *
 * 让世界对玩家行为产生真实反应：
 * ① 玩家 choices 影响世界状态（如杀了邪教徒→密修会加强警戒）
 * ② NPC 根据世界状态改变行为
 * ③ 场景描述动态变化（如仓库战斗后留下痕迹）
 */

import type { Campaign, Scene, NPCState } from '../types/module';

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

/** 世界状态根结构 — 存储在 campaign.worldState 中 */
export interface WorldState {
  /** 派系/组织状态映射 */
  factions: Record<string, FactionState>;
  /** 区域状态映射（key = sceneId 或 regionId） */
  regions: Record<string, RegionState>;
  /** 已发生的全局事件标记 */
  globalEvents: string[];
  /** 场景动态修饰符（场景ID → 修饰符列表） */
  sceneModifiers: Record<string, SceneModifier[]>;
  /** 世界状态变更历史（用于叙事上下文） */
  history: WorldStateChange[];
  /** 版本号，用于存档兼容 */
  version: number;
}

/** 派系状态 */
export interface FactionState {
  /** 警戒等级 0-100（越高越警觉） */
  alertLevel: number;
  /** 玩家声望 -100 ~ 100（负为敌对） */
  reputation: number;
  /** 势力强度 0-100 */
  strength: number;
  /** 是否已被玩家知晓 */
  knownToPlayer: boolean;
  /** 自定义标记 */
  tags: string[];
}

/** 区域状态 */
export interface RegionState {
  /** 危险等级 0-100 */
  dangerLevel: number;
  /** 整洁度 0-100（战斗后降低，留下痕迹） */
  cleanliness: number;
  /** 人员密度 0-100 */
  traffic: number;
  /** 特殊状态标签：如 'battle_ruins', 'cult_active', 'quarantine' */
  specialStatus: string[];
  /** 最后一次被修改的时间戳 */
  lastModified: number;
}

/** 场景动态修饰符 */
export interface SceneModifier {
  id: string;
  /** 修饰类型 */
  type: 'description_append' | 'description_prepend' | 'atmosphere' | 'npc_presence' | 'exit_block' | 'exit_unlock';
  /** 触发条件（简化的 key-value 匹配，如 { faction: 'cult', alertLevel: '>50' }） */
  condition?: Record<string, string | number | boolean>;
  /** 修饰内容 */
  value: string;
  /** 优先级，越高越优先应用 */
  priority: number;
  /** 是否只能应用一次 */
  onceOnly?: boolean;
  /** 来源（choiceId / eventId / combatId） */
  source?: string;
}

/** 世界状态变更记录 */
export interface WorldStateChange {
  /** 变更时间戳 */
  timestamp: number;
  /** 变更原因描述 */
  cause: string;
  /** 具体变更内容 */
  changes: Record<string, unknown>;
  /** 来源类型 */
  sourceType: 'choice' | 'event' | 'combat' | 'npc' | 'manual';
  /** 来源ID */
  sourceId?: string;
}

/** 选择对世界状态的影响定义 */
export interface ChoiceWorldImpact {
  /** 触发条件（全局变量条件） */
  condition?: Record<string, unknown>;
  /** 派系影响 */
  factionEffects?: Record<string, Partial<FactionState> | FactionEffectOp | (Partial<FactionState> | FactionEffectOp)[]>;
  /** 区域影响 */
  regionEffects?: Record<string, Partial<RegionState> | RegionEffectOp | (Partial<RegionState> | RegionEffectOp)[]>;
  /** 全局事件标记 */
  addGlobalEvents?: string[];
  /** 场景修饰符 */
  sceneModifiers?: SceneModifier[];
  /** 变更原因描述 */
  cause: string;
}

/** 派系效果操作（支持增量/减量） */
export interface FactionEffectOp {
  op: 'add' | 'set' | 'max' | 'min';
  field: keyof FactionState;
  value: number | boolean | string;
}

/** 区域效果操作 */
export interface RegionEffectOp {
  op: 'add' | 'set' | 'max' | 'min';
  field: keyof RegionState;
  value: number | boolean | string | string[];
}

// ═══════════════════════════════════════════════════════════
// 默认世界状态工厂
// ═══════════════════════════════════════════════════════════

export function createDefaultWorldState(): WorldState {
  return {
    factions: {},
    regions: {},
    globalEvents: [],
    sceneModifiers: {},
    history: [],
    version: 1,
  };
}

/** 确保 worldState 存在（兼容旧存档） */
export function ensureWorldState(campaign: Campaign): WorldState {
  if ((campaign as any).worldState) {
    const ws = (campaign as any).worldState as WorldState;
    return { ...createDefaultWorldState(), ...ws };
  }
  return createDefaultWorldState();
}

// ═══════════════════════════════════════════════════════════
// 世界状态引擎
// ═══════════════════════════════════════════════════════════

export class WorldStateEngine {
  private worldState: WorldState;

  constructor(worldState?: WorldState) {
    this.worldState = worldState ? { ...createDefaultWorldState(), ...worldState } : createDefaultWorldState();
  }

  getState(): WorldState {
    return this.worldState;
  }

  // ─────────────────────────────────────────────────────────
  // 核心更新方法
  // ─────────────────────────────────────────────────────────

  /**
   * 应用选择对世界状态的影响
   * ① 玩家 choices 影响世界状态
   */
  applyChoiceImpact(choiceId: string, impact: ChoiceWorldImpact, campaignGlobalVars?: Record<string, unknown>): WorldStateChange[] {
    const changes: WorldStateChange[] = [];

    // 检查条件
    if (impact.condition && campaignGlobalVars) {
      if (!this.evaluateCondition(impact.condition, campaignGlobalVars)) {
        return changes;
      }
    }

    // 应用派系影响
    if (impact.factionEffects) {
      for (const [factionId, effect] of Object.entries(impact.factionEffects)) {
        const effects = Array.isArray(effect) ? effect : [effect];
        for (const e of effects) {
          const change = this.applyFactionEffect(factionId, e);
          if (change) changes.push(change);
        }
      }
    }

    // 应用区域影响
    if (impact.regionEffects) {
      for (const [regionId, effect] of Object.entries(impact.regionEffects)) {
        const effects = Array.isArray(effect) ? effect : [effect];
        for (const e of effects) {
          const change = this.applyRegionEffect(regionId, e);
          if (change) changes.push(change);
        }
      }
    }

    // 添加全局事件
    if (impact.addGlobalEvents) {
      for (const event of impact.addGlobalEvents) {
        if (!this.worldState.globalEvents.includes(event)) {
          this.worldState.globalEvents.push(event);
          changes.push({
            timestamp: Date.now(),
            cause: impact.cause,
            changes: { globalEvent: event },
            sourceType: 'choice',
            sourceId: choiceId,
          });
        }
      }
    }

    // 添加场景修饰符
    if (impact.sceneModifiers) {
      for (const modifier of impact.sceneModifiers) {
        const sceneId = modifier.condition?.sceneId as string || 'global';
        if (!this.worldState.sceneModifiers[sceneId]) {
          this.worldState.sceneModifiers[sceneId] = [];
        }
        // 去重：同 source + 同 type + 同 value 不重复添加
        const exists = this.worldState.sceneModifiers[sceneId].some(
          (m) => m.source === modifier.source && m.type === modifier.type && m.value === modifier.value
        );
        if (!exists) {
          this.worldState.sceneModifiers[sceneId].push({ ...modifier });
          changes.push({
            timestamp: Date.now(),
            cause: impact.cause,
            changes: { sceneModifier: { sceneId, ...modifier } },
            sourceType: 'choice',
            sourceId: choiceId,
          });
        }
      }
    }

    // 记录总变更
    if (changes.length > 0) {
      this.worldState.history.push(...changes);
    }

    return changes;
  }

  /**
   * 应用事件对世界状态的影响
   */
  applyEventImpact(eventId: string, effects: Record<string, unknown>): WorldStateChange[] {
    const changes: WorldStateChange[] = [];
    const now = Date.now();

    // 解析事件效果中的世界状态相关字段
    for (const [key, value] of Object.entries(effects)) {
      // 派系影响: faction_<name>_alert|reputation|strength
      const factionMatch = key.match(/^faction_(.+?)_(alert|reputation|strength|known|tags)$/);
      if (factionMatch) {
        const [, factionId, field] = factionMatch;
        const fieldMap: Record<string, keyof FactionState> = {
          alert: 'alertLevel',
          reputation: 'reputation',
          strength: 'strength',
          known: 'knownToPlayer',
          tags: 'tags',
        };
        const mappedField = fieldMap[field];
        if (mappedField) {
          const change = this.applyFactionEffect(factionId, { op: 'set', field: mappedField, value: value as any });
          if (change) {
            change.sourceType = 'event';
            change.sourceId = eventId;
            change.timestamp = now;
            changes.push(change);
          }
        }
      }

      // 区域影响: region_<sceneId>_danger|cleanliness|traffic|status
      const regionMatch = key.match(/^region_(.+?)_(danger|cleanliness|traffic|status)$/);
      if (regionMatch) {
        const [, regionId, field] = regionMatch;
        const fieldMap: Record<string, keyof RegionState> = {
          danger: 'dangerLevel',
          cleanliness: 'cleanliness',
          traffic: 'traffic',
          status: 'specialStatus',
        };
        const mappedField = fieldMap[field];
        if (mappedField) {
          const change = this.applyRegionEffect(regionId, { op: 'set', field: mappedField, value: value as any });
          if (change) {
            change.sourceType = 'event';
            change.sourceId = eventId;
            change.timestamp = now;
            changes.push(change);
          }
        }
      }
    }

    if (changes.length > 0) {
      this.worldState.history.push(...changes);
    }

    return changes;
  }

  /**
   * 应用战斗结果对世界状态的影响
   * ③ 场景描述动态变化（战斗后留下痕迹）
   */
  applyCombatImpact(sceneId: string, result: {
    playerWon: boolean;
    enemiesKilled: string[];
    enemiesFled: string[];
    playerFled: boolean;
    turns: number;
  }): WorldStateChange[] {
    const changes: WorldStateChange[] = [];
    const now = Date.now();

    // 战斗后区域变脏、变危险
    const regionChange = this.applyRegionEffect(sceneId, {
      op: 'add',
      field: 'dangerLevel',
      value: result.playerWon ? 10 : 20,
    });
    if (regionChange) {
      regionChange.sourceType = 'combat';
      regionChange.cause = `在 ${sceneId} 发生战斗`;
      regionChange.timestamp = now;
      changes.push(regionChange);
    }

    const cleanChange = this.applyRegionEffect(sceneId, {
      op: 'add',
      field: 'cleanliness',
      value: -30,
    });
    if (cleanChange) {
      cleanChange.sourceType = 'combat';
      cleanChange.cause = `战斗在 ${sceneId} 留下了痕迹`;
      cleanChange.timestamp = now;
      changes.push(cleanChange);
    }

    // 添加战斗痕迹的场景修饰符
    if (!this.worldState.sceneModifiers[sceneId]) {
      this.worldState.sceneModifiers[sceneId] = [];
    }

    const battleRuinsModifier: SceneModifier = {
      id: `battle_ruins_${sceneId}_${now}`,
      type: 'description_append',
      value: result.playerWon
        ? '地上散落着战斗的痕迹，血迹尚未干涸。'
        : '这里一片狼藉，似乎经历过激烈的战斗。',
      priority: 50,
      onceOnly: true,
      source: `combat_${sceneId}`,
    };

    this.worldState.sceneModifiers[sceneId].push(battleRuinsModifier);
    changes.push({
      timestamp: now,
      cause: `战斗痕迹: ${sceneId}`,
      changes: { sceneModifier: battleRuinsModifier },
      sourceType: 'combat',
      sourceId: sceneId,
    });

    // 敌人被杀 → 相关派系警戒增加
    if (result.enemiesKilled.length > 0) {
      for (const enemyId of result.enemiesKilled) {
        // 尝试推断派系（从 enemyId 前缀或 NPC role）
        const factionId = this.inferFactionFromEnemy(enemyId);
        if (factionId) {
          const alertChange = this.applyFactionEffect(factionId, {
            op: 'add',
            field: 'alertLevel',
            value: 15,
          });
          if (alertChange) {
            alertChange.sourceType = 'combat';
            alertChange.cause = `击杀 ${enemyId} 引起 ${factionId} 警觉`;
            alertChange.timestamp = now;
            changes.push(alertChange);
          }
        }
      }
    }

    this.worldState.history.push(...changes);
    return changes;
  }

  /**
   * 应用 NPC 行为对世界状态的影响
   * ② NPC 根据世界状态改变行为 → 反过来也影响世界
   */
  applyNPCImpact(npcId: string, action: string, sceneId: string): WorldStateChange[] {
    const changes: WorldStateChange[] = [];
    const now = Date.now();

    if (action === 'alert_faction') {
      const factionId = this.inferFactionFromNPC(npcId);
      if (factionId) {
        const change = this.applyFactionEffect(factionId, {
          op: 'add',
          field: 'alertLevel',
          value: 10,
        });
        if (change) {
          change.sourceType = 'npc';
          change.sourceId = npcId;
          change.timestamp = now;
          changes.push(change);
        }
      }
    }

    if (changes.length > 0) {
      this.worldState.history.push(...changes);
    }
    return changes;
  }

  // ─────────────────────────────────────────────────────────
  // 查询方法
  // ─────────────────────────────────────────────────────────

  /**
   * 获取场景动态描述修饰
   * ③ 场景描述动态变化
   */
  buildDynamicSceneDescription(scene: Scene, baseDescription: string): string {
    const sceneId = scene.id;
    const modifiers = this.worldState.sceneModifiers[sceneId] || [];
    const region = this.worldState.regions[sceneId];

    let description = baseDescription;
    let appendParts: string[] = [];
    let prependParts: string[] = [];

    // 应用场景修饰符
    for (const mod of modifiers) {
      if (!this.modifierConditionMet(mod, sceneId)) continue;
      if (mod.onceOnly) {
        const appliedKey = `_modifier_applied:${mod.id}`;
        if ((scene as any)[appliedKey]) continue;
        (scene as any)[appliedKey] = true;
      }

      switch (mod.type) {
        case 'description_append':
          appendParts.push(mod.value);
          break;
        case 'description_prepend':
          prependParts.push(mod.value);
          break;
        case 'atmosphere':
          appendParts.push(`【氛围】${mod.value}`);
          break;
        default:
          // 未知修饰器类型，忽略
          break;
      }
    }

    // 根据区域状态动态调整
    if (region) {
      if (region.cleanliness < 30) {
        appendParts.push('这里显得凌乱不堪。');
      } else if (region.cleanliness < 60) {
        appendParts.push('这里有些杂乱。');
      }
      if (region.dangerLevel > 70) {
        prependParts.push('【危险区域】');
      }
      if (region.specialStatus.includes('quarantine')) {
        prependParts.push('【封锁中】');
      }
    }

    // 根据派系状态动态调整
    for (const [factionId, faction] of Object.entries(this.worldState.factions)) {
      if (faction.alertLevel > 70) {
        appendParts.push(`${factionId}的巡逻队似乎加强了警戒。`);
      }
    }

    // 组装描述
    const prepend = prependParts.length > 0 ? prependParts.join('') + '\n\n' : '';
    const append = appendParts.length > 0 ? '\n\n' + appendParts.join('\n') : '';

    return prepend + description + append;
  }

  /**
   * ② NPC 根据世界状态改变行为
   * 获取 NPC 行为修饰符（用于 NPC 决策引擎）
   */
  getNPCBehaviorModifier(npcId: string, npcState: NPCState): NPCBehaviorModifier {
    const factionId = this.inferFactionFromNPC(npcId);
    const faction = factionId ? this.worldState.factions[factionId] : null;

    const modifier: NPCBehaviorModifier = {
      attitudeShift: 0,
      trustShift: 0,
      fearShift: 0,
      hostilityShift: 0,
      dialogueHints: [],
      blockedActions: [],
      forcedActions: [],
    };

    if (faction) {
      // 派系警戒高 → NPC 更敌对/警惕
      if (faction.alertLevel > 70) {
        modifier.attitudeShift -= 20;
        modifier.trustShift -= 15;
        modifier.fearShift += 10;
        modifier.hostilityShift += 15;
        modifier.dialogueHints.push('周围气氛紧张，似乎有什么大事发生。');
      } else if (faction.alertLevel > 40) {
        modifier.trustShift -= 5;
        modifier.dialogueHints.push('这里最近不太平。');
      }

      // 玩家声望极低 → NPC 敌对
      if (faction.reputation < -50) {
        modifier.attitudeShift -= 30;
        modifier.hostilityShift += 25;
        modifier.dialogueHints.push('你在这里不受欢迎。');
      }

      // 派系已知玩家 → 可能根据声望调整
      if (faction.knownToPlayer && faction.reputation < -30) {
        modifier.blockedActions.push('trade', 'help');
      }
    }

    // 区域危险等级高 → NPC 恐惧增加
    const regionId = npcState.custom_vars?.currentScene as string;
    const region = regionId ? this.worldState.regions[regionId] : null;
    if (region && region.dangerLevel > 60) {
      modifier.fearShift += 10;
      modifier.dialogueHints.push('这里感觉不安全...');
    }

    return modifier;
  }

  /**
   * 获取派系状态
   */
  getFaction(factionId: string): FactionState | null {
    return this.worldState.factions[factionId] || null;
  }

  /**
   * 获取区域状态
   */
  getRegion(regionId: string): RegionState | null {
    return this.worldState.regions[regionId] || null;
  }

  /**
   * 获取最近的变更记录（用于叙事上下文）
   */
  getRecentChanges(limit: number = 5): WorldStateChange[] {
    return this.worldState.history.slice(-limit);
  }

  /**
   * 获取世界状态摘要（用于 LLM 上下文）
   */
  getWorldContextSummary(): string {
    const parts: string[] = [];

    for (const [fid, f] of Object.entries(this.worldState.factions)) {
      if (f.knownToPlayer) {
        parts.push(`派系「${fid}」: 警戒${f.alertLevel}, 声望${f.reputation}, 势力${f.strength}`);
      }
    }

    for (const [rid, r] of Object.entries(this.worldState.regions)) {
      if (r.dangerLevel > 30 || r.cleanliness < 50 || r.specialStatus.length > 0) {
        parts.push(`区域「${rid}」: 危险${r.dangerLevel}, 整洁${r.cleanliness}, 状态[${r.specialStatus.join(',')}]`);
      }
    }

    if (this.worldState.globalEvents.length > 0) {
      parts.push(`已发生事件: ${this.worldState.globalEvents.slice(-5).join(', ')}`);
    }

    return parts.join('\n');
  }

  // ─────────────────────────────────────────────────────────
  // 内部方法
  // ─────────────────────────────────────────────────────────

  private applyFactionEffect(factionId: string, effect: Partial<FactionState> | FactionEffectOp): WorldStateChange | null {
    if (!this.worldState.factions[factionId]) {
      this.worldState.factions[factionId] = {
        alertLevel: 0,
        reputation: 0,
        strength: 50,
        knownToPlayer: false,
        tags: [],
      };
    }

    const faction = this.worldState.factions[factionId];

    if ('op' in effect && effect.op) {
      const op = effect as FactionEffectOp;
      const current = faction[op.field] as any;
      if (op.field === 'alertLevel' || op.field === 'reputation' || op.field === 'strength') {
        if (op.op === 'add') faction[op.field] = Math.max(0, Math.min(100, current + (op.value as number)));
        else if (op.op === 'set') faction[op.field] = op.value as number;
        else if (op.op === 'max') faction[op.field] = Math.max(current, op.value as number);
        else if (op.op === 'min') faction[op.field] = Math.min(current, op.value as number);
      } else if (op.field === 'knownToPlayer' && typeof op.value === 'boolean') {
        faction[op.field] = op.value;
      } else if (op.field === 'tags' && Array.isArray(op.value)) {
        faction[op.field] = [...new Set([...faction[op.field], ...op.value])];
      }
    } else {
      Object.assign(faction, effect);
    }

    return {
      timestamp: Date.now(),
      cause: `派系 ${factionId} 状态变更`,
      changes: { factionId, ...effect },
      sourceType: 'manual',
    };
  }

  private applyRegionEffect(regionId: string, effect: Partial<RegionState> | RegionEffectOp): WorldStateChange | null {
    if (!this.worldState.regions[regionId]) {
      this.worldState.regions[regionId] = {
        dangerLevel: 0,
        cleanliness: 100,
        traffic: 50,
        specialStatus: [],
        lastModified: Date.now(),
      };
    }

    const region = this.worldState.regions[regionId];

    if ('op' in effect && effect.op) {
      const op = effect as RegionEffectOp;
      const current = region[op.field] as any;
      if (op.field === 'dangerLevel' || op.field === 'cleanliness' || op.field === 'traffic') {
        if (op.op === 'add') region[op.field] = Math.max(0, Math.min(100, current + (op.value as number)));
        else if (op.op === 'set') region[op.field] = op.value as number;
        else if (op.op === 'max') region[op.field] = Math.max(current, op.value as number);
        else if (op.op === 'min') region[op.field] = Math.min(current, op.value as number);
      } else if (op.field === 'specialStatus' && Array.isArray(op.value)) {
        if (op.op === 'add') region[op.field] = [...new Set([...region[op.field], ...op.value])];
        else region[op.field] = op.value as string[];
      }
    } else {
      Object.assign(region, effect);
    }

    region.lastModified = Date.now();

    return {
      timestamp: Date.now(),
      cause: `区域 ${regionId} 状态变更`,
      changes: { regionId, ...effect },
      sourceType: 'manual',
    };
  }

  private evaluateCondition(condition: Record<string, unknown>, globalVars: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(condition)) {
      const gv = globalVars[key];
      if (typeof value === 'boolean' && !!gv !== value) return false;
      if (typeof value === 'number' && (gv as number) !== value) return false;
      if (typeof value === 'string' && (gv as string) !== value) return false;
    }
    return true;
  }

  private modifierConditionMet(modifier: SceneModifier, _sceneId: string): boolean {
    if (!modifier.condition) return true;
    // 简化条件检查：目前只检查 faction alertLevel 的阈值
    for (const [key, value] of Object.entries(modifier.condition)) {
      if (key === 'faction') {
        const faction = this.worldState.factions[value as string];
        if (!faction) return false;
      }
      if (key === 'alertLevel' && typeof value === 'string' && value.startsWith('>')) {
        const threshold = parseInt(value.slice(1));
        // 这里简化处理：默认检查 cult 的 alertLevel
        const cult = this.worldState.factions['cult'];
        if (!cult || cult.alertLevel <= threshold) return false;
      }
    }
    return true;
  }

  private inferFactionFromEnemy(enemyId: string): string | null {
    // 简单的推断逻辑：enemyId 包含 faction 前缀
    if (enemyId.includes('cult') || enemyId.includes('邪教徒')) return 'cult';
    if (enemyId.includes('gang') || enemyId.includes('黑帮')) return 'gang';
    if (enemyId.includes('police') || enemyId.includes('警察')) return 'police';
    if (enemyId.includes('monster') || enemyId.includes('怪物')) return 'eldritch';
    return null;
  }

  private inferFactionFromNPC(npcId: string): string | null {
    if (npcId.includes('cult') || npcId.includes('邪教徒')) return 'cult';
    if (npcId.includes('gang') || npcId.includes('黑帮')) return 'gang';
    if (npcId.includes('police') || npcId.includes('警察')) return 'police';
    if (npcId.includes('informant') || npcId.includes('线人')) return 'neutral';
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// NPC 行为修饰符类型
// ═══════════════════════════════════════════════════════════

export interface NPCBehaviorModifier {
  /** 态度偏移量 */
  attitudeShift: number;
  /** 信任偏移量 */
  trustShift: number;
  /** 恐惧偏移量 */
  fearShift: number;
  /** 敌意偏移量 */
  hostilityShift: number;
  /** NPC 对话提示 */
  dialogueHints: string[];
  /** 被封锁的行动 */
  blockedActions: string[];
  /** 强制执行的行动 */
  forcedActions: string[];
}

// ═══════════════════════════════════════════════════════════
// 预设的世界状态影响库（模组可用）
// ═══════════════════════════════════════════════════════════

export const PRESET_WORLD_IMPACTS: Record<string, ChoiceWorldImpact> = {
  /** 杀死邪教徒 */
  'kill_cultist': {
    cause: '你杀死了邪教徒，密修会加强了警戒。',
    factionEffects: {
      cult: { op: 'add', field: 'alertLevel', value: 25 },
    },
    regionEffects: {
      warehouse: { op: 'add', field: 'dangerLevel', value: 15 },
    },
    sceneModifiers: [{
      id: 'cult_vigilance',
      type: 'atmosphere',
      value: '空气中弥漫着紧张的气氛，你感觉有人在暗中监视你。',
      priority: 60,
      condition: { faction: 'cult', alertLevel: '>50' },
    }],
  },
  /** 放走邪教徒 */
  'spare_cultist': {
    cause: '你放走了邪教徒，但他可能会回去报信。',
    factionEffects: {
      cult: { op: 'add', field: 'alertLevel', value: 10 },
    },
  },
  /** 报告警察 */
  'report_to_police': {
    cause: '你向警方报告了邪教徒的活动。',
    factionEffects: {
      police: { op: 'add', field: 'alertLevel', value: 20 },
      cult: { op: 'add', field: 'alertLevel', value: 15 },
    },
    addGlobalEvents: ['police_investigation_started'],
  },
  /** 销毁证据 */
  'destroy_evidence': {
    cause: '你销毁了邪教徒的仪式用品。',
    factionEffects: {
      cult: [
        { op: 'add', field: 'alertLevel', value: 30 },
        { op: 'add', field: 'reputation', value: -20 },
      ],
    },
    regionEffects: {
      ritual_site: { op: 'add', field: 'cleanliness', value: 20 },
    },
  },
};

export default WorldStateEngine;
