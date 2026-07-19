import type { LLMClient } from '../llm/client';
import type { Module, Campaign, Scene, NPC, NPCState } from '../types/module';

/**
 * Phase 3-C: LLM-Driven Story Engine
 *
 * Core principle: Preserve the module framework (endings, combat configs, exits)
 * but let LLM dynamically fill narrative details based on player behavior and scene state.
 *
 * ① Current story state (scene + NPCs + player actions) → LLM
 * ② LLM generates next story direction and dialogue
 * ③ Key plot nodes (ending, combat triggers, scene exits) still follow module framework
 *    but details are filled by LLM.
 */

export interface StoryContext {
  scene: Scene;
  campaign: Campaign;
  module: Module;
  playerInput?: string;
  inputHistory: string[];
  recentEvents: string[];
}

export interface StoryProgression {
  /** Narrative text to display to the player */
  narration: string;
  /** Whether this progression triggers a scene change */
  sceneChange?: {
    targetSceneId: string;
    reason: string;
  };
  /** NPC dialogue to display (if any) */
  npcDialogue?: {
    npcId: string;
    text: string;
    emotion?: string;
  };
  /** Suggested actions for the player */
  suggestedActions: Array<{
    type: string;
    label: string;
    target?: string;
  }>;
  /** Global vars to update */
  globalVarUpdates?: Record<string, unknown>;
  /** NPC state updates */
  npcStateUpdates?: Record<string, Partial<NPCState>>;
  /** Whether this is a major plot point that should be logged */
  isMajorPlotPoint: boolean;
  /** Optional background image hint for ImageBridge */
  bgHint?: string;
}

export interface SceneNarration {
  /** Dynamic scene description (overrides static if non-empty) */
  description: string;
  /** Atmosphere text */
  atmosphere?: string;
  /** Optional NPC presence descriptions */
  npcDescriptions?: Record<string, string>;
  /** Dynamic exits descriptions */
  exitDescriptions?: Record<string, string>;
}

/**
 * StoryEngine — LLM-driven narrative progression.
 * Coexists with the fixed module framework: hard-coded plot nodes
 * (endings, combat triggers, exits) always take priority.
 */
export class StoryEngine {
  private llmClient: LLMClient | null;
  private module: Module;
  private cache: Map<string, { result: StoryProgression; timestamp: number }>;
  private cacheMaxAge: number;

  constructor(module: Module, llmClient: LLMClient | null = null) {
    this.module = module;
    this.llmClient = llmClient;
    this.cache = new Map();
    this.cacheMaxAge = 3 * 60 * 1000; // 3 min cache
  }

  setLLMClient(client: LLMClient | null): void {
    this.llmClient = client;
  }

  /**
   * Generate the next story progression based on current context.
   * This is called when no fixed event / basic intent matches.
   */
  async progress(context: StoryContext): Promise<StoryProgression> {
    if (!this.llmClient?.isAvailable()) {
      return this.fallbackProgression(context);
    }

    const cacheKey = this.buildCacheKey(context);
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const messages = this.buildStoryPrompt(context);
      const response = await this.llmClient.chat(messages, {
        temperature: 0.75,
        maxTokens: 1024,
      });

      const parsed = this.parseStoryResponse(response.content);
      this.setCache(cacheKey, parsed);
      return parsed;
    } catch (err) {
      console.warn('[StoryEngine] LLM call failed, using fallback:', err);
      return this.fallbackProgression(context);
    }
  }

  /**
   * Generate dynamic scene narration when entering a scene.
   * Can be used to override static scene.description.
   */
  async narrateScene(context: StoryContext): Promise<SceneNarration> {
    if (!this.llmClient?.isAvailable()) {
      return { description: context.scene.description };
    }

    try {
      const messages = this.buildSceneNarrationPrompt(context);
      const response = await this.llmClient.chat(messages, {
        temperature: 0.7,
        maxTokens: 768,
      });

      const parsed = this.parseSceneNarration(response.content);
      // If parsed description is empty, fall back to static
      if (!parsed.description || parsed.description.trim().length < 10) {
        parsed.description = context.scene.description;
      }
      return parsed;
    } catch (err) {
      console.warn('[StoryEngine] Scene narration failed:', err);
      return { description: context.scene.description };
    }
  }

  /**
   * Generate dynamic NPC dialogue based on context.
   * This is an alternative to the fixed dialogue_tree system.
   */
  async generateNPCDialogue(
    npcId: string,
    context: StoryContext,
    playerInput?: string,
  ): Promise<{ text: string; emotion: string } | null> {
    if (!this.llmClient?.isAvailable()) return null;

    const npc = this.module.npcs?.[npcId];
    if (!npc) return null;

    try {
      const npcState = context.campaign.npcs_state[npcId] || this.createDefaultNPCState(npcId);
      const messages = this.buildNPCDialoguePrompt(npc, npcState, context, playerInput);
      const response = await this.llmClient.chat(messages, {
        temperature: 0.8,
        maxTokens: 512,
      });

      const parsed = this.parseNPCDialogue(response.content);
      return parsed || { text: response.content.trim(), emotion: npc.dynamic_response?.default_emotion || 'neutral' };
    } catch (err) {
      console.warn('[StoryEngine] NPC dialogue generation failed:', err);
      return null;
    }
  }

  // ───────────────────────────────────────────
  // Prompt Builders
  // ───────────────────────────────────────────

  private buildStoryPrompt(context: StoryContext) {
    const { scene, campaign, module, playerInput, inputHistory, recentEvents } = context;

    const npcsInScene = (scene.npcs || [])
      .map((id) => {
        const npc = module.npcs?.[id];
        const state = campaign.npcs_state[id];
        return npc
          ? `- ${npc.name} (${npc.role}, 态度: ${state?.attitude || npc.attitude}, 信任: ${state?.trust ?? 50}, 恐惧: ${state?.fear ?? 0})`
          : `- ${id}`;
      })
      .join('\n');

    const exits = (scene.exits || [])
      .map((e) => `- ${e.label} → ${e.target}`)
      .join('\n');

    const interactables = (scene.interactables || [])
      .map((id) => {
        const item = module.items?.[id];
        return item ? `- ${item.name}: ${item.description}` : `- ${id}`;
      })
      .join('\n');

    const history = inputHistory.slice(-8).map((h, i) => `${i + 1}. ${h}`).join('\n');
    const events = recentEvents.slice(-5).join('\n');

    const systemPrompt = `你是AI-GM，一个TRPG游戏的叙事型AI主持人。你的任务是根据当前游戏状态动态推进剧情。

**规则：**
1. 生成沉浸式的叙事回复，风格克苏鲁/恐怖，中文回答。
2. 必须返回有效的JSON格式（见下方格式要求）。
3. 关键剧情节点（如战斗触发、结局场景）仍遵循模组框架，不要擅自改变。
4. 玩家的行为会影响NPC态度和剧情走向。
5. 叙事要简洁有力，50-150字为主。
6. 如果场景有出口(exits)，在suggestedActions中列出对应的移动选项。
7. 如果场景有NPC，在suggestedActions中列出交谈选项。
8. 如果场景有互动物品，在suggestedActions中列出检查选项。
9. 如果玩家输入暗示了某个出口，可以在sceneChange中建议切换场景。

**返回JSON格式：**
{
  "narration": "叙事文本（必须）",
  "sceneChange": { "targetSceneId": "场景ID", "reason": "切换原因" } | null,
  "npcDialogue": { "npcId": "NPC ID", "text": "对话文本", "emotion": "情绪标签" } | null,
  "suggestedActions": [
    { "type": "move|talk|interact|combat", "label": "显示文本", "target": "目标ID（可选）" }
  ],
  "globalVarUpdates": { "key": value } | null,
  "npcStateUpdates": { "npcId": { "attitude": "...", "trust": number, "fear": number } } | null,
  "isMajorPlotPoint": true | false,
  "bgHint": "背景图搜索关键词（可选）"
}`;

    const userPrompt = `当前场景：${scene.title}
场景描述：${scene.description}

场景中的NPC：
${npcsInScene || '（无）'}

出口：
${exits || '（无）'}

可互动物品：
${interactables || '（无）'}

玩家状态：
- HP: ${campaign.player.hp}/${campaign.player.max_hp}
- SAN: ${campaign.player.sanity}/${campaign.player.max_sanity}
- 物品栏: ${campaign.player.inventory.map((id) => module.items?.[id]?.name || id).join('、') || '（空）'}

最近事件：
${events || '（无）'}

玩家输入历史：
${history || '（无）'}

玩家最新输入：${playerInput || '（玩家刚进入此场景，尚未行动）'}

请生成下一步剧情走向。`;

    return [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];
  }

  private buildSceneNarrationPrompt(context: StoryContext) {
    const { scene, campaign, module } = context;

    const npcsInScene = (scene.npcs || [])
      .map((id) => {
        const npc = module.npcs?.[id];
        return npc ? `- ${npc.name}: ${npc.description}` : `- ${id}`;
      })
      .join('\n');

    const history = campaign.scene_history.slice(-5).join(' → ');

    const systemPrompt = `你是AI-GM，一个TRPG游戏的场景描述生成器。根据场景基础信息和玩家历史，生成一段动态场景描述。

**规则：**
1. 保持克苏鲁/恐怖风格，中文回答。
2. 描述要有氛围感，但不要太长（80-150字）。
3. 可以动态调整描述以反映玩家的行为后果。
4. 返回JSON格式。

**返回JSON格式：**
{
  "description": "动态场景描述（必须，覆盖默认描述）",
  "atmosphere": "氛围补充（可选）",
  "npcDescriptions": { "npcId": "该NPC在场景中的动态描述" },
  "exitDescriptions": { "exitLabel": "该出口的动态描述" }
}`;

    const userPrompt = `场景名称：${scene.title}
基础描述：${scene.description}

场景中的角色：
${npcsInScene || '（无）'}

玩家到达此场景的路径：${history}

玩家当前状态：HP ${campaign.player.hp}/${campaign.player.max_hp}, SAN ${campaign.player.sanity}/${campaign.player.max_sanity}

请生成此场景的动态描述。`;

    return [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];
  }

  private buildNPCDialoguePrompt(
    npc: NPC,
    npcState: NPCState,
    context: StoryContext,
    playerInput?: string,
  ) {
    const personality = npc.personality || npc.dynamic_response?.personality_tags?.join('、') || '未知';
    const attitude = npcState.attitude || npc.attitude;

    const systemPrompt = `你是${npc.name}，一个TRPG游戏中的NPC。根据你的性格和当前对玩家的态度，生成回应。

**角色设定：**
- 名字：${npc.name}
- 性格：${personality}
- 角色：${npc.role}
- 当前态度：${attitude}
- 信任值：${npcState.trust}/100
- 恐惧值：${npcState.fear}/100

**规则：**
1. 完全代入角色，用第一人称说话。
2. 保持角色性格一致性。
3. 态度会影响语气（敌对=威胁/冷漠，友好=热情/帮助，中立=公事公办）。
4. 回复简洁（1-3句话）。
5. 返回JSON格式。

**返回JSON格式：**
{
  "text": "NPC说的话（必须）",
  "emotion": "情绪标签: neutral|happy|angry|sad|scared|suspicious|friendly|hostile"
}`;

    const userPrompt = `当前场景：${context.scene.title}
场景描述：${context.scene.description}

玩家说："${playerInput || '（玩家只是看着你）'}"

你（${npc.name}）会如何回应？请返回JSON。`;

    return [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];
  }

  // ───────────────────────────────────────────
  // Response Parsers
  // ───────────────────────────────────────────

  private parseStoryResponse(content: string): StoryProgression {
    const json = this.extractJSON(content);
    if (!json) {
      // Fallback: treat entire content as narration
      return {
        narration: content.trim(),
        suggestedActions: [],
        isMajorPlotPoint: false,
      };
    }

    return {
      narration: String(json.narration || json.text || json.content || '……').trim(),
      sceneChange: json.sceneChange || json.scene_change || null,
      npcDialogue: json.npcDialogue || json.npc_dialogue || null,
      suggestedActions: Array.isArray(json.suggestedActions || json.suggested_actions)
        ? (json.suggestedActions || json.suggested_actions).map((a: any) => ({
            type: String(a.type || 'interact'),
            label: String(a.label || a.text || '行动'),
            target: a.target ? String(a.target) : undefined,
          }))
        : [],
      globalVarUpdates: json.globalVarUpdates || json.global_var_updates || null,
      npcStateUpdates: json.npcStateUpdates || json.npc_state_updates || null,
      isMajorPlotPoint: !!json.isMajorPlotPoint || !!json.is_major_plot_point,
      bgHint: json.bgHint || json.bg_hint || undefined,
    };
  }

  private parseSceneNarration(content: string): SceneNarration {
    const json = this.extractJSON(content);
    if (!json) {
      return { description: content.trim() };
    }

    return {
      description: String(json.description || json.text || content).trim(),
      atmosphere: json.atmosphere ? String(json.atmosphere) : undefined,
      npcDescriptions: json.npcDescriptions || json.npc_descriptions || undefined,
      exitDescriptions: json.exitDescriptions || json.exit_descriptions || undefined,
    };
  }

  private parseNPCDialogue(content: string): { text: string; emotion: string } | null {
    const json = this.extractJSON(content);
    if (!json) return null;
    return {
      text: String(json.text || json.dialogue || json.content || '').trim(),
      emotion: String(json.emotion || json.mood || 'neutral').trim(),
    };
  }

  private extractJSON(text: string): any {
    if (!text) return null;

    try {
      const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (jsonMatch) return JSON.parse(jsonMatch[1].trim());
      return JSON.parse(text.trim());
    } catch {
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  // ───────────────────────────────────────────
  // Fallbacks
  // ───────────────────────────────────────────

  private fallbackProgression(context: StoryContext): StoryProgression {
    const { scene, campaign, playerInput } = context;

    // Build simple suggested actions from scene data
    const suggestedActions: Array<{ type: string; label: string; target?: string }> = [];

    if (scene.exits) {
      scene.exits.forEach((e) => {
        suggestedActions.push({ type: 'move', label: e.label, target: e.target });
      });
    }
    if (scene.npcs) {
      scene.npcs.forEach((id) => {
        const npc = this.module.npcs?.[id];
        suggestedActions.push({ type: 'talk', label: `与${npc?.name || id}交谈`, target: id });
      });
    }
    if (scene.interactables) {
      scene.interactables.forEach((id) => {
        const item = this.module.items?.[id];
        suggestedActions.push({ type: 'interact', label: `检查${item?.name || id}`, target: id });
      });
    }

    let narration = scene.description;
    if (playerInput) {
      narration = `你试图${playerInput}……\n\n${scene.description}`;
    }

    return {
      narration,
      suggestedActions,
      isMajorPlotPoint: false,
    };
  }

  private createDefaultNPCState(npcId: string): NPCState {
    const npc = this.module.npcs?.[npcId];
    return {
      id: npcId,
      current_hp: npc?.hp || 10,
      current_san: npc?.sanity || 50,
      attitude: npc?.attitude || 'neutral',
      trust: 50,
      fear: 0,
      suspicion: 0,
      known_topics: [],
      secrets_revealed: [],
      current_action: null,
      turns_in_scene: 0,
      is_alive: true,
      custom_vars: {},
    };
  }

  // ───────────────────────────────────────────
  // Cache
  // ───────────────────────────────────────────

  private buildCacheKey(context: StoryContext): string {
    const { scene, campaign, playerInput, inputHistory } = context;
    return JSON.stringify({
      sceneId: scene.id,
      playerHp: campaign.player.hp,
      playerSan: campaign.player.sanity,
      lastInput: inputHistory[inputHistory.length - 1] || '',
      currentInput: playerInput || '',
    });
  }

  private getCached(key: string): StoryProgression | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.cacheMaxAge) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  private setCache(key: string, result: StoryProgression): void {
    this.cache.set(key, { result, timestamp: Date.now() });
  }
}

export default StoryEngine;
