import type { LLMClient } from '../llm/client';

/**
 * Intent Parser for AI-GM
 * Transforms free-form player input into structured game intents.
 *
 * Supported intents:
 * - chat:    闲聊、与NPC对话、非指令性输入
 * - combat:  进入战斗、攻击、使用战斗技能
 * - event:   触发剧情事件、推进主线
 * - save:    存档、读档、保存游戏
 * - settings: 修改设置、调整参数
 * - explore:  探索场景、移动、检查物品、调查环境
 *
 * Output shape: { intent, confidence, extractedParams }
 */

export type GameIntent = 'chat' | 'combat' | 'event' | 'save' | 'settings' | 'explore';

export interface IntentResult {
  intent: GameIntent;
  confidence: number; // 0.0 - 1.0
  extractedParams: Record<string, unknown>;
}

export interface IntentParserOptions {
  /** 使用LLM解析的置信度阈值，低于此值会fallback到关键词解析 */
  llmConfidenceThreshold?: number;
  /** LLM解析失败时是否静默fallback（默认true） */
  silentFallback?: boolean;
  /** 是否启用缓存 */
  enableCache?: boolean;
}

/**
 * 参数提取器：从玩家输入中提取结构化参数
 * 例如：「用枪攻击左边的敌人」→ { weapon: 'gun', target: 'left enemy' }
 */
interface ParamExtractor {
  paramName: string;
  patterns: RegExp[];
  extract: (matches: RegExpMatchArray[]) => unknown;
}

export class IntentParser {
  private llmClient: LLMClient | null;
  private options: Required<IntentParserOptions>;
  private cache: Map<string, IntentResult>;
  private paramExtractors: ParamExtractor[];

  constructor(llmClient: LLMClient | null = null, options: IntentParserOptions = {}) {
    this.llmClient = llmClient;
    this.options = {
      llmConfidenceThreshold: options.llmConfidenceThreshold ?? 0.7,
      silentFallback: options.silentFallback ?? true,
      enableCache: options.enableCache ?? true,
    };
    this.cache = new Map();
    this.paramExtractors = this._buildParamExtractors();
  }

  /**
   * 解析玩家输入意图
   * 优先尝试LLM解析（如果可用），否则使用关键词解析
   */
  async parse(input: string): Promise<IntentResult> {
    if (!input || typeof input !== 'string') {
      return { intent: 'chat', confidence: 1.0, extractedParams: {} };
    }

    const normalizedInput = input.trim();
    if (!normalizedInput) {
      return { intent: 'chat', confidence: 1.0, extractedParams: {} };
    }

    // 检查缓存
    if (this.options.enableCache) {
      const cached = this._getCached(normalizedInput);
      if (cached) return cached;
    }

    let result: IntentResult;

    // 优先尝试LLM解析
    if (this.llmClient?.isAvailable()) {
      try {
        result = await this._llmParse(normalizedInput);
        if (result.confidence >= this.options.llmConfidenceThreshold) {
          if (this.options.enableCache) this._setCache(normalizedInput, result);
          return result;
        }
        // LLM置信度不足，fallback到关键词
        const keywordResult = this._keywordParse(normalizedInput);
        // 合并：取LLM的intent（如果高于阈值）否则用关键词的，但参数用LLM提取的
        result = {
          intent: keywordResult.confidence > result.confidence ? keywordResult.intent : result.intent,
          confidence: Math.max(result.confidence, keywordResult.confidence),
          extractedParams: { ...keywordResult.extractedParams, ...result.extractedParams },
        };
      } catch (err) {
        if (!this.options.silentFallback) throw err;
        result = this._keywordParse(normalizedInput);
      }
    } else {
      // LLM不可用，纯关键词解析
      result = this._keywordParse(normalizedInput);
    }

    if (this.options.enableCache) this._setCache(normalizedInput, result);
    return result;
  }

  /**
   * 批量解析（用于对话历史分析等场景）
   */
  async parseBatch(inputs: string[]): Promise<IntentResult[]> {
    return Promise.all(inputs.map((input) => this.parse(input)));
  }

  /**
   * 检查意图是否匹配目标类型（支持数组匹配）
   */
  isIntent(result: IntentResult, target: GameIntent | GameIntent[]): boolean {
    if (Array.isArray(target)) return target.includes(result.intent);
    return result.intent === target;
  }

  /**
   * 更新LLM客户端（动态切换模型等场景）
   */
  setLLMClient(client: LLMClient | null): void {
    this.llmClient = client;
  }

  /**
   * 清除解析缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ─── LLM 解析 ───────────────────────────────────────────

  private async _llmParse(input: string): Promise<IntentResult> {
    const systemPrompt = `You are a TRPG game intent classifier. Analyze the player's free-form input and classify it into exactly ONE of the following categories:

- chat: Casual conversation, roleplay, talking to NPCs, asking questions, banter
- combat: Fighting, attacking, casting combat spells, using weapons, entering battle
- event: Triggering plot events, advancing story, making story-critical choices
- save: Saving game, loading game, managing save files
- settings: Changing game settings, adjusting difficulty, modifying preferences
- explore: Moving between locations, examining items, investigating environment, searching

Respond ONLY with a JSON object in this exact format:
{"intent": "<category>", "confidence": 0.0-1.0, "extractedParams": {"key": "value"}}

Rules:
1. confidence must reflect your certainty (1.0 = absolutely sure, 0.5 = ambiguous)
2. extractedParams should capture any entities mentioned (item names, NPC names, directions, numbers)
3. If the input is ambiguous, choose the most likely intent but lower confidence
4. Keep extractedParams empty {} if no specific entities are detected`;

    const userPrompt = `Player input: "${input}"`;

    const response = await this.llmClient!.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 256, temperature: 0.1 },
    );

    if (!response?.content) {
      throw new Error('LLM returned empty response');
    }

    const parsed = this._extractJSON(response.content);
    if (!parsed || !parsed.intent) {
      throw new Error('LLM returned invalid format');
    }

    const intent = this._normalizeIntent(parsed.intent);
    const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));

    return {
      intent,
      confidence,
      extractedParams: this._normalizeParams(parsed.extractedParams || {}),
    };
  }

  // ─── 关键词解析 ─────────────────────────────────────────

  private _keywordParse(input: string): IntentResult {
    const normalized = input.toLowerCase().trim();
    const scores: Record<GameIntent, number> = {
      chat: 0,
      combat: 0,
      event: 0,
      save: 0,
      settings: 0,
      explore: 0,
    };

    // 关键词权重映射
    const keywordMap: Record<string, GameIntent[]> = {
      // save
      '存档': ['save'],
      '保存': ['save'],
      '读档': ['save'],
      '加载': ['save'],
      'save': ['save'],
      'load': ['save'],
      '存档点': ['save'],
      // settings
      '设置': ['settings'],
      '配置': ['settings'],
      '选项': ['settings'],
      '难度': ['settings'],
      'settings': ['settings'],
      'options': ['settings'],
      'config': ['settings'],
      'preference': ['settings'],
      // combat
      '攻击': ['combat'],
      '战斗': ['combat'],
      '打': ['combat'],
      '杀': ['combat'],
      '防御': ['combat'],
      '闪避': ['combat'],
      '法术': ['combat'],
      'attack': ['combat'],
      'fight': ['combat'],
      'combat': ['combat'],
      'strike': ['combat'],
      'shoot': ['combat'],
      'cast': ['combat'],
      'defend': ['combat'],
      'dodge': ['combat'],
      // explore
      '去': ['explore'],
      '走': ['explore'],
      '到': ['explore'],
      '前往': ['explore'],
      '看': ['explore'],
      '检查': ['explore'],
      '观察': ['explore'],
      '调查': ['explore'],
      '搜索': ['explore'],
      '拿': ['explore'],
      '取': ['explore'],
      '打开': ['explore'],
      '进入': ['explore'],
      '离开': ['explore'],
      'go': ['explore'],
      'move': ['explore'],
      'walk': ['explore'],
      'look': ['explore'],
      'check': ['explore'],
      'examine': ['explore'],
      'inspect': ['explore'],
      'search': ['explore'],
      'pick': ['explore'],
      'take': ['explore'],
      'open': ['explore'],
      'enter': ['explore'],
      'leave': ['explore'],
      'investigate': ['explore'],
      // event
      '触发': ['event'],
      '剧情': ['event'],
      '任务': ['event'],
      '推进': ['event'],
      '选择': ['event'],
      'event': ['event'],
      'quest': ['event'],
      'story': ['event'],
      'plot': ['event'],
      'choice': ['event'],
      'progress': ['event'],
      'advance': ['event'],
      // chat (低权重，作为默认)
      '说': ['chat'],
      '问': ['chat'],
      '对话': ['chat'],
      '聊天': ['chat'],
      'talk': ['chat'],
      'say': ['chat'],
      'ask': ['chat'],
      'chat': ['chat'],
      'speak': ['chat'],
      'tell': ['chat'],
    };

    for (const [keyword, intents] of Object.entries(keywordMap)) {
      if (normalized.includes(keyword.toLowerCase())) {
        for (const intent of intents) {
          scores[intent] += 1;
        }
      }
    }

    // 提取参数
    const extractedParams = this._extractParams(input);

    // 找最高分
    let bestIntent: GameIntent = 'chat'; // 默认chat
    let maxScore = 0;
    for (const [intent, score] of Object.entries(scores) as [GameIntent, number][]) {
      if (score > maxScore) {
        maxScore = score;
        bestIntent = intent;
      }
    }

    // 计算confidence：基于分数，无匹配则0.3，有匹配则min(0.3 + score*0.2, 0.9)
    const confidence = maxScore === 0 ? 0.3 : Math.min(0.3 + maxScore * 0.2, 0.9);

    return { intent: bestIntent, confidence, extractedParams };
  }

  // ─── 参数提取 ───────────────────────────────────────────

  private _extractParams(input: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    for (const extractor of this.paramExtractors) {
      const matches: RegExpMatchArray[] = [];
      for (const pattern of extractor.patterns) {
        const match = input.match(pattern);
        if (match) matches.push(match);
      }
      if (matches.length > 0) {
        try {
          params[extractor.paramName] = extractor.extract(matches);
        } catch {
          // 忽略提取失败的参数
        }
      }
    }

    return params;
  }

  private _buildParamExtractors(): ParamExtractor[] {
    return [
      {
        paramName: 'direction',
        patterns: [
          /(?:往|向|去|走到|前往|去)(东|西|南|北|上|下|左|右|前|后)/,
          /\b(go|move|walk|head)\s+(north|south|east|west|up|down|left|right|forward|back)\b/i,
          /\b(north|south|east|west|up|down|left|right)\b/i,
        ],
        extract: (matches) => {
          const m = matches[0];
          return m[1] || m[0];
        },
      },
      {
        paramName: 'target',
        patterns: [
          /(?:攻击|打|杀|对|跟|和|与)(.+?)(?:使用|用|施展|发出|进行)/,
          /(?:攻击|打|杀)(.+?)(?:\.|$|，)/,
          /\b(attack|fight|hit|strike|shoot)\s+(?:the\s+)?(.+?)(?:\s+with|\.|$)/i,
          /\btalk\s+(?:to\s+)?(?:the\s+)?(.+?)(?:\.|$|，)/i,
        ],
        extract: (matches) => {
          for (const m of matches) {
            const target = m[1] || m[2];
            if (target) return target.trim();
          }
          return null;
        },
      },
      {
        paramName: 'item',
        patterns: [
          /(?:使用|用|拿|取|捡起|打开|检查|看)(.+?)(?:\.|$|，|来|去)/,
          /\b(use|take|pick\s+up|open|check|examine|inspect)\s+(?:the\s+)?(.+?)(?:\.|$|，)/i,
        ],
        extract: (matches) => {
          for (const m of matches) {
            const item = m[1] || m[2];
            if (item) return item.trim();
          }
          return null;
        },
      },
      {
        paramName: 'skill',
        patterns: [
          /(?:使用|施展|进行)(.+?)(?:检定|技能|法术|攻击)/,
          /\b(cast|use)\s+(.+?)(?:\.|$|，)/i,
        ],
        extract: (matches) => {
          for (const m of matches) {
            const skill = m[1] || m[2];
            if (skill) return skill.trim();
          }
          return null;
        },
      },
      {
        paramName: 'scene',
        patterns: [
          /(?:去|到|前往|进入|离开)(.+?)(?:房间|地方|场景|区域|里|中)/,
          /\b(go\s+to|enter|leave|exit)\s+(?:the\s+)?(.+?)(?:\.|$|，)/i,
        ],
        extract: (matches) => {
          for (const m of matches) {
            const scene = m[1] || m[2];
            if (scene) return scene.trim();
          }
          return null;
        },
      },
    ];
  }

  // ─── 工具方法 ───────────────────────────────────────────

  private _normalizeIntent(raw: string): GameIntent {
    const map: Record<string, GameIntent> = {
      chat: 'chat',
      talk: 'chat',
      conversation: 'chat',
      combat: 'combat',
      fight: 'combat',
      battle: 'combat',
      attack: 'combat',
      event: 'event',
      story: 'event',
      plot: 'event',
      quest: 'event',
      save: 'save',
      load: 'save',
      settings: 'settings',
      config: 'settings',
      options: 'settings',
      preference: 'settings',
      explore: 'explore',
      move: 'explore',
      walk: 'explore',
      investigate: 'explore',
      search: 'explore',
      examine: 'explore',
    };
    return map[raw.toLowerCase().trim()] || 'chat';
  }

  private _normalizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== '') {
        result[key] = value;
      }
    }
    return result;
  }

  private _extractJSON(text: string): any {
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

  private _getCacheKey(input: string): string {
    return input.toLowerCase().trim();
  }

  private _getCached(input: string): IntentResult | null {
    const key = this._getCacheKey(input);
    return this.cache.get(key) || null;
  }

  private _setCache(input: string, result: IntentResult): void {
    const key = this._getCacheKey(input);
    this.cache.set(key, result);
  }
}

export default IntentParser;
