import type {
  NPC,
  NPCState,
  DialogueTree,
  DialogueTreeNode,
  DialogueBranch,
  DialogueCondition,
  DynamicResponseConfig,
  InitiativeTrigger,
  ResponseTemplate,
  Campaign,
  Module,
} from '../types/module';
import type { LLMClient } from '../llm/client';

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

  constructor(campaign: Campaign, moduleData: Module) {
    this.campaign = campaign;
    this.module = moduleData;
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
      return { npcId: targetNpc.id, result };
    }

    // 2. 检查场景中的 NPC 是否有对话树可以匹配（不指定 NPC 时，按优先级尝试）
    for (const npcId of scene.npcs) {
      const npc = this.module.npcs?.[npcId];
      if (!npc) continue;

      // 如果该 NPC 已有激活的对话树，优先继续
      if (this.activeDialogues.has(npcId)) {
        const result = await this._evaluateDialogueTree(npc, playerInput, llmClient);
        return { npcId, result };
      }
    }

    // 3. 尝试所有 NPC 的动态响应（无明确目标时，匹配第一个 personality 合适的）
    for (const npcId of scene.npcs) {
      const npc = this.module.npcs?.[npcId];
      if (!npc?.dynamic_response) continue;

      const result = this._evaluateDynamicResponse(npc, playerInput);
      if (result) {
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
    const best = matches[0].template;
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

    const systemPrompt = `你是 ${npc.name}，一个${npc.description}。\n` +
      `性格：${npc.personality || '未设定'}\n` +
      `当前态度：${npcState.attitude}，信任：${npcState.trust}，恐惧：${npcState.fear}\n` +
      `你必须以 JSON 格式回复，只包含 { "text": "你的台词", "emotion": "情绪标签" }`;

    const userPrompt = `玩家对你说："${playerInput}"\n` +
      `当前对话上下文：${currentNode.text}\n` +
      `请用 1-2 句话回应，保持角色一致性。`;

    try {
      const response = await llmClient.chat(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
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
  }
}

export default NPCDialogueSystem;
