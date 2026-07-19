import type { LLMClient } from './client';
import type { Campaign, Module, Scene } from '../types/module';
import type { VNChoice } from '../types/engine';

/**
 * Phase 3-A: LLM 动态选项生成器
 *
 * 根据当前场景状态、战役进度、玩家输入历史，由 LLM 动态生成交互选项。
 * 不再依赖模组预设的 choices，而是根据实时上下文生成合理的行动建议。
 */

export interface GenerateOptionsContext {
  /** 当前场景 */
  scene: Scene;
  /** 当前战役状态 */
  campaign: Campaign;
  /** 模组数据（用于 NPC/物品名称） */
  module: Module;
  /** 最近的玩家输入历史（最近 10 条） */
  inputHistory?: string[];
  /** 上一次玩家输入（如果有） */
  lastPlayerInput?: string;
  /** 当前对话文本（如果有） */
  currentDialogue?: string;
  /** 当前说话者（如果有） */
  currentSpeaker?: string | null;
}

/** LLM 返回的原始选项结构 */
interface LLMRawOption {
  text: string;
  confidence: number;
  action?: 'scene' | 'next' | 'dice_check' | 'combat' | 'custom' | 'free_input';
  target?: string;
  reason?: string;
}

/**
 * LLM 动态选项生成器
 */
export class LLMOptionGenerator {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  /**
   * 根据上下文生成动态选项
   *
   * 返回 VNChoice 数组，包含一个特殊的自由输入选项。
   * 选项按 confidence 降序排列。
   */
  async generateOptions(ctx: GenerateOptionsContext): Promise<VNChoice[]> {
    if (!this.llmClient.isAvailable()) {
      // LLM 不可用时，回退到基于场景的基本选项
      return this.buildFallbackOptions(ctx);
    }

    try {
      const prompt = this.buildPrompt(ctx);
      const response = await this.llmClient.chat(
        [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        { temperature: 0.7, maxTokens: 1024 }
      );

      const rawOptions = this.parseLLMResponse(response.content);
      return this.convertToVNChoices(rawOptions, ctx);
    } catch (err) {
      console.error('[LLMOptionGenerator] LLM 生成选项失败，回退到默认选项:', err);
      return this.buildFallbackOptions(ctx);
    }
  }

  /**
   * 构建发送给 LLM 的提示词
   */
  private buildPrompt(ctx: GenerateOptionsContext): { system: string; user: string } {
    const scene = ctx.scene;
    const campaign = ctx.campaign;
    const mod = ctx.module;

    // 构建场景上下文
    const npcs = (scene.npcs || [])
      .map((id) => {
        const npc = mod.npcs?.[id];
        return npc ? `${npc.name}（${npc.description?.substring(0, 50) || '无描述'}...）` : id;
      })
      .join('、') || '无';

    const interactables = (scene.interactables || [])
      .map((id) => {
        const item = mod.items?.[id];
        return item ? `${item.name}` : id;
      })
      .join('、') || '无';

    const exits = (scene.exits || [])
      .map((e) => e.label || e.target)
      .join('、') || '无';

    const history = (ctx.inputHistory || [])
      .slice(-10)
      .map((h, i) => `${i + 1}. ${h}`)
      .join('\n') || '无';

    const systemPrompt = `你是 TRPG 游戏的 AI-GM 选项生成器。根据当前场景和玩家状态，生成 3-5 个合理的行动选项。

规则：
1. 每个选项必须贴合当前场景和玩家状态
2. 选项应该是玩家可以实际执行的行动（检查、移动、对话、战斗等）
3. 选项文本简洁有力（1-8 个中文字符）
4. 每个选项附带 confidence (0.0-1.0)，表示该选项在当前场景下的合理性
5. 必须包含一个自由输入选项（action: "free_input"），让玩家可以自定义输入
6. 如果场景有出口，至少包含一个移动选项（action: "scene"）
7. 如果场景有互动物品，至少包含一个检查选项（action: "custom"）
8. 如果场景有 NPC，至少包含一个对话选项（action: "custom"）
9. 如果场景配置了战斗，包含一个战斗选项（action: "combat"）

返回严格的 JSON 格式，不要包含任何其他文本：
{
  "options": [
    {
      "text": "选项文本",
      "confidence": 0.95,
      "action": "scene|next|dice_check|combat|custom|free_input",
      "target": "可选目标ID",
      "reason": "为什么这个选项合理（简短）"
    }
  ]
}`;

    const userPrompt = `【当前场景】
标题：${scene.title}
描述：${scene.description}

【场景中的 NPC】${npcs}
【可互动物品】${interactables}
【可用出口】${exits}

【玩家状态】
HP：${campaign.player.hp}/${campaign.player.max_hp}
SAN：${campaign.player.sanity}/${campaign.player.max_sanity}
物品栏：${campaign.player.inventory?.map((id) => mod.items?.[id]?.name || id).join('、') || '空'}

${ctx.currentDialogue ? `【当前对话】${ctx.currentSpeaker ? ctx.currentSpeaker + '：' : ''}${ctx.currentDialogue}` : ''}
${ctx.lastPlayerInput ? `【玩家刚刚输入】${ctx.lastPlayerInput}` : ''}

【最近输入历史】
${history}

请生成选项。`;

    return { system: systemPrompt, user: userPrompt };
  }

  /**
   * 解析 LLM 返回的 JSON 内容
   */
  private parseLLMResponse(content: string): LLMRawOption[] {
    if (!content) return [];

    try {
      const json = this.llmClient.extractJSON(content);
      if (json && Array.isArray(json.options)) {
        return json.options
          .map((opt: any) => ({
            text: String(opt.text || ''),
            confidence: Math.max(0, Math.min(1, parseFloat(opt.confidence) || 0.5)),
            action: (opt.action || 'custom') as LLMRawOption['action'],
            target: opt.target ? String(opt.target) : undefined,
            reason: opt.reason ? String(opt.reason) : undefined,
          }))
          .filter((opt: LLMRawOption) => opt.text.trim().length > 0);
      }
    } catch (err) {
      console.error('[LLMOptionGenerator] JSON 解析失败:', err);
    }

    return [];
  }

  /**
   * 将 LLM 原始选项转换为 VNChoice
   */
  private convertToVNChoices(rawOptions: LLMRawOption[], ctx: GenerateOptionsContext): VNChoice[] {
    const choices: VNChoice[] = [];

    for (let i = 0; i < rawOptions.length; i++) {
      const opt = rawOptions[i];

      // 自由输入选项特殊处理
      if (opt.action === 'free_input') {
        choices.push({
          id: `free_input_${i}`,
          text: opt.text || '✎ 自由输入...',
          disabled: false,
          confidence: opt.confidence,
          action: 'free_input',
          isFreeInput: true,
        });
        continue;
      }

      // 查找目标映射
      let target = opt.target;
      if (!target && opt.action === 'scene') {
        // 尝试从出口标签匹配
        const matchedExit = ctx.scene.exits?.find(
          (e) => e.label && opt.text.includes(e.label)
        );
        target = matchedExit?.target;
      }
      if (!target && opt.action === 'combat') {
        target = ctx.scene.combat?.enemies?.[0];
      }

      choices.push({
        id: `llm_opt_${i}_${Date.now()}`,
        text: opt.text,
        disabled: false,
        confidence: opt.confidence,
        action: opt.action || 'custom',
        target,
      });
    }

    // 如果没有自由输入选项，追加一个
    if (!choices.some((c) => c.isFreeInput || c.action === 'free_input')) {
      choices.push({
        id: `free_input_default_${Date.now()}`,
        text: '✎ 自由输入...',
        disabled: false,
        confidence: 1.0,
        action: 'free_input',
        isFreeInput: true,
      });
    }

    // 按 confidence 降序排列
    choices.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    return choices;
  }

  /**
   * LLM 不可用时的回退选项：基于场景数据生成基本选项
   */
  private buildFallbackOptions(ctx: GenerateOptionsContext): VNChoice[] {
    const scene = ctx.scene;
    const choices: VNChoice[] = [];

    // 场景出口
    if (scene.exits) {
      for (const exit of scene.exits) {
        choices.push({
          id: `exit_${exit.target}`,
          text: `前往 ${exit.label || exit.target}`,
          disabled: false,
          confidence: 0.85,
          action: 'scene',
          target: exit.target,
        });
      }
    }

    // 互动物品
    if (scene.interactables) {
      for (const itemId of scene.interactables) {
        const item = ctx.module.items?.[itemId];
        if (item) {
          choices.push({
            id: `interact_${itemId}`,
            text: `检查 ${item.name}`,
            disabled: false,
            confidence: 0.8,
            action: 'custom',
            target: itemId,
          });
        }
      }
    }

    // NPC 对话
    if (scene.npcs) {
      for (const npcId of scene.npcs) {
        const npc = ctx.module.npcs?.[npcId];
        if (npc) {
          choices.push({
            id: `talk_${npcId}`,
            text: `与 ${npc.name} 对话`,
            disabled: false,
            confidence: 0.8,
            action: 'custom',
            target: npcId,
          });
        }
      }
    }

    // 战斗
    if (scene.combat?.enabled) {
      choices.push({
        id: `combat_${scene.id}`,
        text: '⚔ 进入战斗',
        disabled: false,
        confidence: 0.75,
        action: 'combat',
      });
    }

    // 自由输入
    choices.push({
      id: `free_input_fallback_${Date.now()}`,
      text: '✎ 自由输入...',
      disabled: false,
      confidence: 1.0,
      action: 'free_input',
      isFreeInput: true,
    });

    return choices;
  }
}

export default LLMOptionGenerator;
