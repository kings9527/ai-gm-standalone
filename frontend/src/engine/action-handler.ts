import { GameStateMachine } from './state-machine';
import { type IntentResult, type GameIntent } from './intent-parser';
import { useSaveStore } from '../stores/saveStore';
import type { LLMClient } from '../llm/client';

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
  private llmClient: LLMClient | null;

  constructor(stateMachine: GameStateMachine, llmClient?: LLMClient) {
    this.stateMachine = stateMachine;
    this.llmClient = llmClient || null;
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
        return this._handleSave(playerInput, extractedParams);
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

  private async _handleSave(
    playerInput: string,
    params: Record<string, unknown>
  ): Promise<ActionDispatchResult> {
    const campaign = this.stateMachine.campaign;
    const module = this.stateMachine.module;

    if (!campaign || !module) {
      return {
        mode: 'save',
        handled: true,
        narration: '【系统】无法存档：游戏状态未就绪。',
        extractedParams: params,
      };
    }

    // Phase 2-D: 使用 LLM 生成存档点描述
    let saveDescription = '';
    if (this.llmClient?.isAvailable()) {
      try {
        const sceneName = module.scenes[campaign.current_scene]?.title || campaign.current_scene;
        const descResponse = await this.llmClient.chat(
          [
            {
              role: 'system',
              content:
                '你是AI-GM，负责为玩家的存档生成简短、沉浸式的描述（1-2句话）。描述当前场景和状态，让玩家一看就能回忆这个存档点。只输出描述文本，不要加引号或其他格式。',
            },
            {
              role: 'user',
              content: `玩家正在"${sceneName}"场景，输入了"${playerInput}"。请为这个存档点生成一段简短描述。`,
            },
          ],
          { maxTokens: 64, temperature: 0.7 }
        );
        saveDescription = descResponse.content?.trim() || '';
      } catch (err) {
        // LLM 失败时回退到默认描述
        saveDescription = '';
      }
    }

    const saveStore = useSaveStore.getState();
    const saves = saveStore.saves;

    // Phase 2-D: 支持覆盖存档和新建存档
    const normalizedInput = playerInput.toLowerCase();
    const isOverride =
      normalizedInput.includes('覆盖') || params.override === true || normalizedInput.includes('替换');
    const targetSlot = typeof params.slotNumber === 'number' ? params.slotNumber : undefined;

    let slotNumber: number;
    if (targetSlot !== undefined) {
      slotNumber = targetSlot;
    } else if (isOverride) {
      // 找第一个已有存档的槽位（排除快速存档槽 0）
      const existingSlot = saves.find((s) => s.slotNumber > 0 && s.save !== null);
      slotNumber = existingSlot?.slotNumber ?? 1;
    } else {
      // 找第一个空槽位（排除快速存档槽 0）
      const emptySlot = saves.find((s) => s.slotNumber > 0 && s.save === null);
      if (emptySlot) {
        slotNumber = emptySlot.slotNumber;
      } else {
        // 全满，覆盖最早的存档（槽 1）
        slotNumber = 1;
      }
    }

    const existingSave = saves.find((s) => s.slotNumber === slotNumber)?.save;
    const isOverwrite = !!existingSave;

    // 生成存档名称（优先使用 LLM 描述）
    const sceneName = module.scenes[campaign.current_scene]?.title || campaign.current_scene;
    const slotName =
      saveDescription || `${sceneName} - ${new Date().toLocaleString('zh-CN')}`;

    try {
      // Phase 2-D: 直接调用 saveStore.createSave 执行存档
      // thumbnail 和 vnSnapshot 继承已有存档或为空，后续可由 PlayPage 获取最新状态补充
      await saveStore.createSave({
        slotNumber,
        name: slotName,
        campaign,
        module,
        thumbnail: existingSave?.thumbnail || undefined,
        vnSnapshot: existingSave?.vnSnapshot || undefined,
      });

      const actionDesc = isOverwrite ? '覆盖存档' : '新建存档';
      return {
        mode: 'save',
        handled: true,
        narration: `【系统】${actionDesc} #${slotNumber}：${slotName}`,
        extractedParams: { ...params, slotNumber, isOverwrite },
      };
    } catch (err: any) {
      return {
        mode: 'save',
        handled: true,
        narration: `【系统】存档失败：${err.message || '未知错误'}`,
        extractedParams: params,
      };
    }
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
