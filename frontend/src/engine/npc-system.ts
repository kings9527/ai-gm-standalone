import type {
  NPC,
  NPCState,
  NPCMemoryEntry,
  DialogueTree,
  DialogueTreeNode,
  DialogueBranch,
  DialogueCondition,
  DynamicResponseConfig,
  InitiativeTrigger,
  ResponseTemplate,
  Campaign,
  Module,
  NPCDialogueHistoryEntry,
} from '../types/module';
import type { LLMClient } from '../llm/client';
import { NPCDecisionEngine, type NPCDecision } from './npc-decision';

/**
 * NPCDialogueSystem
 * Phase 2-F: NPC 自由对话系统
 *
 * 功能：
 * ① 解析对话树，根据玩家输入匹配分支
 * ② 基于 personality 和动态响应模板生成 NPC 回应
 * ③ 支持 NPC 主动发起对话（触发器系统）
 * ④ 与 NPCDecisionEngine 协同，优先处理对话类交互
 */

export interface NPCDialogueResult {
  /** NPC 回复文本 */
  text: string;
  /** 情绪标签 */
  emotion: string;
  /** 下一个节点 ID（对话树模式下） */
  nextNodeId?: string | null;
  /** 是否结束对话 */
  endDialogue: boolean;
  /** 效果列表（信任、恐惧等变化） */
  effects?: { type: string; value: number }[];
  /** 触发的动作 */
  action?: { type: string; payload?: any };
  /** 是否使用 LLM 增强 */
  llmEnhanced?: boolean;
}

export interface NPCInitiativeResult {
  /** 是否有 NPC 主动发起对话 */
  triggered: boolean;
  /** 发起对话的 NPC ID */
  npcId?: string;
  /** 对话文本 */
  text?: string;
  /** 情绪 */
  emotion?: string;
  /** 触发器 ID */
  triggerId?: string;
}

export class NPCDialogueSystem {
  private campaign: Campaign;
  private module: Module;
  /** 当前激活的对话树状态：npcId -> 当前节点 ID */
  private activeDialogues: Map<string, string> = new Map();
  /** 已触发的一次性触发器 */
  private triggeredOnce: Set<string> = new Set();
  /** Phase 3-D: 完整对话历史 — npcId -> 历史记录 */
  private npcDialogueHistory: Record<string, NPCDialogueHistoryEntry[]>;
  /** Phase 3-D: 历史变更回调，供外部同步到 store */
  private onHistoryUpdate?: (history: Record<string, NPCDialogueHistoryEntry[]>) => void;

  constructor(
    campaign: Campaign,
    moduleData: Module,
    options?: {
      npcDialogueHistory?: Record<string, NPCDialogueHistoryEntry[]>;
      onHistoryUpdate?: (history: Record<string, NPCDialogueHistoryEntry[]>) => void;
    },
  ) {
    this.campaign = campaign;
    this.module = moduleData;
    this.npcDialogueHistory = options?.npcDialogueHistory ?? {};
    this.onHistoryUpdate = options?.onHistoryUpdate;
  }

  // ═══════════════════════════════════════════
  // 核心 API：处理玩家对 NPC 的输入
  // ═══════════════════════════════════════════

  /**
   * 处理玩家输入，判断是否有 NPC 可以回应。
   * 返回 null 表示没有 NPC 匹配，应回退到 AI-GM 叙事模式。
   */
  async processPlayerInput(
    playerInput: string,
    sceneId: string,
    llmClient?: LLMClient | null,
  ): Promise<{ npcId: string; result: NPCDialogueResult } | null> {
    const scene = this.module.scenes[sceneId];
    if (!scene?.npcs?.length) return null;

    // 1. 检查玩家输入是否明确指向某个 NPC（通过名字匹配）
    const targetNpc = this._findTargetNPC(playerInput, scene.npcs);
    if (targetNpc) {
      const result = await this._generateNPCResponse(targetNpc, playerInput, sceneId, llmClient);
      // Phase 3-B: 记录玩家与该 NPC 的互动记忆
      const impact = this._calculateInteractionImpact(result, playerInput);
      this.recordMemory(
        targetNpc.id,
        this._categorizePlayerInput(playerInput),
        `玩家说："${playerInput}" → ${targetNpc.name} 回应："${result.text.substring(0, 100)}"`,
        impact,
        sceneId,
      );
      // Phase 3-D: 记录完整对话历史（跨场景记忆）
      this._recordDialogueHistory(targetNpc.id, sceneId, playerInput, result.text, result.emotion);
      return { npcId: targetNpc.id, result };
    }

    // 2. 检查场景中的 NPC 是否有对话树可以匹配（不指定 NPC 时，按优先级尝试）
    for (const npcId of scene.npcs) {
      const npc = this.module.npcs?.[npcId];
      if (!npc) continue;

      // 如果该 NPC 已有激活的对话树，优先继续
      if (this.activeDialogues.has(npcId)) {
        const result = await this._evaluateDialogueTree(npc, playerInput, llmClient);
        const impact = this._calculateInteractionImpact(result, playerInput);
        this.recordMemory(
          npcId,
          this._categorizePlayerInput(playerInput),
          `玩家说："${playerInput}" → ${npc.name} 回应`,
          impact,
          sceneId,
        );
        // Phase 3-D: 记录完整对话历史
        this._recordDialogueHistory(npcId, sceneId, playerInput, result.text, result.emotion);
        return { npcId, result };
      }
    }

    // 3. 尝试所有 NPC 的动态响应（无明确目标时，匹配第一个 personality 合适的）
    for (const npcId of scene.npcs) {
      const npc = this.module.npcs?.[npcId];
      if (!npc?.dynamic_response) continue;

      const result = this._evaluateDynamicResponse(npc, playerInput);
      if (result) {
        const impact = this._calculateInteractionImpact(result, playerInput);
        this.recordMemory(
          npcId,
          this._categorizePlayerInput(playerInput),
          `玩家说："${playerInput}" → ${npc.name} 回应`,
          impact,
          sceneId,
        );
        // Phase 3-D: 记录完整对话历史
        this._recordDialogueHistory(npcId, sceneId, playerInput, result.text, result.emotion);
        return { npcId, result };
      }
    }

    return null;
  }

  /**
   * 检查场景中的 NPC 是否有主动发起对话的意愿。
   * 在场景切换或关键事件后调用。
   */
  checkNPCInitiative(sceneId: string): NPCInitiativeResult {
    const scene = this.module.scenes[sceneId];
    if (!scene?.npcs?.length) return { triggered: false };

    const candidates: { npcId: string; trigger: InitiativeTrigger; score: number }[] = [];

    for (const npcId of scene.npcs) {
      const npc = this.module.npcs?.[npcId];
      if (!npc?.dynamic_response?.initiative_triggers) continue;

      const npcState = this._getNPCState(npcId);

      for (const trigger of npc.dynamic_response.initiative_triggers) {
        // 检查场景匹配
        if (trigger.scene_id !== 'any' && trigger.scene_id !== sceneId) continue;

        // 检查一次性触发器是否已触发
        if (trigger.once_only && this.triggeredOnce.has(trigger.id)) continue;

        // 检查条件（简化版：解析条件字符串中的关键词）
        const score = this._evaluateInitiativeCondition(trigger.condition, npc, npcState, sceneId);
        if (score > 0) {
          candidates.push({ npcId, trigger, score: score + trigger.priority * 10 });
        }
      }
    }

    if (candidates.length === 0) return { triggered: false };

    // 按分数排序，取最高
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best) return { triggered: false };

    if (best.trigger.once_only) {
      this.triggeredOnce.add(best.trigger.id);
    }

    return {
      triggered: true,
      npcId: best.npcId,
      text: best.trigger.dialogue,
      emotion: best.trigger.emotion,
      triggerId: best.trigger.id,
    };
  }

  /**
   * Phase 3-D: 获取当前完整对话历史（供外部同步到 store / 存档）。
   */
  getHistory(): Record<string, NPCDialogueHistoryEntry[]> {
    return this.npcDialogueHistory;
  }

  /**
   * Phase 3-D: 设置外部传入的对话历史（读档后恢复）。
   */
  setHistory(history: Record<string, NPCDialogueHistoryEntry[]>): void {
    this.npcDialogueHistory = history;
  }

  /**
   * Phase 3-D: 记录玩家与 NPC 的完整对话历史（跨场景记忆）。
   */
  private _recordDialogueHistory(
    npcId: string,
    sceneId: string,
    playerInput: string,
    npcResponse: string,
    emotion?: string,
  ): void {
    const turn = this.campaign.turn || 1;
    const entries: NPCDialogueHistoryEntry[] = [
      { turn, sceneId, role: 'player', text: playerInput, timestamp: Date.now() },
      { turn, sceneId, role: 'npc', text: npcResponse, timestamp: Date.now(), emotion },
    ];

    const existing = this.npcDialogueHistory[npcId] || [];
    // 限制每个 NPC 最多保留 50 条完整对话记录（避免存档膨胀）
    const merged = [...existing, ...entries].slice(-50);
    this.npcDialogueHistory = { ...this.npcDialogueHistory, [npcId]: merged };
    this.onHistoryUpdate?.(this.npcDialogueHistory);
  }

  /**
   * 结束与特定 NPC 的对话，重置对话树状态。
   */
  endDialogue(npcId: string) {
    this.activeDialogues.delete(npcId);
  }

  /**
   * 重置所有对话状态（读档/新游戏时调用）。
   */
  resetAllDialogues() {
    this.activeDialogues.clear();
    this.triggeredOnce.clear();
  }

  // ═══════════════════════════════════════════
  // 内部方法：对话树评估
  // ═══════════════════════════════════════════

  private async _evaluateDialogueTree(
    npc: NPC,
    playerInput: string,
    llmClient?: LLMClient | null,
  ): Promise<NPCDialogueResult> {
    const tree = npc.dialogue_tree;
    if (!tree) {
      return this._fallbackResponse(npc, playerInput);
    }

    const npcId = npc.id;
    const currentNodeId = this.activeDialogues.get(npcId) || tree.root_node;
    const currentNode = tree.nodes[currentNodeId];

    if (!currentNode) {
      this.activeDialogues.delete(npcId);
      return this._fallbackResponse(npc, playerInput);
    }

    // 评估分支匹配
    let matchedBranch: DialogueBranch | null = null;

    if (currentNode.branches) {
      for (const branch of currentNode.branches) {
        if (this._matchBranch(playerInput, branch)) {
          matchedBranch = branch;
          break;
        }
      }
    }

    // 无匹配分支 — 尝试 LLM 增强回退
    if (!matchedBranch) {
      if (llmClient?.isAvailable()) {
        try {
          const llmResult = await this._llmDialogueFallback(npc, playerInput, currentNode, llmClient);
          if (llmResult) return llmResult;
        } catch (e) { /* no-op */ }
      }

      // 使用对话树 fallback 或默认回复
      return {
        text: tree.fallback_text || '【' + npc.name + ' 没有回应】',
        emotion: npc.dynamic_response?.default_emotion || 'neutral',
        endDialogue: true,
      };
    }

    // 有匹配分支 — 计算效果和下一个节点
    const effects = matchedBranch.effects || [];
    const nextNodeId = matchedBranch.next_node;

    // 如果有下一个节点，更新对话状态
    if (nextNodeId && tree.nodes[nextNodeId]) {
      const nextNode = tree.nodes[nextNodeId];

      // 检查下一节点条件
      if (nextNode.condition && !this._checkCondition(nextNode.condition, npc)) {
        // 条件不满足，停留在当前节点但给出条件提示
        return {
          text: this._interpolateTemplate(
            matchedBranch.response_text || currentNode.text,
            npc,
            playerInput,
          ),
          emotion: npc.dynamic_response?.default_emotion || 'neutral',
          endDialogue: false,
          effects: effects.map((e) => ({ type: e.type, value: e.value })),
        };
      }

      this.activeDialogues.set(npcId, nextNodeId);

      return {
        text: this._interpolateTemplate(
          matchedBranch.response_text || nextNode.text,
          npc,
          playerInput,
        ),
        emotion: npc.dynamic_response?.default_emotion || 'neutral',
        nextNodeId,
        endDialogue: false,
        effects: effects.map((e) => ({ type: e.type, value: e.value })),
      };
    }

    // 分支无 next_node — 结束对话
    this.activeDialogues.delete(npcId);

    return {
      text: this._interpolateTemplate(
        matchedBranch.response_text || currentNode.text,
        npc,
        playerInput,
      ),
      emotion: npc.dynamic_response?.default_emotion || 'neutral',
      endDialogue: true,
      effects: effects.map((e) => ({ type: e.type, value: e.value })),
    };
  }

  // ═══════════════════════════════════════════
  // 内部方法：动态响应评估
  // ═══════════════════════════════════════════

  private _evaluateDynamicResponse(npc: NPC, playerInput: string): NPCDialogueResult | null {
    const config = npc.dynamic_response;
    if (!config?.response_templates?.length) return null;

    const lowerInput = playerInput.toLowerCase();

    // 按匹配度排序模板
    const matches: { template: ResponseTemplate; score: number }[] = [];

    for (const template of config.response_templates) {
      let score = 0;

      // 关键词匹配
      if (template.keywords) {
        for (const kw of template.keywords) {
          if (lowerInput.includes(kw.toLowerCase())) score += 2;
        }
      }

      // 意图匹配（简化：检查输入中是否包含意图相关词汇）
      for (const intent of template.intent_match) {
        const intentKeywords: Record<string, string[]> = {
          greet: ['你好', 'hello', 'hi', '再见', 'bye'],
          question: ['什么', '为什么', '怎么', '哪里', '谁', '多少', '?'],
          threat: ['威胁', '杀', '死', '攻击', '小心'],
          help: ['帮助', '救', '救我', 'help', 'save'],
          explore: ['看', '调查', '检查', 'search', 'explore'],
          combat: ['战斗', '攻击', '打', 'fight', 'attack'],
          flee: ['跑', '逃', '离开', 'flee', 'escape'],
          talk: ['说', '聊', '告诉', 'talk', 'speak'],
        };
        const kws = intentKeywords[intent] || [intent];
        for (const kw of kws) {
          if (lowerInput.includes(kw)) score += 1;
        }
      }

      if (score > 0) {
        matches.push({ template, score });
      }
    }

    if (matches.length === 0) return null;

    // 取最高分的模板
    matches.sort((a, b) => b.score - a.score);
    const bestMatch = matches[0];
    if (!bestMatch) return null;
    const best = bestMatch.template;
    if (!best || !best.templates || best.templates.length === 0) return null;
    const template = best.templates[Math.floor(Math.random() * best.templates.length)];

    const effects: { type: string; value: number }[] = [];
    if (best.trust_delta) effects.push({ type: 'trust_delta', value: best.trust_delta });
    if (best.fear_delta) effects.push({ type: 'fear_delta', value: best.fear_delta });

    return {
      text: this._interpolateTemplate(template, npc, playerInput),
      emotion: best.emotion,
      endDialogue: false,
      effects,
    };
  }

  // ═══════════════════════════════════════════
  // 内部方法：LLM 增强对话
  // ═══════════════════════════════════════════

  private async _llmDialogueFallback(
    npc: NPC,
    playerInput: string,
    currentNode: DialogueTreeNode,
    llmClient: LLMClient,
  ): Promise<NPCDialogueResult | null> {
    if (!llmClient.isAvailable()) return null;

    const npcState = this._getNPCState(npc.id);

    // Phase 3-D: 构建历史上下文 messages — 将过往对话以角色格式注入 LLM
    const historyEntries = (this.npcDialogueHistory[npc.id] || []).slice(-10);
    const historyMessages: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const entry of historyEntries) {
      if (entry.role === 'player') {
        historyMessages.push({ role: 'user', content: entry.text });
      } else {
        historyMessages.push({ role: 'assistant', content: entry.text });
      }
    }

    const systemPrompt = `你是 ${npc.name}，一个${npc.description}。
` +
      `性格：${npc.personality || '未设定'}
` +
      `当前态度：${npcState.attitude}，信任：${npcState.trust}，恐惧：${npcState.fear}
` +
      `${historyEntries.length > 0 ? `你们之前的对话记录：\n${historyEntries.map((e) => `[${e.sceneId}] ${e.role === 'player' ? '玩家' : npc.name}：${e.text}`).join('\n')}\n` : ''}` +
      `你必须以 JSON 格式回复，只包含 { "text": "你的台词", "emotion": "情绪标签" }`;

    const userPrompt = `玩家对你说："${playerInput}"\n` +
      `当前对话上下文：${currentNode.text}\n` +
      `请用 1-2 句话回应，保持角色一致性。`;

    try {
      const response = await llmClient.chat(
        [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.7, maxTokens: 256 },
      );

      let parsed: any = null;
      try {
        const raw = response.content.trim();
        const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
        const jsonText = jsonMatch ? jsonMatch[1].trim() : raw;
        parsed = JSON.parse(jsonText);
      } catch (e) {
        return null;
      }

      if (!parsed?.text) return null;

      return {
        text: parsed.text,
        emotion: parsed.emotion || 'neutral',
        endDialogue: false,
        llmEnhanced: true,
      };
    } catch (e) {
      return null;
    }
  }

  // ═══════════════════════════════════════════
  // 内部方法：辅助工具
  // ═══════════════════════════════════════════

  private _findTargetNPC(playerInput: string, sceneNpcIds: string[]): NPC | null {
    const lower = playerInput.toLowerCase();

    for (const npcId of sceneNpcIds) {
      const npc = this.module.npcs?.[npcId];
      if (!npc) continue;

      // 匹配 NPC 名字（中文和英文）
      const names = [npc.name, npc.id];
      if (npc.name.includes('·')) {
        names.push(...npc.name.split('·'));
      }

      for (const name of names) {
        if (lower.includes(name.toLowerCase())) {
          return npc;
        }
      }
    }

    return null;
  }

  private async _generateNPCResponse(
    npc: NPC,
    playerInput: string,
    sceneId: string,
    llmClient?: LLMClient | null,
  ): Promise<NPCDialogueResult> {
    // 优先使用对话树
    if (npc.dialogue_tree) {
      return this._evaluateDialogueTree(npc, playerInput, llmClient);
    }

    // 次优先使用动态响应
    const dynamicResult = this._evaluateDynamicResponse(npc, playerInput);
    if (dynamicResult) return dynamicResult;

    // 回退到默认模板
    return this._fallbackResponse(npc, playerInput);
  }

  private _fallbackResponse(npc: NPC, playerInput: string): NPCDialogueResult {
    const npcState = this._getNPCState(npc.id);
    const attitude = npcState.attitude;

    const fallbackMap: Record<string, string[]> = {
      friendly: ['“你来了，我正好有话想对你说。”', '【' + npc.name + ' 微笑着看向你】'],
      hostile: ['“……别靠近我。”', '【' + npc.name + ' 冷冷地盯着你】'],
      afraid: ['“别……别伤害我……”', '【' + npc.name + ' 后退了一步】'],
      neutral: ['“有什么事吗？”', '【' + npc.name + ' 看着你】'],
    };

    const texts = fallbackMap[attitude] || fallbackMap['neutral'];
    const text = texts[Math.floor(Math.random() * texts.length)];

    return {
      text: this._interpolateTemplate(text, npc, playerInput),
      emotion: attitude === 'friendly' ? 'friendly' : attitude === 'hostile' ? 'hostile' : 'neutral',
      endDialogue: false,
    };
  }

  private _matchBranch(playerInput: string, branch: DialogueBranch): boolean {
    const lower = playerInput.toLowerCase();

    switch (branch.match_type) {
      case 'keywords':
        if (!branch.keywords?.length) return false;
        return branch.keywords.some((kw) => lower.includes(kw.toLowerCase()));
      case 'regex':
        if (!branch.pattern) return false;
        try {
          return new RegExp(branch.pattern, 'i').test(playerInput);
        } catch {
          return false;
        }
      case 'any':
        return true;
      case 'choice':
        // 选项模式在自由输入中不直接匹配
        return false;
      default:
        return false;
    }
  }

  private _checkCondition(condition: DialogueCondition, npc: NPC): boolean {
    const npcState = this._getNPCState(npc.id);

    if (condition.min_trust !== undefined && npcState.trust < condition.min_trust) {
      return false;
    }
    if (condition.max_fear !== undefined && npcState.fear > condition.max_fear) {
      return false;
    }
    if (condition.attitude && npcState.attitude !== condition.attitude) {
      return false;
    }
    if (condition.flags) {
      for (const flag of condition.flags) {
        if (!this.campaign.flags[flag]) return false;
      }
    }
    if (condition.secrets_revealed) {
      for (const secret of condition.secrets_revealed) {
        if (!npcState.secrets_revealed.includes(secret)) return false;
      }
    }

    return true;
  }

  private _evaluateInitiativeCondition(
    condition: string,
    npc: NPC,
    npcState: NPCState,
    sceneId: string,
  ): number {
    const lower = condition.toLowerCase();
    let score = 0;

    // 信任度相关
    if (lower.includes('trust')) {
      if (lower.includes('high') && npcState.trust > 60) score += 3;
      if (lower.includes('low') && npcState.trust < 30) score += 3;
      if (lower.includes('medium') && npcState.trust >= 30 && npcState.trust <= 60) score += 2;
    }

    // 恐惧度相关
    if (lower.includes('fear')) {
      if (lower.includes('high') && npcState.fear > 60) score += 3;
      if (lower.includes('low') && npcState.fear < 30) score += 2;
    }

    // 态度相关
    if (lower.includes('attitude')) {
      const attitudeMatch = lower.match(/attitude\s+is\s+(\w+)/);
      if (attitudeMatch && npcState.attitude === attitudeMatch[1]) score += 4;
    }

    // 战斗状态
    if (lower.includes('combat') && this.campaign.combat_state?.active) score += 3;
    if (lower.includes('not combat') && !this.campaign.combat_state?.active) score += 2;

    // 场景相关
    if (lower.includes('scene') && lower.includes(sceneId.toLowerCase())) score += 2;

    // 玩家状态
    if (lower.includes('player hp low')) {
      const playerHpRatio = (this.campaign.player.hp || 12) / (this.campaign.player.max_hp || 12);
      if (playerHpRatio < 0.3) score += 3;
    }

    // 通用条件（如 "always"）
    if (lower.includes('always')) score += 1;

    return score;
  }

  private _getNPCState(npcId: string): NPCState {
    if (!this.campaign.npcs_state) this.campaign.npcs_state = {};
    if (!this.campaign.npcs_state[npcId]) {
      const npc = this.module.npcs?.[npcId];
      this.campaign.npcs_state[npcId] = {
        id: npcId,
        current_hp: npc?.hp || 10,
        current_san: npc?.sanity || 50,
        attitude: npc?.attitude || 'neutral',
        trust: 30,
        fear: 20,
        suspicion: 30,
        known_topics: [],
        secrets_revealed: [],
        current_action: null,
        turns_in_scene: 0,
        is_alive: true,
        custom_vars: {},
        memory: [],
        relationships: {},
      };
    }
    return this.campaign.npcs_state[npcId];
  }

  private _interpolateTemplate(template: string, npc: NPC, playerInput?: string): string {
    let result = template;
    const playerName = this.campaign.player?.name || '调查员';

    result = result.replace(/\{npc_name\}/g, npc.name);
    result = result.replace(/\{player_name\}/g, playerName);
    result = result.replace(/\{topic\}/g, playerInput || '这件事');

    // 支持简单的人称替换
    if (npc.personality) {
      result = result.replace(/\{personality\}/g, npc.personality);
    }

    return result;
  }

  /**
   * 将对话结果应用到 campaign 状态（信任、恐惧等变化）。
   */
  applyDialogueEffects(npcId: string, result: NPCDialogueResult): void {
    if (!result.effects?.length) return;

    const npcState = this._getNPCState(npcId);

    for (const effect of result.effects) {
      switch (effect.type) {
        case 'trust_delta':
          npcState.trust = Math.min(100, Math.max(0, npcState.trust + effect.value));
          break;
        case 'fear_delta':
          npcState.fear = Math.min(100, Math.max(0, npcState.fear + effect.value));
          break;
        case 'suspicion_delta':
          npcState.suspicion = Math.min(100, Math.max(0, npcState.suspicion + effect.value));
          break;
        case 'sanity_delta':
          npcState.current_san = Math.max(0, npcState.current_san + effect.value);
          break;
      }
    }

    // 同步态度变化
    if (npcState.trust > 60 && npcState.fear < 30) npcState.attitude = 'friendly';
    else if (npcState.fear > 70) npcState.attitude = 'afraid';
    else if (npcState.trust < 20) npcState.attitude = 'hostile';
    else npcState.attitude = 'neutral';
  }

  // ═══════════════════════════════════════════
  // Phase 3-B: NPC 自主决策系统
  // ═══════════════════════════════════════════

  /**
   * 让场景中的 NPC 进行一轮自主决策。
   * 每个 NPC 根据场景状态、玩家行为、自身性格和记忆决定下一步行动。
   * 返回所有 NPC 的决策结果列表。
   */
  async simulateNPCAutonomousTurn(
    sceneId: string,
    llmClient?: LLMClient | null,
  ): Promise<{ npcId: string; decision: NPCDecision }[]> {
    const scene = this.module.scenes[sceneId];
    if (!scene?.npcs?.length) return [];

    const results: { npcId: string; decision: NPCDecision }[] = [];

    for (const npcId of scene.npcs) {
      const npc = this.module.npcs?.[npcId];
      if (!npc) continue;

      const npcState = this._getNPCState(npcId);
      if (!npcState.is_alive || npcState.current_hp <= 0) continue;

      // 创建决策引擎并传入当前 campaign 的不可变副本
      const engine = new NPCDecisionEngine(this.campaign, this.module, npcId);

      // 构建情境上下文
      const situation = this._buildSituationForNPC(npcId, sceneId);

      // 获取记忆摘要作为对话历史上下文
      const memorySummary = this._getMemorySummary(npcId);

      try {
        const decision = await engine.decide(situation, llmClient || null, memorySummary);

        // 记录决策到记忆
        this.recordMemory(
          npcId,
          'observation',
          `自主决策：${decision.action}，原因：${decision.reasoning}`,
          0,
          sceneId,
        );

        results.push({ npcId, decision });
      } catch (e) {
        // 决策失败时回退到 idle
        results.push({
          npcId,
          decision: {
            action: 'idle',
            confidence: 0.5,
            reasoning: '决策引擎异常，回退到 idle',
            mood: 'neutral',
            target_id: null,
          },
        });
      }
    }

    return results;
  }

  /**
   * NPC 之间互动（如伦纳德和邓恩对话）。
   * 当两个 NPC 在同一场景且有关系时，可能触发互动。
   * 返回互动对话内容，null 表示未触发互动。
   */
  async processNPCInteraction(
    npcIdA: string,
    npcIdB: string,
    context?: string,
    llmClient?: LLMClient | null,
  ): Promise<{ speaker: string; text: string; emotion: string; observerText?: string } | null> {
    const npcA = this.module.npcs?.[npcIdA];
    const npcB = this.module.npcs?.[npcIdB];
    if (!npcA || !npcB) return null;

    const stateA = this._getNPCState(npcIdA);
    const stateB = this._getNPCState(npcIdB);
    if (!stateA.is_alive || !stateB.is_alive) return null;

    // 获取关系状态
    const relAtoB = this._getRelationship(npcIdA, npcIdB);
    const relBtoA = this._getRelationship(npcIdB, npcIdA);

    // 计算互动概率（基于关系信任度和性格匹配）
    const interactionChance = this._calculateInteractionChance(relAtoB, relBtoA, npcA, npcB);
    if (Math.random() > interactionChance) return null;

    // 确定发言者（信任度高的一方更可能先开口，或随机）
    const speakerId = relAtoB.trust >= relBtoA.trust ? npcIdA : npcIdB;
    const speaker = speakerId === npcIdA ? npcA : npcB;
    const speakerState = speakerId === npcIdA ? stateA : stateB;
    const listener = speakerId === npcIdA ? npcB : npcA;

    // 生成对话内容
    let text: string;
    let emotion: string;

    // 发言者关系（用于情绪/模板选择）和听者关系（用于记忆影响）
    const speakerRel = speakerId === npcIdA ? relAtoB : relBtoA;
    const listenerRel = speakerId === npcIdA ? relBtoA : relAtoB;

    if (llmClient?.isAvailable()) {
      try {
        const result = await this._generateNPCNPCDialogueLLM(speaker, listener, context || '', llmClient);
        text = result.text;
        emotion = result.emotion;
      } catch (e) {
        text = this._generateNPCNPCDialogueTemplate(speaker, listener, speakerRel);
        emotion = speakerRel.attitude === 'friendly' ? 'friendly' : 'neutral';
      }
    } else {
      text = this._generateNPCNPCDialogueTemplate(speaker, listener, speakerRel);
      emotion = speakerRel.attitude === 'friendly' ? 'friendly' : 'neutral';
    }

    // 记录双方记忆
    this.recordMemory(
      speakerId,
      'npc_interaction',
      `对 ${listener.name} 说："${text}"`,
      speakerRel.attitude === 'friendly' ? 5 : speakerRel.attitude === 'hostile' ? -10 : 0,
      this.campaign.current_scene,
      speakerId === npcIdA ? npcIdB : npcIdA,
    );
    this.recordMemory(
      speakerId === npcIdA ? npcIdB : npcIdA,
      'npc_interaction',
      `${speaker.name} 对我说："${text}"`,
      listenerRel.attitude === 'friendly' ? 5 : listenerRel.attitude === 'hostile' ? -10 : 0,
      this.campaign.current_scene,
      speakerId,
    );

    // 更新关系（互动后信任微增，任一方向友好则双向增加）
    if (relAtoB.attitude === 'friendly' || relBtoA.attitude === 'friendly') {
      this.updateRelationship(npcIdA, npcIdB, { trust_delta: 2 });
      this.updateRelationship(npcIdB, npcIdA, { trust_delta: 2 });
    }

    // 旁观者视角描述（综合双方关系）
    const observerText =
      relAtoB.attitude === 'hostile' || relBtoA.attitude === 'hostile'
        ? `【${npcA.name} 和 ${npcB.name} 之间的气氛十分紧张】`
        : relAtoB.attitude === 'friendly' && relBtoA.attitude === 'friendly'
          ? `【${npcA.name} 和 ${npcB.name} 似乎在低声交谈】`
          : `【${npcA.name} 和 ${npcB.name} 互相看了一眼】`;

    return { speaker: speaker.name, text, emotion, observerText };
  }

  /**
   * 检查场景中是否有 NPC 之间的互动可以触发。
   * 返回触发的互动列表（供场景加载/回合结束时调用）。
   */
  async checkNPCNPCInteractions(
    sceneId: string,
    llmClient?: LLMClient | null,
  ): Promise<{ speaker: string; text: string; emotion: string; observerText?: string }[]> {
    const scene = this.module.scenes[sceneId];
    if (!scene?.npcs || scene.npcs.length < 2) return [];

    const results: { speaker: string; text: string; emotion: string; observerText?: string }[] = [];

    // 两两组合检查互动
    for (let i = 0; i < scene.npcs.length; i++) {
      for (let j = i + 1; j < scene.npcs.length; j++) {
        const interaction = await this.processNPCInteraction(
          scene.npcs[i],
          scene.npcs[j],
          undefined,
          llmClient,
        );
        if (interaction) {
          results.push(interaction);
        }
      }
    }

    return results;
  }

  /**
   * 记录 NPC 记忆。
   * 当玩家与 NPC 互动后，将事件记录到 NPC 的记忆中。
   * 记忆会影响 NPC 对玩家的态度和行为决策。
   */
  recordMemory(
    npcId: string,
    type: NPCMemoryEntry['type'],
    description: string,
    impact: number,
    sceneId?: string,
    relatedNpcId?: string,
  ): void {
    const npcState = this._getNPCState(npcId);
    if (!npcState.memory) npcState.memory = [];

    const entry: NPCMemoryEntry = {
      turn: this.campaign.turn || 1,
      scene_id: sceneId || this.campaign.current_scene || 'unknown',
      type,
      description,
      impact: Math.max(-100, Math.min(100, impact)),
      related_npc_id: relatedNpcId,
    };

    npcState.memory.push(entry);

    // 限制记忆数量，保留最近 20 条
    if (npcState.memory.length > 20) {
      npcState.memory = npcState.memory.slice(-20);
    }

    // 根据 impact 实时影响 trust / fear
    if (type === 'player_attack' || type === 'player_threat') {
      npcState.fear = Math.min(100, npcState.fear + Math.abs(impact) * 0.3);
      npcState.trust = Math.max(0, npcState.trust - Math.abs(impact) * 0.3);
    } else if (type === 'player_help') {
      npcState.trust = Math.min(100, npcState.trust + Math.abs(impact) * 0.3);
      npcState.fear = Math.max(0, npcState.fear - Math.abs(impact) * 0.15);
    }
  }

  /**
   * 获取 NPC 对玩家的综合态度（基于记忆加权）。
   * 不仅看当前 trust/fear，还会参考历史记忆的总影响。
   */
  getNPCAttitudeTowardsPlayer(npcId: string): { attitude: string; trust: number; fear: number; summary: string } {
    const npcState = this._getNPCState(npcId);
    const npc = this.module.npcs?.[npcId];

    // 计算记忆总影响
    let memoryImpact = 0;
    if (npcState.memory?.length) {
      // 近期记忆权重更高
      npcState.memory.forEach((m, idx) => {
        const recencyWeight = (idx + 1) / npcState.memory!.length;
        if (m.type === 'player_attack' || m.type === 'player_threat') {
          memoryImpact -= m.impact * recencyWeight;
        } else if (m.type === 'player_help') {
          memoryImpact += m.impact * recencyWeight;
        }
      });
    }

    // 综合 trust（记忆影响占 30%，当前 trust 占 70%）
    const effectiveTrust = Math.round(npcState.trust * 0.7 + (memoryImpact > 0 ? Math.min(100, memoryImpact) : 0) * 0.3);
    const effectiveFear = npcState.fear;

    let attitude: string;
    if (effectiveTrust > 60 && effectiveFear < 30) attitude = 'friendly';
    else if (effectiveFear > 70) attitude = 'afraid';
    else if (effectiveTrust < 20) attitude = 'hostile';
    else attitude = 'neutral';

    // 生成态度摘要
    const memoryCount = npcState.memory?.length || 0;
    const positiveMemories = npcState.memory?.filter((m) => m.impact > 0 && (m.type === 'player_help' || m.type === 'player_talk')).length || 0;
    const negativeMemories = npcState.memory?.filter((m) => m.impact < 0 && (m.type === 'player_attack' || m.type === 'player_threat')).length || 0;

    let summary: string;
    if (memoryCount === 0) {
      summary = `${npc?.name || npcId} 对玩家尚无深刻印象。`;
    } else if (positiveMemories > negativeMemories * 2) {
      summary = `${npc?.name || npcId} 对玩家印象很好，记得 ${positiveMemories} 次愉快的互动。`;
    } else if (negativeMemories > positiveMemories * 2) {
      summary = `${npc?.name || npcId} 对玩家心存芥蒂，记得 ${negativeMemories} 次不愉快的经历。`;
    } else {
      summary = `${npc?.name || npcId} 对玩家的态度复杂，有 ${positiveMemories} 次正面记忆和 ${negativeMemories} 次负面记忆。`;
    }

    return { attitude, trust: effectiveTrust, fear: effectiveFear, summary };
  }

  /**
   * 更新 NPC 关系。
   * 当两个 NPC 互动后，更新他们的关系状态。
   */
  updateRelationship(
    npcIdA: string,
    npcIdB: string,
    delta: { trust_delta?: number; attitude?: string; tag?: string },
  ): void {
    const stateA = this._getNPCState(npcIdA);
    if (!stateA.relationships) stateA.relationships = {};

    const existing = stateA.relationships[npcIdB] || {
      npc_id: npcIdB,
      attitude: 'neutral',
      trust: 30,
      last_interaction_turn: 0,
    };

    stateA.relationships[npcIdB] = {
      npc_id: npcIdB,
      attitude: (delta.attitude as any) || existing.attitude,
      trust: Math.min(100, Math.max(0, existing.trust + (delta.trust_delta || 0))),
      last_interaction_turn: this.campaign.turn || 1,
      tag: delta.tag || existing.tag,
    };
  }

  /**
   * 获取 NPC 关系（如果不存在则创建默认关系）。
   */
  private _getRelationship(npcIdA: string, npcIdB: string) {
    const stateA = this._getNPCState(npcIdA);
    if (!stateA.relationships) stateA.relationships = {};

    if (!stateA.relationships[npcIdB]) {
      stateA.relationships[npcIdB] = {
        npc_id: npcIdB,
        attitude: 'neutral',
        trust: 30,
        last_interaction_turn: 0,
      };
    }

    return stateA.relationships[npcIdB];
  }

  /**
   * 计算两个 NPC 之间的互动概率。
   */
  private _calculateInteractionChance(
    relAtoB: { trust: number; attitude: string },
    relBtoA: { trust: number; attitude: string },
    npcA: NPC,
    npcB: NPC,
  ): number {
    let chance = 0.3; // 基础概率 30%

    // 信任度影响
    const avgTrust = (relAtoB.trust + relBtoA.trust) / 2;
    chance += avgTrust * 0.003; // 信任越高越容易互动

    // 态度影响
    if (relAtoB.attitude === 'friendly' && relBtoA.attitude === 'friendly') {
      chance += 0.3;
    } else if (relAtoB.attitude === 'hostile' || relBtoA.attitude === 'hostile') {
      chance -= 0.2; // 敌对时也可能互动（冲突）
    }

    // 性格影响（如果 personality 包含社交相关词汇）
    const socialTraits = ['健谈', 'outgoing', 'friendly', '善交际', 'talkative', 'curious'];
    const aSocial = socialTraits.some((t) => npcA.personality?.includes(t));
    const bSocial = socialTraits.some((t) => npcB.personality?.includes(t));
    if (aSocial || bSocial) chance += 0.15;

    return Math.max(0.05, Math.min(0.95, chance));
  }

  /**
   * 为 NPC 构建决策情境上下文。
   */
  private _buildSituationForNPC(npcId: string, sceneId: string): any {
    const npcState = this._getNPCState(npcId);
    const scene = this.module.scenes[sceneId];

    // 检查是否有关于玩家的负面记忆
    const negativeMemories = npcState.memory?.filter(
      (m) => m.impact < 0 && (m.type === 'player_attack' || m.type === 'player_threat'),
    );
    const hasNegativeMemory = (negativeMemories?.length || 0) > 0;

    // 检查同场景其他 NPC 关系
    const alliesInScene = scene?.npcs?.filter((otherId) => {
      if (otherId === npcId) return false;
      const rel = this._getRelationship(npcId, otherId);
      return rel.attitude === 'friendly';
    });

    const enemiesInScene = scene?.npcs?.filter((otherId) => {
      if (otherId === npcId) return false;
      const rel = this._getRelationship(npcId, otherId);
      return rel.attitude === 'hostile';
    });

    return {
      type: 'autonomous_turn',
      has_negative_memory: hasNegativeMemory,
      negative_memory_count: negativeMemories?.length || 0,
      allies_in_scene: alliesInScene || [],
      enemies_in_scene: enemiesInScene || [],
      scene_npcs: scene?.npcs || [],
    };
  }

  /**
   * 获取 NPC 记忆摘要（用于 LLM 上下文）。
   */
  private _getMemorySummary(npcId: string): string {
    const npcState = this._getNPCState(npcId);
    if (!npcState.memory?.length) return '';

    const recent = npcState.memory.slice(-5);
    return recent.map((m) => `[T${m.turn}] ${m.description}`).join('\n');
  }

  /**
   * 使用 LLM 生成 NPC-NPC 对话。
   */
  private async _generateNPCNPCDialogueLLM(
    speaker: NPC,
    listener: NPC,
    context: string,
    llmClient: LLMClient,
  ): Promise<{ text: string; emotion: string }> {
    const speakerState = this._getNPCState(speaker.id);
    const listenerState = this._getNPCState(listener.id);
    const rel = this._getRelationship(speaker.id, listener.id);

    const systemPrompt = `你是 ${speaker.name}，正在与 ${listener.name} 对话。
${speaker.personality ? `你的性格：${speaker.personality}` : ''}
你对 ${listener.name} 的态度：${rel.attitude}，信任度：${rel.trust}/100
${speakerState.memory?.filter((m) => m.related_npc_id === listener.id).length ? `你们之间的过往：\n${speakerState.memory.filter((m) => m.related_npc_id === listener.id).slice(-3).map((m) => `- ${m.description}`).join('\n')}` : ''}

请以 JSON 格式回复：{ "text": "你的台词（1-2句话）", "emotion": "情绪标签" }`;

    const userPrompt = context ? `背景：${context}\n你对 ${listener.name} 说：` : `你对 ${listener.name} 说：`;

    const response = await llmClient.chat(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { temperature: 0.7, maxTokens: 256 },
    );

    try {
      const raw = response.content.trim();
      const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      const jsonText = jsonMatch ? jsonMatch[1].trim() : raw;
      const parsed = JSON.parse(jsonText);
      return { text: parsed.text || '……', emotion: parsed.emotion || 'neutral' };
    } catch (e) {
      return { text: response.content.trim().substring(0, 200), emotion: 'neutral' };
    }
  }

  /**
   * 使用模板生成 NPC-NPC 对话（LLM 不可用时）。
   */
  private _generateNPCNPCDialogueTemplate(
    speaker: NPC,
    listener: NPC,
    rel: { attitude: string; trust: number },
  ): string {
    const templates: Record<string, string[]> = {
      friendly: [
        `“${listener.name}，你怎么看？”`,
        `“正好你也在，我有件事想商量。”`,
        `【${speaker.name} 向 ${listener.name} 点了点头】`,
      ],
      hostile: [
        `“……${listener.name}，离我远点。”`,
        `【${speaker.name} 冷冷地瞥了 ${listener.name} 一眼】`,
        `“你来这里干什么？”`,
      ],
      neutral: [
        `“嗯……”`,
        `【${speaker.name} 和 ${listener.name} 交换了一个眼神】`,
        `“${listener.name}。”`,
      ],
      afraid: [
        `“${listener.name}……别、别这样看着我……”`,
        `【${speaker.name} 下意识地远离 ${listener.name}】`,
      ],
    };

    const texts = templates[rel.attitude] || templates['neutral'];
    return texts[Math.floor(Math.random() * texts.length)];
  }

  /**
   * 根据玩家输入和 NPC 回应计算记忆影响值。
   */
  private _calculateInteractionImpact(result: NPCDialogueResult, playerInput: string): number {
    let impact = 5; // 基础正面印象

    const lowerInput = playerInput.toLowerCase();

    // 检测威胁性输入
    const threatWords = ['杀', '死', '攻击', '威胁', '打', 'kill', 'attack', 'threat'];
    if (threatWords.some((w) => lowerInput.includes(w))) {
      impact = -25;
    }

    // 检测帮助性输入
    const helpWords = ['帮助', '救', '救我', 'help', 'save', 'heal', '治疗'];
    if (helpWords.some((w) => lowerInput.includes(w))) {
      impact = 20;
    }

    // 根据 NPC 回应的情绪调整
    if (result.emotion === 'hostile' || result.emotion === 'angry') {
      impact -= 10;
    } else if (result.emotion === 'friendly' || result.emotion === 'grateful') {
      impact += 10;
    }

    // 如果有负面效果
    if (result.effects) {
      for (const eff of result.effects) {
        if (eff.type === 'fear_delta' && eff.value > 0) impact -= eff.value;
        if (eff.type === 'trust_delta' && eff.value > 0) impact += eff.value;
        if (eff.type === 'trust_delta' && eff.value < 0) impact += eff.value;
      }
    }

    return Math.max(-50, Math.min(50, impact));
  }

  /**
   * 将玩家输入分类为记忆事件类型。
   */
  private _categorizePlayerInput(playerInput: string): NPCMemoryEntry['type'] {
    const lower = playerInput.toLowerCase();

    const threatWords = ['杀', '死', '攻击', '威胁', '打', 'kill', 'attack', 'threat'];
    if (threatWords.some((w) => lower.includes(w))) return 'player_threat';

    const helpWords = ['帮助', '救', '救我', 'help', 'save', 'heal', '治疗'];
    if (helpWords.some((w) => lower.includes(w))) return 'player_help';

    return 'player_talk';
  }
}

export default NPCDialogueSystem;
