import type { Module, Campaign, Event, Scene, Exit } from '../types/module';

/**
 * EventSystem
 * Phase 2-C: 事件系统自然语言触发
 *
 * 职责：
 * 1. 检查场景中的普通事件（原有触发逻辑）
 * 2. 检查 hidden_events（需自然语言匹配触发）
 * 3. 事件完成后解锁新的 exits/npcs/items/interactables
 * 4. 管理事件触发状态（不可变更新）
 */

export interface EventCheckResult {
  triggered: boolean;
  eventId?: string;
  narration?: string;
  available_actions?: Array<{ type: string; target?: string; label: string }>;
  /** 解锁的场景内容 */
  unlocked?: {
    exits?: Exit[];
    npcs?: string[];
    items?: string[];
    interactables?: string[];
  };
}

export interface EventUnlockPayload {
  exits?: Exit[];
  npcs?: string[];
  items?: string[];
  interactables?: string[];
}

export class EventSystem {
  private module: Module;
  private campaign: Campaign;
  private currentScene: Scene;

  constructor(module: Module, campaign: Campaign, currentScene: Scene) {
    this.module = module;
    this.campaign = campaign;
    this.currentScene = currentScene;
  }

  /**
   * 检查所有事件触发条件
   * 顺序：普通 events → hidden_events（自然语言匹配）
   */
  checkEvents(intent: any, playerInput: string): EventCheckResult {
    // 1. 先检查 module 级别的普通事件（原有逻辑）
    const moduleEventResult = this.checkModuleEvents(intent);
    if (moduleEventResult.triggered) return moduleEventResult;

    // 2. 检查当前场景的 hidden_events（自然语言触发）
    const hiddenEventResult = this.checkHiddenEvents(playerInput);
    if (hiddenEventResult.triggered) return hiddenEventResult;

    return { triggered: false };
  }

  // ─── Module 级别普通事件检查 ──────────────────────────────

  private checkModuleEvents(intent: any): EventCheckResult {
    if (!this.module.events) return { triggered: false };

    for (const [eventId, event] of Object.entries(this.module.events)) {
      const trigger = event.trigger;
      if (!trigger) continue;
      if (trigger.scene && trigger.scene !== this.currentScene.id) continue;
      if (trigger.action && trigger.action !== intent.type) continue;

      const eventKey = `event_triggered:${eventId}`;
      if (this.campaign.global_vars[eventKey]) continue;
      if (trigger.chance && Math.random() > trigger.chance) continue;
      if (trigger.condition && !this.evaluateCondition(trigger.condition)) continue;

      // 触发事件
      return this.executeEvent(eventId, event);
    }

    return { triggered: false };
  }

  // ─── Hidden Events 自然语言触发检查 ───────────────────────

  private checkHiddenEvents(playerInput: string): EventCheckResult {
    if (!this.currentScene.hidden_events || this.currentScene.hidden_events.length === 0) {
      return { triggered: false };
    }

    const input = playerInput.toLowerCase().trim();
    if (!input) return { triggered: false };

    for (const event of this.currentScene.hidden_events) {
      const eventKey = `hidden_event_triggered:${this.currentScene.id}:${event.id}`;

      // 已触发且不可重复
      if (this.campaign.global_vars[eventKey] && !event.repeatable) continue;

      // 检查前置条件
      if (event.trigger?.condition && !this.evaluateCondition(event.trigger.condition)) continue;
      if (event.trigger?.chance && Math.random() > event.trigger.chance) continue;

      // 自然语言匹配
      if (this.matchNaturalLanguage(input, event.trigger)) {
        return this.executeHiddenEvent(event, eventKey);
      }
    }

    return { triggered: false };
  }

  /**
   * 自然语言匹配逻辑
   * match_mode: 'exact' | 'contains' | 'fuzzy'
   */
  private matchNaturalLanguage(input: string, trigger: Event['trigger']): boolean {
    if (!trigger.keywords || trigger.keywords.length === 0) return false;

    const mode = trigger.match_mode || 'contains';
    const minMatch = trigger.min_match_count || 1;
    let matchCount = 0;

    for (const keyword of trigger.keywords) {
      const kw = keyword.toLowerCase().trim();
      if (!kw) continue;

      let matched = false;
      switch (mode) {
        case 'exact':
          matched = input === kw;
          break;
        case 'contains':
          matched = input.includes(kw);
          break;
        case 'fuzzy':
          // 模糊匹配：输入包含关键词，或关键词包含输入（允许子串匹配）
          matched = input.includes(kw) || kw.includes(input) || this.levenshteinDistance(input, kw) <= 2;
          break;
        default:
          // 未知匹配模式，默认使用 contains
          break;
      }

      if (matched) matchCount++;
    }

    return matchCount >= minMatch;
  }

  /**
   * Levenshtein 编辑距离（用于 fuzzy 模式）
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // 删除
          matrix[i][j - 1] + 1,      // 插入
          matrix[i - 1][j - 1] + cost // 替换
        );
      }
    }
    return matrix[a.length][b.length];
  }

  // ─── 事件执行 ───────────────────────────────────────────

  private executeEvent(eventId: string, event: Event): EventCheckResult {
    const eventKey = `event_triggered:${eventId}`;

    // 不可重复事件标记为已触发
    if (!event.repeatable) {
      this.campaign.global_vars = {
        ...this.campaign.global_vars,
        [eventKey]: true,
      };
    }

    // 应用效果
    if (event.effect) {
      this.applyEventEffects(event.effect);
    }

    // 解锁场景内容
    const unlocked = this.applyUnlocks(event.unlocks);

    // 构建叙事
    let narration = this.sanitizeNarration(event.description || '发生了一些事情...');

    // SAN 检定
    if (event.sanity_check) {
      const checkResult = this.performSanityCheck(event.sanity_check);
      narration += `\n\n${checkResult.narration}`;
    }

    return {
      triggered: true,
      eventId,
      narration,
      unlocked,
    };
  }

  private executeHiddenEvent(event: Event, eventKey: string): EventCheckResult {
    // 标记为已触发
    this.campaign.global_vars = {
      ...this.campaign.global_vars,
      [eventKey]: true,
    };

    // 应用效果
    if (event.effect) {
      this.applyEventEffects(event.effect);
    }

    // 解锁场景内容
    const unlocked = this.applyUnlocks(event.unlocks);

    // 构建叙事
    let narration = this.sanitizeNarration(event.description || '你发现了一些隐藏的东西...');

    // SAN 检定
    if (event.sanity_check) {
      const checkResult = this.performSanityCheck(event.sanity_check);
      narration += `\n\n${checkResult.narration}`;
    }

    return {
      triggered: true,
      eventId: event.id,
      narration,
      unlocked,
    };
  }

  // ─── 解锁场景内容 ───────────────────────────────────────

  private applyUnlocks(unlocks?: Event['unlocks']): EventUnlockPayload | undefined {
    if (!unlocks) return undefined;

    const result: EventUnlockPayload = {};

    // 解锁 exits（追加到当前场景）
    if (unlocks.exits && unlocks.exits.length > 0) {
      const currentExits = this.currentScene.exits || [];
      // 过滤已存在的 exit
      const newExits = unlocks.exits.filter(
        (e) => !currentExits.some((existing) => existing.target === e.target && existing.label === e.label)
      );
      if (newExits.length > 0) {
        this.currentScene = {
          ...this.currentScene,
          exits: [...currentExits, ...newExits],
        };
        result.exits = newExits;
      }
    }

    // 解锁 npcs
    if (unlocks.npcs && unlocks.npcs.length > 0) {
      const currentNPCs = this.currentScene.npcs || [];
      const newNPCs = unlocks.npcs.filter((id) => !currentNPCs.includes(id));
      if (newNPCs.length > 0) {
        this.currentScene = {
          ...this.currentScene,
          npcs: [...currentNPCs, ...newNPCs],
        };
        result.npcs = newNPCs;
      }
    }

    // 解锁 interactables（items）
    if (unlocks.interactables && unlocks.interactables.length > 0) {
      const currentInteractables = this.currentScene.interactables || [];
      const newInteractables = unlocks.interactables.filter((id) => !currentInteractables.includes(id));
      if (newInteractables.length > 0) {
        this.currentScene = {
          ...this.currentScene,
          interactables: [...currentInteractables, ...newInteractables],
        };
        result.interactables = newInteractables;
      }
    }

    // 解锁 items（添加到 module items 和 player inventory）
    if (unlocks.items && unlocks.items.length > 0) {
      result.items = unlocks.items;
      // 物品自动加入玩家物品栏（如果存在）
      for (const itemId of unlocks.items) {
        if (!this.campaign.player.inventory.includes(itemId)) {
          this.campaign.player = {
            ...this.campaign.player,
            inventory: [...this.campaign.player.inventory, itemId],
          };
        }
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  // ─── 效果应用（不可变更新）────────────────────────────────

  private applyEventEffects(effects: Record<string, unknown>) {
    for (const [key, value] of Object.entries(effects)) {
      if (key.includes('+')) {
        const baseKey = key.replace('+', '').trim();
        this.campaign.global_vars = {
          ...this.campaign.global_vars,
          [baseKey]: ((this.campaign.global_vars[baseKey] as number) || 0) + (value as number),
        };
      } else if (key.includes('-')) {
        const baseKey = key.replace('-', '').trim();
        this.campaign.global_vars = {
          ...this.campaign.global_vars,
          [baseKey]: ((this.campaign.global_vars[baseKey] as number) || 0) - (value as number),
        };
      } else if (key === 'sanity_loss') {
        const loss = typeof value === 'string' ? this.parseDiceExpression(value) : (value as number);
        const oldSanity = this.campaign.player.sanity || 50;
        this.campaign.player = {
          ...this.campaign.player,
          sanity: Math.max(0, oldSanity - loss),
        };
      } else {
        this.campaign.global_vars = {
          ...this.campaign.global_vars,
          [key]: value,
        };
      }
    }
  }

  private parseDiceExpression(expression: string): number {
    const match = expression.match(/(\d+)d(\d+)/);
    if (!match) return parseInt(expression) || 0;
    const count = parseInt(match[1]);
    const sides = parseInt(match[2]);
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
  }

  // ─── SAN 检定 ──────────────────────────────────────────

  private performSanityCheck(check: { target?: number; failure?: string }) {
    const target = check.target || (this.campaign.player.sanity ?? 50);
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= target;

    let narration = `SAN 检定：${roll} / ${target} — `;
    if (success) {
      narration += '成功。你保持理智。';
    } else {
      const lossExpr = check.failure || '1d6';
      const loss = this.parseDiceExpression(lossExpr);
      const oldSanity = this.campaign.player.sanity || 50;
      const newSanity = Math.max(0, oldSanity - loss);
      this.campaign.player = {
        ...this.campaign.player,
        sanity: newSanity,
      };
      narration += `失败。你失去 ${loss} 点 SAN。(${oldSanity} → ${newSanity})`;
      if (loss >= 5) {
        narration += '\n\n你受到了巨大的精神冲击，暂时陷入疯狂状态！';
        const statusEffects = this.campaign.player.status_effects || [];
        this.campaign.player = {
          ...this.campaign.player,
          status_effects: [
            ...statusEffects,
            { type: 'temp_insanity', duration: '1d10 rounds', description: '暂时性疯狂' },
          ],
        };
      }
    }
    return { roll, target, success, narration };
  }

  // ─── 条件评估 ──────────────────────────────────────────

  private evaluateCondition(condition: any): boolean {
    for (const [key, value] of Object.entries(condition)) {
      const campaignValue = this.campaign.global_vars[key];
      if (Array.isArray(value)) {
        const cv = campaignValue as number;
        if (cv < value[0] || cv > value[1]) return false;
      } else if (typeof value === 'boolean') {
        if (!!campaignValue !== value) return false;
      } else if (typeof value === 'number') {
        if ((campaignValue as number) !== value) return false;
      } else if (typeof value === 'string') {
        if ((campaignValue as string) !== value) return false;
      }
    }
    return true;
  }

  private sanitizeNarration(text: string): string {
    if (typeof text !== 'string') return String(text);
    return text
      .replace(/<script\b[^\u003e]*>([\s\S]*?)<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  // ─── Getter ────────────────────────────────────────────

  getUpdatedScene(): Scene {
    return this.currentScene;
  }

  getUpdatedCampaign(): Campaign {
    return this.campaign;
  }
}

export default EventSystem;
