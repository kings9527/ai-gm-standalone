import { GameStateMachine } from './state-machine';
import { type IntentResult, type GameIntent } from './intent-parser';

export type ActionMode = GameIntent | 'chat' | 'unknown';

export interface ActionDispatchResult {
  /** 行动模式 */
  mode: ActionMode;
  /** 是否已由 action-handler 完全处理（无需再走 LLM 或 stateMachine 默认流程） */
  handled: boolean;
  /** 给玩家的反馈文本 */
  narration?: string;
  /** 需要触发的 UI 操作 */
  uiAction?: 'save' | 'settings';
  /** 战斗启动数据（用于外部触发 CombatOverlay） */
  combatStart?: {
    enemies: string[];
    target: string;
    narration: string;
  };
  /** 场景切换数据 */
  sceneChange?: {
    to: string;
    narration: string;
  };
  /** 事件触发数据 */
  eventTrigger?: {
    eventId: string;
    narration: string;
  };
  /** 提取的参数 */
  extractedParams: Record<string, unknown>;
}

/**
 * ActionHandler
 * Phase 1-E: 行动模式实现
 *
 * 当意图解析为高置信度（>=0.6）非 'chat' 意图时，触发对应系统：
 * - combat   → 进入战斗状态机
 * - event    → 推进剧情事件
 * - save     → 触发存档面板
 * - settings → 打开设置面板
 * - explore  → 场景探索
 *
 * 与现有 GameStateMachine 无缝衔接，不破坏已有状态流转。
 */
export class ActionHandler {
  private stateMachine: GameStateMachine;

  constructor(stateMachine: GameStateMachine) {
    this.stateMachine = stateMachine;
  }

  /**
   * 分发处理玩家意图
   * @param intentResult 意图解析结果
   * @param playerInput  原始玩家输入
   * @returns ActionDispatchResult
   */
  async dispatch(intentResult: IntentResult, playerInput: string): Promise<ActionDispatchResult> {
    const { intent, confidence, extractedParams } = intentResult;

    // 低置信度或 chat 意图：不处理，由上层走 LLM 闲聊
    if (confidence < 0.6 || intent === 'chat') {
      return { mode: 'chat', handled: false, extractedParams };
    }

    switch (intent) {
      case 'combat':
        return this._handleCombat(playerInput, extractedParams);
      case 'event':
        return this._handleEvent(playerInput, extractedParams);
      case 'save':
        return this._handleSave(extractedParams);
      case 'settings':
        return this._handleSettings(extractedParams);
      case 'explore':
        return this._handleExplore(playerInput, extractedParams);
      default:
        return { mode: intent as ActionMode, handled: false, extractedParams };
    }
  }

  // ─── Combat ─────────────────────────────────────────────

  private async _handleCombat(
    input: string,
    params: Record<string, unknown>
  ): Promise<ActionDispatchResult> {
    // 调用 stateMachine 的战斗初始化逻辑，复用现有 combat 系统
    const result = await this.stateMachine.handleCombatInitiation({ target: params.target }, input);

    if (result.type === 'combat_start') {
      return {
        mode: 'combat',
        handled: true,
        narration: result.narration,
        combatStart: {
          enemies: result.enemies as string[],
          target: result.target as string,
          narration: result.narration as string,
        },
        extractedParams: params,
      };
    }

    // 场景不支持战斗：返回提示文本，仍标记为已处理
    return {
      mode: 'combat',
      handled: true,
      narration: result.narration || '这里没有敌人。你的攻击只是打在了空气里。',
      extractedParams: params,
    };
  }

  // ─── Event ──────────────────────────────────────────────

  private async _handleEvent(
    input: string,
    params: Record<string, unknown>
  ): Promise<ActionDispatchResult> {
    // 解析为 stateMachine 内部意图格式，复用事件检查逻辑
    const intent = await this.stateMachine.parseIntent(input, 'event');
    const eventResult = this.stateMachine.checkSceneEvents(intent);

    if (eventResult) {
      return {
        mode: 'event',
        handled: true,
        narration: eventResult.narration,
        eventTrigger: {
          eventId: (eventResult as any).event_id as string,
          narration: eventResult.narration as string,
        },
        extractedParams: params,
      };
    }

    // 没有触发事件：给出反馈，并标记为未处理，允许上层回退到 stateMachine 默认交互
    return {
      mode: 'event',
      handled: false,
      narration: '当前场景没有可触发的事件。',
      extractedParams: params,
    };
  }

  // ─── Save ───────────────────────────────────────────────

  private _handleSave(params: Record<string, unknown>): ActionDispatchResult {
    return {
      mode: 'save',
      handled: true,
      narration: '【系统】正在打开存档面板...',
      uiAction: 'save',
      extractedParams: params,
    };
  }

  // ─── Settings ───────────────────────────────────────────

  private _handleSettings(params: Record<string, unknown>): ActionDispatchResult {
    return {
      mode: 'settings',
      handled: true,
      narration: '【系统】正在打开设置面板...',
      uiAction: 'settings',
      extractedParams: params,
    };
  }

  // ─── Explore ────────────────────────────────────────────

  private async _handleExplore(
    input: string,
    params: Record<string, unknown>
  ): Promise<ActionDispatchResult> {
    const direction = (params.direction as string) || input;

    // 复用 stateMachine 的出口匹配逻辑
    const matchedExit = this.stateMachine.findMatchingExit(direction, input);

    if (matchedExit) {
      // 不直接调用 transitionTo，避免 stateMachine.campaign 与 gameStore 重复更新
      // 目标场景由 VN 引擎通过 restoreSnapshot → currentSceneId 变更加载
      return {
        mode: 'explore',
        handled: true,
        narration: `你前往${matchedExit.label || matchedExit.target}...`,
        sceneChange: {
          to: matchedExit.target,
          narration: `你前往${matchedExit.label || matchedExit.target}...`,
        },
        extractedParams: params,
      };
    }

    return {
      mode: 'explore',
      handled: true,
      narration: '你想去那个方向，但似乎没有路。',
      extractedParams: params,
    };
  }
}

export default ActionHandler;
