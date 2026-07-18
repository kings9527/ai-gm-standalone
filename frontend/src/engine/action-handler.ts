import { GameStateMachine } from './state-machine';
import { type IntentResult, type GameIntent } from './intent-parser';
import { useSaveStore } from '../stores/saveStore';
import type { LLMClient } from '../llm/client';

/** 设置命令解析结果 */
export interface SettingsCommand {
  /** 操作类型: open=打开面板, adjust=直接调整 */
  action: 'open' | 'adjust';
  /** 目标设置项 */
  target?: 'soundEnabled' | 'fontSize' | 'typewriterSpeed' | 'fullscreen' | 'autoAdvanceDelay' | 'skipUnread' | 'themeMode';
  /** 调整方向或具体值 */
  value?: boolean | number | string;
  /** 调整方向 (用于无具体数值时) */
  direction?: 'increase' | 'decrease' | 'toggle';
  /** 目标 tab */
  tab?: 'llm' | 'image' | 'game' | 'theme';
}

/**
 * 从玩家输入解析设置命令
 * 支持语音指令式输入如："把背景音乐关小"、"字体调大"、"开启全屏"
 */
function parseSettingsCommand(input: string): SettingsCommand {
  const normalized = input.toLowerCase().trim();

  // ── 1. 打开设置面板 ──
  const openPatterns = [
    /打开\s*(?:设置|配置|选项|偏好|面板)/,
    /(?:显示|调出)\s*(?:设置|配置|选项)/,
    /settings?/,
    /options?/,
    /config/,
    /偏好设置/,
    /系统设置/,
  ];
  for (const p of openPatterns) {
    if (p.test(normalized)) {
      // 检查是否同时包含具体调整指令
      const adjustCmd = extractAdjustCommand(normalized);
      if (adjustCmd.target) {
        return { action: 'adjust', ...adjustCmd };
      }
      return { action: 'open' };
    }
  }

  // ── 2. 直接调整指令 ──
  const adjustCmd = extractAdjustCommand(normalized);
  if (adjustCmd.target) {
    return { action: 'adjust', ...adjustCmd };
  }

  // 默认打开面板
  return { action: 'open' };
}

/** 提取调整命令（不含 open 判断） */
function extractAdjustCommand(input: string): Omit<SettingsCommand, 'action'> {
  // ── 音效 / 声音 ──
  if (/\b(?:音效|声音|音乐|背景音乐|bgm|sound|music|volume)\b/.test(input)) {
    if (/\b(?:关|关闭|关掉|禁|停用|mute|off|disable)\b/.test(input)) {
      return { target: 'soundEnabled', value: false, direction: 'toggle' };
    }
    if (/\b(?:开|打开|启用|开启|on|enable)\b/.test(input)) {
      return { target: 'soundEnabled', value: true, direction: 'toggle' };
    }
    // 音量大小调整（数值）
    const volMatch = input.match(/(\d+)\s*%?/);
    if (volMatch) {
      return { target: 'soundEnabled', value: Number(volMatch[1]) > 0, direction: 'toggle' };
    }
    return { target: 'soundEnabled', tab: 'game', direction: 'toggle' };
  }

  // ── 字体大小 ──
  if (/\b(?:字体|字大小|字号|文字大小|font[\s_-]?size)\b/.test(input)) {
    const numMatch = input.match(/(\d+)/);
    if (numMatch) {
      return { target: 'fontSize', value: Math.min(32, Math.max(10, Number(numMatch[1]))), direction: 'toggle' };
    }
    if (/\b(?:大|增大|加大|放大|大一点|up|increase|bigger|larger)\b/.test(input)) {
      return { target: 'fontSize', direction: 'increase' };
    }
    if (/\b(?:小|减小|缩小|放小|小一点|down|decrease|smaller)\b/.test(input)) {
      return { target: 'fontSize', direction: 'decrease' };
    }
    return { target: 'fontSize', tab: 'game', direction: 'toggle' };
  }

  // ── 打字机速度 ──
  if (/\b(?:打字机|显示速度|文本速度|typewriter|text[\s_-]?speed|typing)\b/.test(input)) {
    const numMatch = input.match(/(\d+)/);
    if (numMatch) {
      return { target: 'typewriterSpeed', value: Math.min(500, Math.max(0, Number(numMatch[1]))), direction: 'toggle' };
    }
    if (/\b(?:快|加快|快一点|up|faster|increase)\b/.test(input)) {
      return { target: 'typewriterSpeed', direction: 'decrease' }; // 速度值越小越快
    }
    if (/\b(?:慢|减慢|慢一点|down|slower|decrease)\b/.test(input)) {
      return { target: 'typewriterSpeed', direction: 'increase' }; // 速度值越大越慢
    }
    return { target: 'typewriterSpeed', tab: 'game', direction: 'toggle' };
  }

  // ── 全屏 ──
  if (/\b(?:全屏|fullscreen|full[\s_-]?screen)\b/.test(input)) {
    if (/\b(?:关|关闭|关掉|退出|off|disable|exit)\b/.test(input)) {
      return { target: 'fullscreen', value: false, direction: 'toggle' };
    }
    if (/\b(?:开|打开|启用|开启|on|enable|enter)\b/.test(input)) {
      return { target: 'fullscreen', value: true, direction: 'toggle' };
    }
    return { target: 'fullscreen', direction: 'toggle', tab: 'game' };
  }

  // ── 自动前进 ──
  if (/\b(?:自动|自动前进|auto|auto[\s_-]?advance)\b/.test(input)) {
    if (/\b(?:关|关闭|关掉|禁|停用|off|disable)\b/.test(input)) {
      return { target: 'autoAdvanceDelay', value: 0, direction: 'toggle' };
    }
    const numMatch = input.match(/(\d+)/);
    if (numMatch) {
      return { target: 'autoAdvanceDelay', value: Math.min(10000, Math.max(0, Number(numMatch[1]))), direction: 'toggle' };
    }
    return { target: 'autoAdvanceDelay', direction: 'toggle', tab: 'game' };
  }

  // ── 跳过未读 ──
  if (/\b(?:跳过|skip)\b/.test(input)) {
    if (/\b(?:关|关闭|关掉|禁|停用|off|disable)\b/.test(input)) {
      return { target: 'skipUnread', value: false, direction: 'toggle' };
    }
    if (/\b(?:开|打开|启用|开启|on|enable)\b/.test(input)) {
      return { target: 'skipUnread', value: true, direction: 'toggle' };
    }
    return { target: 'skipUnread', direction: 'toggle', tab: 'game' };
  }

  // ── 主题 / 外观 ──
  if (/\b(?:主题|外观|theme|颜色|color|模式|mode)\b/.test(input)) {
    if (/\b(?:深色|暗色|dark|黑)\b/.test(input)) {
      return { target: 'themeMode', value: 'dark', direction: 'toggle', tab: 'theme' };
    }
    if (/\b(?:浅色|亮色|light|白)\b/.test(input)) {
      return { target: 'themeMode', value: 'light', direction: 'toggle', tab: 'theme' };
    }
    if (/\b(?:跟随系统|自动|auto|system)\b/.test(input)) {
      return { target: 'themeMode', value: 'auto', direction: 'toggle', tab: 'theme' };
    }
    return { target: 'themeMode', direction: 'toggle', tab: 'theme' };
  }

  // ── 画质 / 图片 ──
  if (/\b(?:画质|图像|图片|画质|image|graphic|quality|picture)\b/.test(input)) {
    return { tab: 'image', direction: 'toggle' };
  }

  // ── LLM / AI ──
  if (/\b(?:ai|llm|模型|model|api|密钥|key)\b/.test(input)) {
    return { tab: 'llm', direction: 'toggle' };
  }

  return {};
}

export type ActionMode = GameIntent | 'chat' | 'unknown';

export interface ActionDispatchResult {
  /** 行动模式 */
  mode: ActionMode;
  /** 是否已由 action-handler 完全处理（无需再走 LLM 或 stateMachine 默认流程） */
  handled: boolean;
  /** 给玩家的反馈文本 */
  narration?: string;
  /** 设置命令解析结果（Phase 2-E: 自然语言设置触发） */
  settingsCommand?: SettingsCommand;

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
        return this._handleSettings(playerInput, extractedParams);
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
    // Phase 2-B: 战斗前显示 LLM 生成的战斗开场描述
    let combatNarration = '';
    const target = (params.target as string) || (params.enemy as string) || '敌人';

    if (this.llmClient?.isAvailable()) {
      try {
        const weapon = (params.weapon as string) || '';
        const enemyType = (params.enemyType as string) || target;
        const sceneName = this.stateMachine.module?.scenes[this.stateMachine.campaign?.current_scene || '']?.title || '此处';

        const prompt = `你是一位TRPG游戏的AI-GM。玩家刚刚决定进入战斗。
场景：${sceneName}
玩家行动：${input}
目标敌人：${enemyType}
${weapon ? `玩家武器：${weapon}` : ''}

请生成一段简短、紧张、沉浸式的战斗开场描述（2-3句话）。描述氛围、敌人的姿态、以及战斗一触即发的紧张感。不要输出任何系统提示或格式标记，只输出纯描述文本。`;

        const response = await this.llmClient.chat(
          [
            { role: 'system', content: '你是AI-GM，负责生成战斗开场描述。只输出描述文本，不要加引号或格式标记。' },
            { role: 'user', content: prompt },
          ],
          { maxTokens: 128, temperature: 0.8 }
        );
        combatNarration = response.content?.trim() || '';
      } catch {
        // LLM 失败时回退到默认描述
        combatNarration = '';
      }
    }

    // 调用 stateMachine 的战斗初始化逻辑，复用现有 combat 系统
    const result = await this.stateMachine.handleCombatInitiation({ target }, input);

    if (result.type === 'combat_start') {
      // Phase 2-B: 优先使用 LLM 生成的战斗开场描述，回退到 stateMachine 返回的 narration
      const finalNarration = combatNarration || result.narration || `你拔出武器，准备与 ${target} 战斗！`;

      return {
        mode: 'combat',
        handled: true,
        narration: finalNarration,
        combatStart: {
          enemies: result.enemies as string[],
          target: result.target as string,
          narration: finalNarration,
        },
        extractedParams: params,
      };
    }

    // 场景不支持战斗：返回提示文本
    return {
      mode: 'combat',
      handled: true,
      narration: combatNarration || result.narration || '这里没有敌人。你的攻击只是打在了空气里。',
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

  private _handleSettings(
    input: string,
    params: Record<string, unknown>
  ): ActionDispatchResult {
    // Phase 2-E: 解析自然语言设置命令
    const cmd = parseSettingsCommand(input);

    // 构建反馈文案
    let narration = '【系统】正在打开设置面板...';
    if (cmd.action === 'adjust' && cmd.target) {
      const targetNames: Record<string, string> = {
        soundEnabled: '音效',
        fontSize: '字体大小',
        typewriterSpeed: '打字机速度',
        fullscreen: '全屏模式',
        autoAdvanceDelay: '自动前进延迟',
        skipUnread: '跳过未读文本',
        themeMode: '主题模式',
      };
      const name = targetNames[cmd.target] || cmd.target;
      if (cmd.value !== undefined && typeof cmd.value === 'boolean') {
        narration = `【系统】已${cmd.value ? '开启' : '关闭'}${name}。`;
      } else if (cmd.direction === 'increase') {
        narration = `【系统】已增大${name}。`;
      } else if (cmd.direction === 'decrease') {
        narration = `【系统】已减小${name}。`;
      } else if (cmd.value !== undefined) {
        narration = `【系统】已将${name}调整为 ${cmd.value}。`;
      } else {
        narration = `【系统】正在调整${name}...`;
      }
    }

    return {
      mode: 'settings',
      handled: true,
      narration,
      uiAction: 'settings',
      settingsCommand: cmd,
      extractedParams: { ...params, settingsCommand: cmd },
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
