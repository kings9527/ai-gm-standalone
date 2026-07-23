/**
 * Rule Engine (ported from old project, Phase 2-A extended)
 * Supports multiple TTRPG systems via JSON configuration.
 * Phase 2-A: 自然语言规则判定引擎 — 条件表达式支持自然语言描述输入，
 * 动作执行支持自然语言参数传递，与 IntentParser 输出格式对接。
 */

import type { IntentResult } from './intent-parser';
import type { Campaign, Module } from '../types/module';

// ───────────────────────────────────────────────────────────
// 类型定义（Phase 2-A 新增）
// ───────────────────────────────────────────────────────────

/** 条件操作符 */
export type ConditionOperator =
  | 'equals' | 'eq'           // 相等
  | 'notEquals' | 'neq'       // 不等
  | 'contains'                // 文本包含（如 player.said contains '战斗'）
  | 'startsWith'              // 文本开头匹配
  | 'endsWith'                // 文本结尾匹配
  | 'regex'                   // 正则匹配
  | 'gt' | 'gte'              // 大于 / 大于等于
  | 'lt' | 'lte'              // 小于 / 小于等于
  | 'in'                      // 在数组/列表中
  | 'exists'                  // 存在（非 null/undefined/空）
  | 'notExists'               // 不存在
  | 'and' | 'or' | 'not';     // 逻辑组合

/** 自然语言条件表达式 */
export interface NLCondition {
  /** 条件路径或自然语言描述（如 'player.said contains "战斗"'） */
  description?: string;
  /** 结构化条件（优先级高于 description） */
  path?: string;              // 对象路径，如 'player.stats.STR', 'extracted.target', 'campaign.global_vars.key'
  operator?: ConditionOperator;
  value?: unknown;            // 对比值
  /** 逻辑组合子条件 */
  conditions?: NLCondition[];
  /** 条件是否为必须（默认 true） */
  required?: boolean;
}

/** 动作类型 */
export type ActionType =
  | 'set_var'          // 设置变量
  | 'add_var'          // 增减变量（数值）
  | 'trigger_event'    // 触发事件
  | 'change_scene'     // 切换场景
  | 'start_combat'     // 启动战斗
  | 'narrate'          // 叙事输出
  | 'dice_check'       // 骰子检定
  | 'update_npc'       // 更新NPC状态
  | 'give_item'        // 给予物品
  | 'remove_item'      // 移除物品
  | 'apply_effect'     // 应用效果
  | 'log'              // 日志记录（调试用）
  | 'custom';           // 自定义（由外部处理器处理）

/** 自然语言动作参数 — 支持模板插值 {{path}} 和自然语言值 */
export type NLActionParam = string | number | boolean | null | Record<string, unknown>;

/** 自然语言动作 */
export interface NLAction {
  /** 动作类型 */
  type: ActionType;
  /** 动作描述（自然语言，可选） */
  description?: string;
  /** 动作参数 — 支持 {{path}} 模板引用上下文变量 */
  params?: Record<string, NLActionParam>;
  /** 动作执行条件（可选，只有条件满足时才执行） */
  condition?: NLCondition;
  /** 延迟执行（毫秒，可选） */
  delay?: number;
  /** 是否为高优先级动作（优先执行） */
  priority?: number;
}

/** 完整规则定义 */
export interface GameRule {
  /** 规则ID */
  id: string;
  /** 规则名称/描述 */
  name?: string;
  /** 触发条件 — 任一条件满足即触发（OR 逻辑），或全部满足（AND 逻辑，由 conditions 的嵌套控制） */
  conditions: NLCondition[];
  /** 执行动作（按顺序执行） */
  actions: NLAction[];
  /** 规则是否启用 */
  enabled?: boolean;
  /** 是否一次性规则（执行后禁用） */
  once?: boolean;
  /** 优先级（数字越大越优先） */
  priority?: number;
  /** 标签（用于分类和筛选） */
  tags?: string[];
  /** 规则来源（如 'module', 'system', 'custom'） */
  source?: string;
}

/** 规则执行上下文 — 包含游戏状态、玩家输入、IntentParser 提取的参数 */
export interface RuleContext {
  /** 当前游戏战役状态 */
  campaign: Campaign;
  /** 当前模组 */
  module: Module;
  /** 玩家原始输入 */
  playerInput?: string;
  /** IntentParser 提取的参数（Phase 2-A 核心对接点） */
  extractedParams?: Record<string, unknown>;
  /** 额外上下文变量（可由规则动态注入） */
  vars?: Record<string, unknown>;
  /** 当前场景ID */
  currentSceneId?: string;
  /** 时间戳 */
  timestamp?: number;
}

/** 规则执行结果 */
export interface RuleExecutionResult {
  /** 规则ID */
  ruleId: string;
  /** 是否匹配并执行 */
  matched: boolean;
  /** 执行的动作结果 */
  actionResults: ActionResult[];
  /** 叙事文本（多个 narrate 动作合并） */
  narration?: string;
  /** 是否消耗了规则（once=true 时） */
  consumed?: boolean;
  /** 执行耗时（ms） */
  executionTime?: number;
}

/** 单个动作执行结果 */
export interface ActionResult {
  /** 动作类型 */
  actionType: ActionType;
  /** 是否成功执行 */
  success: boolean;
  /** 执行后的值/输出 */
  output?: unknown;
  /** 错误信息 */
  error?: string;
  /** 解析后的参数（模板插值后的实际值） */
  resolvedParams?: Record<string, unknown>;
}

/** 规则引擎配置 */
export interface RuleEngineConfig {
  /** 默认规则系统 */
  defaultSystem?: string;
  /** 是否启用规则缓存 */
  enableCache?: boolean;
  /** 最大缓存规则数 */
  maxCacheSize?: number;
  /** 是否启用调试日志 */
  debug?: boolean;
  /** 自定义动作处理器（用于 custom 类型动作） */
  customActionHandlers?: Record<string, (action: NLAction, ctx: RuleContext) => ActionResult | Promise<ActionResult>>;
}

// ───────────────────────────────────────────────────────────
// 原有 RuleSystem 类型（保留向后兼容）
// ───────────────────────────────────────────────────────────

export interface RuleSystem {
  name: string;
  dice: string;
  attributes: string[];
  check: Record<string, unknown>;
  damage?: Record<string, unknown>;
  sanity?: Record<string, unknown>;
}

// ───────────────────────────────────────────────────────────
// 自然语言路径解析器（Phase 2-A 核心）
// ───────────────────────────────────────────────────────────

/**
 * 路径解析器：从点分路径中读取值
 * 支持路径：player.stats.STR, campaign.global_vars.key, extracted.target, vars.temp
 */
class PathResolver {
  /**
   * 解析路径并从上下文中取值
   * @param path 点分路径，如 'player.stats.STR', 'extracted.target'
   * @param ctx 规则上下文
   * @returns 解析后的值，路径不存在时返回 undefined
   */
  static resolve(path: string, ctx: RuleContext): unknown {
    if (!path || typeof path !== 'string') return undefined;

    const parts = path.split('.');
    if (parts.length === 0) return undefined;

    // 第一层：确定根对象
    const rootKey = parts[0];
    let current: unknown;

    switch (rootKey) {
      case 'player':
        current = ctx.campaign?.player;
        break;
      case 'campaign':
        // campaign.global_vars.xxx → 读取 campaign.global_vars
        if (parts[1] === 'global_vars' && parts.length > 2) {
          current = ctx.campaign?.global_vars;
          parts.splice(0, 2); // 移除 'campaign' 和 'global_vars'，保留后续 key
        } else {
          current = ctx.campaign;
        }
        break;
      case 'module':
        current = ctx.module;
        break;
      case 'extracted':
        // 直接对接 IntentParser 的 extractedParams
        current = ctx.extractedParams;
        break;
      case 'vars':
        current = ctx.vars;
        break;
      case 'input':
      case 'playerInput':
        return ctx.playerInput;
      case 'scene':
      case 'currentScene':
        current = ctx.currentSceneId ? ctx.module?.scenes?.[ctx.currentSceneId] : undefined;
        break;
      default:
        // 尝试从 vars 中查找，如果不存在则返回 undefined
        current = ctx.vars?.[rootKey] ?? ctx.campaign?.global_vars?.[rootKey];
        break;
    }

    // 如果已经处理过 campaign.global_vars，parts[0] 现在是第一个实际 key
    const startIdx = rootKey === 'campaign' && parts[0] === 'global_vars' ? 0 : 1;

    for (let i = startIdx; i < parts.length; i++) {
      if (current === null || current === undefined) return undefined;
      const key = parts[i];
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * 设置路径值
   */
  static set(path: string, value: unknown, ctx: RuleContext): boolean {
    if (!path || typeof path !== 'string') return false;

    const parts = path.split('.');
    if (parts.length === 0) return false;

    const rootKey = parts[0];
    let target: Record<string, unknown>;

    switch (rootKey) {
      case 'campaign':
        if (parts[1] === 'global_vars') {
          target = ctx.campaign.global_vars;
          parts.splice(0, 2);
        } else {
          target = ctx.campaign as unknown as Record<string, unknown>;
        }
        break;
      case 'vars':
        target = ctx.vars || (ctx.vars = {});
        break;
      case 'player':
        target = ctx.campaign.player as unknown as Record<string, unknown>;
        break;
      default:
        target = ctx.vars || (ctx.vars = {});
        break;
    }

    const startIdx = rootKey === 'campaign' && parts[0] === 'global_vars' ? 0 : 1;

    // 遍历中间节点
    for (let i = startIdx; i < parts.length - 1; i++) {
      const key = parts[i];
      if (target[key] === undefined || target[key] === null) {
        target[key] = {};
      }
      target = target[key] as Record<string, unknown>;
    }

    const finalKey = parts[parts.length - 1];
    target[finalKey] = value;
    return true;
  }
}

// ───────────────────────────────────────────────────────────
// 条件求值引擎（Phase 2-A 核心）
// ───────────────────────────────────────────────────────────

class ConditionEvaluator {
  /**
   * 从自然语言描述中解析条件
   * 支持格式："player.said contains '战斗'", "player.stats.STR >= 50", "extracted.target exists"
   */
  static parseDescription(desc: string): NLCondition | null {
    if (!desc || typeof desc !== 'string') return null;

    const normalized = desc.trim();
    if (!normalized) return null;

    // 匹配模式：path operator value
    // 支持的操作符（按优先级排序，长的先匹配）
    const operators: Array<{ op: ConditionOperator; pattern: RegExp }> = [
      { op: 'contains', pattern: /^(.*?)\\contains\\(.+)$/i },
      { op: 'startsWith', pattern: /^(.*?)\\startsWith\\(.+)$/i },
      { op: 'endsWith', pattern: /^(.*?)\\endsWith\\(.+)$/i },
      { op: 'regex', pattern: /^(.*?)\\regex\\(.+)$/i },
      { op: 'gte', pattern: /^(.*?)\\>=\\(.+)$/ },
      { op: 'lte', pattern: /^(.*?)\\<=\\(.+)$/ },
      { op: 'gt', pattern: /^(.*?)\\>\\(.+)$/ },
      { op: 'lt', pattern: /^(.*?)\\<\\(.+)$/ },
      { op: 'neq', pattern: /^(.*?)\\!=\\(.+)$/ },
      { op: 'eq', pattern: /^(.*?)\\==\\(.+)$/ },
      { op: 'eq', pattern: /^(.*?)\\=\\(.+)$/ },
      { op: 'in', pattern: /^(.*?)\\in\\(.+)$/i },
      { op: 'exists', pattern: /^(.*?)\\exists$/i },
      { op: 'notExists', pattern: /^(.*?)\\notExists$/i },
    ];

    for (const { op, pattern } of operators) {
      const match = normalized.match(pattern);
      if (match) {
        const path = match[1].trim();
        let value: unknown = match[2] ? match[2].trim() : undefined;

        // 尝试解析值类型
        if (value !== undefined) {
          // 去除引号
          if (typeof value === 'string') {
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            } else {
              // 尝试数字解析
              const num = Number(value);
              if (!Number.isNaN(num)) value = num;
              // 布尔值
              else if (value === 'true') value = true;
              else if (value === 'false') value = false;
              // 数组解析 [a, b, c]
              else if (value.startsWith('[') && value.endsWith(']')) {
                try {
                  value = JSON.parse(value);
                  if (!Array.isArray(value)) {
                    value = String(value);
                  }
                } catch (err) {
                  console.error('[RuleEngine] Failed to parse array value:', err);
                  // 保持字符串
                }
              }
            }
          }
        }

        return {
          path,
          operator: op,
          value: value === undefined ? undefined : value,
        };
      }
    }

    // 无法解析时，尝试作为简单的 truthy 检查
    return { path: normalized, operator: 'exists' };
  }

  /**
   * 求值单个条件
   */
  static evaluate(condition: NLCondition, ctx: RuleContext): boolean {
    // 如果提供了 description，先解析为结构化条件
    if (condition.description && !condition.path) {
      const parsed = this.parseDescription(condition.description);
      if (parsed) {
        condition = { ...condition, ...parsed };
      } else {
        return false; // 解析失败
      }
    }

    // 逻辑组合条件
    if (condition.operator === 'and' || condition.conditions) {
      const subConditions = condition.conditions || [];
      if (condition.operator === 'or') {
        return subConditions.some((c) => this.evaluate(c, ctx));
      }
      // 默认 and
      return subConditions.every((c) => this.evaluate(c, ctx));
    }

    if (condition.operator === 'not') {
      const subConditions = condition.conditions || [];
      return !subConditions.every((c) => this.evaluate(c, ctx));
    }

    // 路径取值
    const actualValue = condition.path ? PathResolver.resolve(condition.path, ctx) : undefined;
    const expectedValue = condition.value;

    switch (condition.operator) {
      case 'eq':
      case 'equals':
        return actualValue === expectedValue;
      case 'neq':
      case 'notEquals':
        return actualValue !== expectedValue;
      case 'contains':
        if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
          return actualValue.includes(expectedValue);
        }
        if (Array.isArray(actualValue)) {
          return actualValue.some((v) => v === expectedValue ||
            (typeof v === 'string' && typeof expectedValue === 'string' && v.includes(expectedValue)));
        }
        return false;
      case 'startsWith':
        return typeof actualValue === 'string' && typeof expectedValue === 'string' &&
          actualValue.startsWith(expectedValue);
      case 'endsWith':
        return typeof actualValue === 'string' && typeof expectedValue === 'string' &&
          actualValue.endsWith(expectedValue);
      case 'regex':
        if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
          try {
            return new RegExp(expectedValue, 'i').test(actualValue);
          } catch {
            return false;
          }
        }
        return false;
      case 'gt':
        return typeof actualValue === 'number' && typeof expectedValue === 'number' && actualValue > expectedValue;
      case 'gte':
        return typeof actualValue === 'number' && typeof expectedValue === 'number' && actualValue >= expectedValue;
      case 'lt':
        return typeof actualValue === 'number' && typeof expectedValue === 'number' && actualValue < expectedValue;
      case 'lte':
        return typeof actualValue === 'number' && typeof expectedValue === 'number' && actualValue <= expectedValue;
      case 'in':
        if (Array.isArray(expectedValue)) {
          return expectedValue.includes(actualValue);
        }
        if (typeof expectedValue === 'string' && typeof actualValue === 'string') {
          return expectedValue.includes(actualValue);
        }
        return false;
      case 'exists':
        return actualValue !== undefined && actualValue !== null &&
          !(typeof actualValue === 'string' && actualValue.length === 0);
      case 'notExists':
        return actualValue === undefined || actualValue === null ||
          (typeof actualValue === 'string' && actualValue.length === 0);
      default:
        // 无操作符时，默认 truthy 检查
        return !!actualValue;
    }
  }

  /**
   * 批量求值条件数组（默认 AND 逻辑）
   */
  static evaluateAll(conditions: NLCondition[], ctx: RuleContext): boolean {
    if (!conditions || conditions.length === 0) return true; // 无条件即永远匹配
    return conditions.every((c) => this.evaluate(c, ctx));
  }
}

// ───────────────────────────────────────────────────────────
// 模板插值引擎（Phase 2-A 核心）
// ───────────────────────────────────────────────────────────

class TemplateInterpolator {
  private static readonly TEMPLATE_REGEX = /\{\{\s*([\w.]+)\s*\}\}/g;

  /**
   * 插值字符串中的 {{path}} 模板
   * 支持路径：player.name, extracted.target, campaign.global_vars.key, vars.xxx
   */
  static interpolate(text: string, ctx: RuleContext): string {
    if (!text || typeof text !== 'string') return String(text ?? '');

    return text.replace(this.TEMPLATE_REGEX, (_match, path) => {
      const value = PathResolver.resolve(path.trim(), ctx);
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  /**
   * 递归插值任意值中的模板
   */
  static interpolateValue(value: unknown, ctx: RuleContext): unknown {
    if (typeof value === 'string') {
      return this.interpolate(value, ctx);
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.interpolateValue(v, ctx));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = this.interpolateValue(v, ctx);
      }
      return result;
    }
    return value;
  }

  /**
   * 解析参数中的模板，返回实际值
   */
  static resolveParams(params: Record<string, NLActionParam> | undefined, ctx: RuleContext): Record<string, unknown> {
    if (!params) return {};
    return this.interpolateValue(params, ctx) as Record<string, unknown>;
  }
}

// ───────────────────────────────────────────────────────────
// 自然语言规则引擎（Phase 2-A 核心新增类）
// ───────────────────────────────────────────────────────────

export class NaturalRuleEngine {
  private rules: GameRule[];
  private config: Required<RuleEngineConfig>;
  private ruleCache: Map<string, RuleExecutionResult>;
  private executedOnceRules: Set<string>;

  constructor(rules: GameRule[] = [], config: RuleEngineConfig = {}) {
    this.rules = [...rules];
    this.config = {
      defaultSystem: config.defaultSystem ?? 'coc',
      enableCache: config.enableCache ?? true,
      maxCacheSize: config.maxCacheSize ?? 100,
      debug: config.debug ?? false,
      customActionHandlers: config.customActionHandlers ?? {},
    };
    this.ruleCache = new Map();
    this.executedOnceRules = new Set();
  }

  /**
   * 添加规则
   */
  addRule(rule: GameRule): void {
    this.rules.push(rule);
    this._sortRules();
  }

  /**
   * 移除规则
   */
  removeRule(ruleId: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === ruleId);
    if (idx >= 0) {
      this.rules.splice(idx, 1);
      this.ruleCache.delete(ruleId);
      this.executedOnceRules.delete(ruleId);
      return true;
    }
    return false;
  }

  /**
   * 更新规则
   */
  updateRule(ruleId: string, updates: Partial<GameRule>): boolean {
    const idx = this.rules.findIndex((r) => r.id === ruleId);
    if (idx >= 0) {
      this.rules[idx] = { ...this.rules[idx], ...updates };
      this.ruleCache.delete(ruleId);
      return true;
    }
    return false;
  }

  /**
   * 批量加载规则（如从模组 JSON 中加载）
   */
  loadRules(rules: GameRule[]): void {
    this.rules = [...rules];
    this._sortRules();
    this.ruleCache.clear();
    this.executedOnceRules.clear();
  }

  /**
   * 获取所有规则（可筛选）
   */
  getRules(filter?: { tag?: string; enabled?: boolean; source?: string }): GameRule[] {
    let result = [...this.rules];
    if (filter?.tag) {
      result = result.filter((r) => r.tags?.includes(filter.tag as string));
    }
    if (filter?.enabled !== undefined) {
      result = result.filter((r) => (r.enabled ?? true) === filter.enabled);
    }
    if (filter?.source) {
      result = result.filter((r) => r.source === filter.source);
    }
    return result;
  }

  /**
   * 核心方法：评估规则并执行动作
   * 与 IntentParser 输出格式直接对接
   */
  async evaluate(ctx: RuleContext): Promise<RuleExecutionResult[]> {
    const startTime = Date.now();
    const results: RuleExecutionResult[] = [];

    // 按优先级排序（高优先先执行）
    const activeRules = this.rules.filter((r) => this._isRuleActive(r));

    for (const rule of activeRules) {
      const ruleStart = Date.now();
      const conditionMet = ConditionEvaluator.evaluateAll(rule.conditions, ctx);

      if (conditionMet) {
        const actionResults = await this._executeActions(rule.actions, ctx);
        const narration = actionResults
          .filter((ar) => ar.actionType === 'narrate' && ar.success && ar.output)
          .map((ar) => ar.output as string)
          .join('\n\n');

        const result: RuleExecutionResult = {
          ruleId: rule.id,
          matched: true,
          actionResults,
          narration: narration || undefined,
          executionTime: Date.now() - ruleStart,
        };

        // 一次性规则标记
        if (rule.once) {
          this.executedOnceRules.add(rule.id);
          result.consumed = true;
        }

        results.push(result);

        // 缓存结果
        if (this.config.enableCache) {
          this._cacheResult(rule.id, result);
        }

        this._log(`Rule matched: ${rule.id} (${rule.name || 'unnamed'})`);
      }
    }

    this._log(`Evaluated ${activeRules.length} rules in ${Date.now() - startTime}ms, matched ${results.length}`);
    return results;

  }

  /**
   * 快捷方法：传入 IntentResult 自动构建上下文并评估
   * 这是与 IntentParser 的主要对接入口
   */
  async evaluateWithIntent(
    campaign: Campaign,
    module: Module,
    playerInput: string,
    intentResult: IntentResult,
    extraVars?: Record<string, unknown>
  ): Promise<RuleExecutionResult[]> {
    const ctx: RuleContext = {
      campaign,
      module,
      playerInput,
      extractedParams: intentResult.extractedParams,
      vars: { ...extraVars },
      currentSceneId: campaign.current_scene,
      timestamp: Date.now(),
    };

    return this.evaluate(ctx);
  }

  /**
   * 检查是否有规则匹配（不执行动作）
   */
  checkMatch(ctx: RuleContext): Array<{ ruleId: string; name?: string; matched: boolean }> {
    return this.rules
      .filter((r) => this._isRuleActive(r))
      .map((r) => ({
        ruleId: r.id,
        name: r.name,
        matched: ConditionEvaluator.evaluateAll(r.conditions, ctx),
      }));
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.ruleCache.clear();
  }

  /**
   * 重置一次性规则（允许重新执行）
   */
  resetOnceRules(): void {
    this.executedOnceRules.clear();
  }

  // ─── 私有方法 ───────────────────────────────────────────

  private _isRuleActive(rule: GameRule): boolean {
    if ((rule.enabled ?? true) === false) return false;
    if (rule.once && this.executedOnceRules.has(rule.id)) return false;
    return true;
  }

  private _sortRules(): void {
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  private _cacheResult(ruleId: string, result: RuleExecutionResult): void {
    if (this.ruleCache.size >= this.config.maxCacheSize) {
      const firstKey = this.ruleCache.keys().next().value;
      if (firstKey) this.ruleCache.delete(firstKey);
    }
    this.ruleCache.set(ruleId, result);
  }

  private _log(...args: unknown[]): void {
    if (this.config.debug) {
      void args;
    }
  }

  /**
   * 执行动作列表
   */
  private async _executeActions(actions: NLAction[], ctx: RuleContext): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    // 按优先级排序
    const sortedActions = [...actions].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const action of sortedActions) {
      // 检查动作前置条件
      if (action.condition && !ConditionEvaluator.evaluate(action.condition, ctx)) {
        results.push({
          actionType: action.type,
          success: false,
          error: 'Action condition not met',
        });
        continue;
      }

      // 延迟执行
      if (action.delay && action.delay > 0) {
        await this._delay(action.delay);
      }

      const result = await this._executeSingleAction(action, ctx);
      results.push(result);
    }

    return results;
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 执行单个动作
   */
  private async _executeSingleAction(action: NLAction, ctx: RuleContext): Promise<ActionResult> {
    const resolvedParams = TemplateInterpolator.resolveParams(action.params, ctx);

    try {
      switch (action.type) {
        case 'set_var':
          return this._actionSetVar(resolvedParams, ctx);
        case 'add_var':
          return this._actionAddVar(resolvedParams, ctx);
        case 'trigger_event':
          return this._actionTriggerEvent(resolvedParams, ctx);
        case 'change_scene':
          return this._actionChangeScene(resolvedParams, ctx);
        case 'start_combat':
          return this._actionStartCombat(resolvedParams, ctx);
        case 'narrate':
          return this._actionNarrate(resolvedParams, ctx);
        case 'dice_check':
          return this._actionDiceCheck(resolvedParams, ctx);
        case 'update_npc':
          return this._actionUpdateNPC(resolvedParams, ctx);
        case 'give_item':
          return this._actionGiveItem(resolvedParams, ctx);
        case 'remove_item':
          return this._actionRemoveItem(resolvedParams, ctx);
        case 'apply_effect':
          return this._actionApplyEffect(resolvedParams, ctx);
        case 'log':
          return this._actionLog(resolvedParams, ctx);
        case 'custom':
          return await this._actionCustom(action, resolvedParams, ctx);
        default:
          return {
            actionType: action.type,
            success: false,
            error: `Unknown action type: ${action.type}`,
            resolvedParams,
          };
      }
    } catch (err: any) {
      this._log('Action execution error:', err);
      return {
        actionType: action.type,
        success: false,
        error: err?.message || String(err),
        resolvedParams,
      };
    }
  }

  // ─── 各动作具体实现 ─────────────────────────────────────

  private _actionSetVar(params: Record<string, unknown>, ctx: RuleContext): ActionResult {
    const path = params.path as string;
    const value = params.value;

    if (!path) {
      return { actionType: 'set_var', success: false, error: 'Missing path param', resolvedParams: params };
    }

    PathResolver.set(path, value, ctx);
    return { actionType: 'set_var', success: true, output: value, resolvedParams: params };
  }

  private _actionAddVar(params: Record<string, unknown>, ctx: RuleContext): ActionResult {
    const path = params.path as string;
    const delta = Number(params.value ?? 0);

    if (!path) {
      return { actionType: 'add_var', success: false, error: 'Missing path param', resolvedParams: params };
    }

    const current = Number(PathResolver.resolve(path, ctx) ?? 0);
    const newValue = current + delta;
    PathResolver.set(path, newValue, ctx);

    return { actionType: 'add_var', success: true, output: newValue, resolvedParams: params };
  }

  private _actionTriggerEvent(params: Record<string, unknown>, ctx: RuleContext): ActionResult {
    const eventId = params.eventId as string;
    if (!eventId) {
      return { actionType: 'trigger_event', success: false, error: 'Missing eventId', resolvedParams: params };
    }

    const eventKey = `event_triggered:${eventId}`;
    ctx.campaign.global_vars[eventKey] = true;

    return { actionType: 'trigger_event', success: true, output: eventId, resolvedParams: params };
  }

  private _actionChangeScene(params: Record<string, unknown>, ctx: RuleContext): ActionResult {
    const sceneId = params.sceneId as string;
    if (!sceneId || !ctx.module.scenes?.[sceneId]) {
      return { actionType: 'change_scene', success: false, error: `Scene not found: ${sceneId}`, resolvedParams: params };
    }

    ctx.campaign.scene_history.push(sceneId);
    ctx.campaign.current_scene = sceneId;

    return { actionType: 'change_scene', success: true, output: sceneId, resolvedParams: params };
  }

  private _actionStartCombat(params: Record<string, unknown>, ctx: RuleContext): ActionResult {
    const enemies = (params.enemies as string[]) || [];
    const sceneId = ctx.currentSceneId;
    const scene = sceneId ? ctx.module.scenes?.[sceneId] : null;

    // 如果没有指定敌人，使用当前场景的敌人
    const actualEnemies = enemies.length > 0 ? enemies : (scene?.combat?.enemies || []);

    if (actualEnemies.length === 0) {
      return { actionType: 'start_combat', success: false, error: 'No enemies available', resolvedParams: params };
    }

    ctx.campaign.combat_state = {
      active: true,
      current_turn: 'player',
      turn_order: ['player', ...actualEnemies],
      round: 1,
      enemies: actualEnemies.reduce((acc, e) => {
        const npc = ctx.module.npcs?.[e];
        acc[e] = { hp: npc?.hp || 10, max_hp: npc?.hp || 10 };
        return acc;
      }, {} as Record<string, { hp: number; max_hp: number }>),
    };

    return { actionType: 'start_combat', success: true, output: actualEnemies, resolvedParams: params };
  }

  private _actionNarrate(params: Record<string, unknown>, ctx: RuleContext): ActionResult {
    const text = params.text as string;
    if (!text) {
      return { actionType: 'narrate', success: false, error: 'Missing text param', resolvedParams: params };
    }

    return { actionType: 'narrate', success: true, output: text, resolvedParams: params };
  }

  private _actionDiceCheck(params: Record<string, unknown>, ctx: RuleContext): ActionResult {
    const skill = params.skill as string;
    const target = Number(params.target ?? 50);
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= target;

    const result = {
      skill,
      roll,
      target,
      success,
      critical: roll <= 5,
      fumble: roll >= 96,
    };

    return { actionType: 'dice_check', success: true, output: result, resolvedParams: params };
  }

  private _actionUpdateNPC(params: Record<string, unknown>, ctx: RuleContext): ActionResult {
    const npcId = params.npcId as string;
    const updates = params.updates as Record<string, unknown>;

    if (!npcId || !ctx.campaign.npcs_state?.[npcId]) {
      return { actionType: 'update_npc', success: false, error: `NPC not found: ${npcId}`, resolvedParams: params };
    }

    const npcState = ctx.campaign.npcs_state[npcId];
    for (const [key, value] of Object.entries(updates || {})) {
      (npcState as unknown as Record<string, unknown>)[key] = value;
    }

    return { actionType: 'update_npc', success: true, output: npcState, resolvedParams: params };
  }

  private _actionGiveItem(params: Record<string, unknown>, ctx: RuleContext): ActionResult {
    const itemId = params.itemId as string;
    const inventory = ctx.campaign.player.inventory || (ctx.campaign.player.inventory = []);

    if (!inventory.includes(itemId)) {
      inventory.push(itemId);
    }

    return { actionType: 'give_item', success: true, output: itemId, resolvedParams: params };
  }

  private _actionRemoveItem(params: Record<string, unknown>, ctx: RuleContext): ActionResult {
    const itemId = params.itemId as string;
    const inventory = ctx.campaign.player.inventory || [];
    const idx = inventory.indexOf(itemId);

    if (idx >= 0) {
      inventory.splice(idx, 1);
    }

    return { actionType: 'remove_item', success: true, output: itemId, resolvedParams: params };
  }

  private _actionApplyEffect(params: Record<string, unknown>, ctx: RuleContext): ActionResult {
    const effect = params.effect as Record<string, unknown>;
    const target = params.target as string;

    if (!effect || !target) {
      return { actionType: 'apply_effect', success: false, error: 'Missing effect or target param', resolvedParams: params };
    }

    // 应用到目标对象
    const targetObj = PathResolver.resolve(target, ctx);
    if (targetObj && typeof targetObj === 'object') {
      for (const [key, value] of Object.entries(effect)) {
        (targetObj as Record<string, unknown>)[key] = value;
      }
    }

    return { actionType: 'apply_effect', success: true, output: effect, resolvedParams: params };
  }

  private _actionLog(params: Record<string, unknown>, _ctx: RuleContext): ActionResult {
    const message = params.message as string;
    void message;
    return { actionType: 'log', success: true, output: message, resolvedParams: params };
  }

  private async _actionCustom(
    action: NLAction,
    resolvedParams: Record<string, unknown>,
    ctx: RuleContext
  ): Promise<ActionResult> {
    const handlerName = action.params?.handler as string;
    const handler = handlerName ? this.config.customActionHandlers[handlerName] : undefined;

    if (!handler) {
      return {
        actionType: 'custom',
        success: false,
        error: `Custom handler not found: ${handlerName || 'undefined'}`,
        resolvedParams,
      };
    }

    return await handler(action, ctx);
  }
}

// ───────────────────────────────────────────────────────────
// 原有 RuleEngine 类（保留向后兼容，新增 evaluateCondition 委托）
// ───────────────────────────────────────────────────────────

export class RuleEngine {
  system: string;
  rules: RuleSystem;

  /** Phase 2-A 新增：自然语言规则引擎实例 */
  private nlEngine: NaturalRuleEngine | null = null;

  constructor(system = 'coc') {
    this.system = system;
    this.rules = this.loadSystemRules(system);
  }

  private loadSystemRules(system: string): RuleSystem {
    const systems: Record<string, RuleSystem> = {
      coc: {
        name: 'Call of Cthulhu 7th Edition',
        dice: 'd100',
        attributes: ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU', 'LUCK'],
        check: {
          type: 'd100_vs_skill',
          success: 'roll <= target',
          hard_success: 'roll <= target / 2',
          extreme_success: 'roll <= target / 5',
          critical: 'roll <= 5',
          fumble: 'roll >= 96',
        },
        damage: {
          formula: 'db + weapon_damage',
          db_table: {
            'STR+SIZ': [
              { max: 64, db: '-2', build: -2 },
              { max: 84, db: '-1', build: -1 },
              { max: 124, db: '0', build: 0 },
              { max: 164, db: '+1d4', build: 1 },
              { max: 204, db: '+1d6', build: 2 },
              { max: 999, db: '+2d6', build: 3 },
            ],
          },
        },
        sanity: {
          start: 'POW',
          loss_formula: '1d6/1d20',
          indefinite: 'SAN <= 0',
          temp_insanity: 'SAN loss >= 5 in one encounter',
        },
      },
      dnd5e: {
        name: 'D&D 5th Edition',
        dice: 'd20',
        attributes: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'],
        check: {
          type: 'd20_vs_dc',
          success: 'roll + modifier >= dc',
          critical_success: 'natural_roll == 20',
          critical_fail: 'natural_roll == 1',
        },
        damage: {
          formula: 'weapon_dice + ability_modifier',
        },
      },
    };
    return systems[system] || systems.coc;
  }

  // ─── Phase 2-A 新增：自然语言规则引擎集成方法 ──────────────

  /**
   * 初始化/获取自然语言规则引擎
   */
  initNLEngine(rules: GameRule[] = [], config?: RuleEngineConfig): NaturalRuleEngine {
    this.nlEngine = new NaturalRuleEngine(rules, config);
    return this.nlEngine;
  }

  /**
   * 获取自然语言规则引擎实例
   */
  getNLEngine(): NaturalRuleEngine | null {
    return this.nlEngine;
  }

  /**
   * 使用自然语言规则引擎评估条件（与 IntentParser 对接）
   * 这是 evaluateCondition 的自然语言升级版本
   */
  async evaluateNLConditions(
    campaign: Campaign,
    module: Module,
    playerInput: string,
    intentResult: IntentResult,
    extraRules?: GameRule[]
  ): Promise<RuleExecutionResult[]> {
    if (!this.nlEngine) {
      this.nlEngine = new NaturalRuleEngine();
    }
    if (extraRules) {
      extraRules.forEach((r) => this.nlEngine!.addRule(r));
    }

    return this.nlEngine.evaluateWithIntent(campaign, module, playerInput, intentResult);
  }

  /**
   * 从自然语言条件对象中解析并求值（兼容旧版 Condition 格式）
   */
  evaluateCondition(condition: any, ctx?: RuleContext): boolean {
    // 如果传入的是旧版简单条件（如 { key: value }），使用旧逻辑
    if (condition && !condition.conditions && !condition.path && !condition.description) {
      return this._legacyEvaluateCondition(condition, ctx);
    }

    // 转换为 NLCondition 并使用新引擎求值
    if (ctx) {
      const nlCondition = condition as NLCondition;
      return ConditionEvaluator.evaluate(nlCondition, ctx);
    }

    return false;
  }

  /**
   * 从文本描述创建条件（快捷方法）
   * 示例: ruleEngine.createCondition('player.said contains "战斗"')
   */
  createCondition(description: string): NLCondition {
    return ConditionEvaluator.parseDescription(description) || { description };
  }

  /**
   * 从文本描述创建规则（快捷方法）
   * 示例:
   *   ruleEngine.createRule('combat-trigger', [
   *     'player.said contains "战斗"',
   *     'extracted.intent equals "combat"'
   *   ], [
   *     { type: 'narrate', params: { text: '战斗开始！你面对 {{extracted.target}}。' } },
   *     { type: 'start_combat', params: { enemies: ['{{extracted.target}}'] } }
   *   ])
   */
  createRule(
    id: string,
    conditionDescriptions: string[],
    actions: NLAction[],
    options?: { name?: string; once?: boolean; priority?: number; tags?: string[] }
  ): GameRule {
    return {
      id,
      name: options?.name || id,
      conditions: conditionDescriptions.map((desc) => this.createCondition(desc)),
      actions,
      once: options?.once ?? false,
      priority: options?.priority ?? 0,
      tags: options?.tags,
      enabled: true,
    };
  }

  // ─── 原有方法（保持不变）──────────────────────────────────

  check(skill: string, skillValue: number, roll: number) {
    const system = this.rules;
    if (system.name.includes('Cthulhu')) {
      return this.cocCheck(skill, skillValue, roll);
    }
    return this.genericCheck(skill, skillValue, roll);
  }

  cocCheck(skill: string, skillValue: number, roll: number) {
    const target = skillValue;
    const success = roll <= target;
    const hard = roll <= Math.floor(target / 2);
    const extreme = roll <= Math.floor(target / 5);
    const critical = roll <= 5;
    const fumble = roll >= 96;

    if (fumble) return { result: 'fumble', roll, target };
    if (critical) return { result: 'critical', roll, target };
    if (extreme) return { result: 'extreme', roll, target };
    if (hard) return { result: 'hard', roll, target };
    if (success) return { result: 'success', roll, target };
    return { result: 'fail', roll, target };
  }

  genericCheck(skill: string, skillValue: number, roll: number) {
    return {
      result: roll <= skillValue ? 'success' : 'fail',
      roll,
      target: skillValue,
    };
  }

  calculateDamageBonus(stats: Record<string, number> | null) {
    if (!stats) return { total: 0, formula: '' };

    const str = stats.STR || 50;
    const siz = stats.SIZ || 50;
    const sum = str + siz;

    if (sum <= 64) return { total: -2, formula: 'DB: -2 (STR+SIZ ≤ 64)' };
    if (sum <= 84) return { total: -1, formula: 'DB: -1 (STR+SIZ 65-84)' };
    if (sum <= 124) return { total: 0, formula: 'DB: 0 (STR+SIZ 85-124)' };
    if (sum <= 164) {
      const roll = Math.floor(Math.random() * 4) + 1;
      return { total: roll, formula: `DB: +1d4=${roll} (STR+SIZ 125-164)` };
    }
    if (sum <= 204) {
      const roll = Math.floor(Math.random() * 6) + 1;
      return { total: roll, formula: `DB: +1d6=${roll} (STR+SIZ 165-204)` };
    }
    const roll = Math.floor(Math.random() * 6) + 1 + (Math.floor(Math.random() * 6) + 1);
    return { total: roll, formula: `DB: +2d6=${roll} (STR+SIZ ≥ 205)` };
  }

  calculateSanityLoss(amount: string, currentSanity: number) {
    const loss = this.parseDiceExpression(amount);
    const newSanity = Math.max(0, currentSanity - loss);
    return { loss, newSanity, insane: newSanity <= 0 };
  }

  parseDiceExpression(expression: string | number): number {
    if (typeof expression === 'number') return expression;
    const match = expression.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/);
    if (!match) return 0;
    const count = parseInt(match[1]);
    const sides = parseInt(match[2]);
    const mod = match[4] ? (match[3] === '+' ? 1 : -1) * parseInt(match[4]) : 0;
    let total = mod;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
  }

  getMaxDiceRoll(expression: string | number): number {
    if (typeof expression === 'number') return expression;
    const match = String(expression).match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/);
    if (!match) return 0;
    const count = parseInt(match[1]);
    const sides = parseInt(match[2]);
    const mod = match[4] ? (match[3] === '+' ? 1 : -1) * parseInt(match[4]) : 0;
    return count * sides + mod;
  }

  // ─── 私有方法 ───────────────────────────────────────────

  private _legacyEvaluateCondition(condition: any, ctx?: RuleContext): boolean {
    // 如果提供了上下文，优先使用上下文中的 campaign 数据
    const globalVars = ctx?.campaign?.global_vars || {};

    for (const [key, value] of Object.entries(condition)) {
      const campaignValue = globalVars[key];
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
}

export default RuleEngine;
