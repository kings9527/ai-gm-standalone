/**
 * emotion-engine.ts
 * 情绪/氛围引擎
 * ① 根据场景和事件动态调整氛围（紧张/平静/恐怖/温馨等）
 * ② 氛围影响 LLM 生成文本的语调和风格
 * ③ 氛围变化触发视觉/音效反馈（背景音乐、色调变化）
 */

import type { Module, Scene } from '../types/module';

/** 游戏氛围类型 */
export type AtmosphereType =
  | 'tense'      // 紧张 — 追逐、倒计时、危险逼近
  | 'calm'       // 平静 — 日常、安全区域
  | 'horror'     // 恐怖 — 克苏鲁san check、不可名状之物
  | 'warm'       // 温馨 — 角色互动、安全屋
  | 'epic'       // 史诗 — 战斗高潮、关键剧情转折
  | 'mystery'    // 悬疑 — 调查、线索收集
  | 'sad'        // 悲伤 — 失去、告别、悲剧
  | 'peaceful';  // 宁静 — 自然、休息、探索

/** 氛围配置：色调、特效、音效提示、LLM风格 */
export interface AtmosphereConfig {
  type: AtmosphereType;
  /** 背景色调叠加：CSS 颜色值，覆盖在背景上 */
  overlayColor: string;
  /** 背景叠加透明度 0-1 */
  overlayOpacity: number;
  /** 暗角强度：0-1 */
  vignetteIntensity: number;
  /** 色温差：CSS filter sepia 值 */
  colorTemperature: number;
  /** 对比度增强：CSS filter contrast 值 */
  contrastBoost: number;
  /** 推荐特效列表 */
  recommendedEffects: Array<{
    type: 'grain' | 'chromatic' | 'flash' | 'vignette' | 'shake';
    intensity: number;
    duration: number;
  }>;
  /** LLM 语调风格提示 */
  tonePrompt: string;
  /** 字体颜色建议（hex） */
  suggestedTextColor: string;
  /** 强调色建议（hex） */
  suggestedAccentColor: string;
  /** 背景音效提示（用于后续集成真实音频） */
  ambientSoundHint: string;
  /** 氛围优先级（越高越不容易被覆盖） */
  priority: number;
}

/** 氛围变化事件 */
export interface AtmosphereEvent {
  source: 'scene' | 'combat' | 'npc' | 'story' | 'sanity' | 'manual';
  /** 触发原因描述 */
  reason: string;
  /** 建议氛围类型 */
  suggestedAtmosphere: AtmosphereType;
  /** 强度 0-1 */
  intensity: number;
  /** 持续时间（ms），0 表示永久 */
  duration: number;
}

/** 氛围变化回调 */
export interface AtmosphereCallbacks {
  onAtmosphereChange?: (prev: AtmosphereConfig | null, next: AtmosphereConfig, event: AtmosphereEvent) => void;
  onVisualFeedback?: (effects: AtmosphereConfig['recommendedEffects']) => void;
}

/** 氛围引擎配置映射表 */
const ATMOSPHERE_CONFIGS: Record<AtmosphereType, AtmosphereConfig> = {
  tense: {
    type: 'tense',
    overlayColor: '#ff3300',
    overlayOpacity: 0.08,
    vignetteIntensity: 0.5,
    colorTemperature: 0.2,
    contrastBoost: 1.15,
    recommendedEffects: [
      { type: 'vignette', intensity: 0.6, duration: 2000 },
      { type: 'grain', intensity: 0.04, duration: 3000 },
    ],
    tonePrompt: '你现在的叙事风格应紧张急促。使用短句、断续的呼吸感。描述环境时强调危险信号——声音、阴影、气味。角色内心独白应充满焦虑和自我怀疑。避免任何轻松的描述。',
    suggestedTextColor: '#ffcccc',
    suggestedAccentColor: '#ff3300',
    ambientSoundHint: '心跳声、低语、风声、金属摩擦',
    priority: 70,
  },
  calm: {
    type: 'calm',
    overlayColor: '#4a90a4',
    overlayOpacity: 0.05,
    vignetteIntensity: 0.2,
    colorTemperature: 0.0,
    contrastBoost: 1.0,
    recommendedEffects: [
      { type: 'vignette', intensity: 0.2, duration: 2000 },
    ],
    tonePrompt: '你现在的叙事风格应平静从容。使用中长句，描述细节清晰。环境描写应温和、安全，带有一种日常感。角色对话自然，节奏舒缓。',
    suggestedTextColor: '#e2e8f0',
    suggestedAccentColor: '#4a90a4',
    ambientSoundHint: '环境白噪音、微弱的室内音',
    priority: 30,
  },
  horror: {
    type: 'horror',
    overlayColor: '#330000',
    overlayOpacity: 0.15,
    vignetteIntensity: 0.85,
    colorTemperature: 0.4,
    contrastBoost: 1.25,
    recommendedEffects: [
      { type: 'vignette', intensity: 0.85, duration: 3000 },
      { type: 'grain', intensity: 0.06, duration: 5000 },
      { type: 'chromatic', intensity: 0.3, duration: 2000 },
    ],
    tonePrompt: '你现在的叙事风格应充满恐怖与不安。描述应隐晦、暗示性强，留白让恐惧来自玩家的想象。避免直接描述血腥，而是描述"不对劲"的感觉。感官描写扭曲：光线看起来是"活着的"，声音有"重量"。当提及不可名状之物时，文字应变得破碎、不连贯。',
    suggestedTextColor: '#d4a5a5',
    suggestedAccentColor: '#8b0000',
    ambientSoundHint: '低频嗡鸣、尖锐耳鸣、不规则回声',
    priority: 90,
  },
  warm: {
    type: 'warm',
    overlayColor: '#d4a574',
    overlayOpacity: 0.06,
    vignetteIntensity: 0.15,
    colorTemperature: -0.1,
    contrastBoost: 0.95,
    recommendedEffects: [
      { type: 'vignette', intensity: 0.15, duration: 2000 },
    ],
    tonePrompt: '你现在的叙事风格应温暖、亲密。描述人际关系时使用温柔的措辞。光线应被描述为"柔软"、"包裹"。场景中有家的感觉、安全、被理解。对话中可加入笑声和默契。',
    suggestedTextColor: '#fff0e0',
    suggestedAccentColor: '#d4a574',
    ambientSoundHint: '壁炉噼啪、茶杯轻碰、远处钢琴',
    priority: 40,
  },
  epic: {
    type: 'epic',
    overlayColor: '#ffd700',
    overlayOpacity: 0.06,
    vignetteIntensity: 0.3,
    colorTemperature: -0.05,
    contrastBoost: 1.1,
    recommendedEffects: [
      { type: 'flash', intensity: 0.3, duration: 400 },
      { type: 'shake', intensity: 0.4, duration: 600 },
    ],
    tonePrompt: '你现在的叙事风格应宏大、史诗感。使用充满力量的修辞，场景描写具有电影感。动作描述应清晰有力，关键时刻使用短句。胜利时刻带有悲壮感，失败时刻带有不屈的意志。',
    suggestedTextColor: '#fff5cc',
    suggestedAccentColor: '#ffd700',
    ambientSoundHint: '号角、战鼓、雷鸣、风雷',
    priority: 80,
  },
  mystery: {
    type: 'mystery',
    overlayColor: '#2a0a5a',
    overlayOpacity: 0.08,
    vignetteIntensity: 0.6,
    colorTemperature: 0.15,
    contrastBoost: 1.05,
    recommendedEffects: [
      { type: 'vignette', intensity: 0.6, duration: 3000 },
      { type: 'grain', intensity: 0.04, duration: 4000 },
    ],
    tonePrompt: '你现在的叙事风格应充满悬疑和未解之谜。描述中应埋下细节伏笔，暗示性而非陈述性。环境描写突出"被隐藏"的感觉——阴影中的轮廓、半开的门、未完成的句子。调查过程应是层层剥茧，每一次发现都引出更多问题。',
    suggestedTextColor: '#c8b8e8',
    suggestedAccentColor: '#6a4caf',
    ambientSoundHint: '滴答声、远处脚步声、纸张翻动、雨声',
    priority: 60,
  },
  sad: {
    type: 'sad',
    overlayColor: '#1a237e',
    overlayOpacity: 0.1,
    vignetteIntensity: 0.4,
    colorTemperature: 0.1,
    contrastBoost: 0.9,
    recommendedEffects: [
      { type: 'vignette', intensity: 0.4, duration: 3000 },
      { type: 'grain', intensity: 0.03, duration: 4000 },
    ],
    tonePrompt: '你现在的叙事风格应悲伤而克制。使用间接情感描写——通过环境反映内心（雨、灰色天空、凋谢的花）。对话简短，带有未尽之意。角色内心独白是回望式的，带着遗憾。避免过度煽情，让悲伤在沉默中显现。',
    suggestedTextColor: '#aabbdd',
    suggestedAccentColor: '#4a63a0',
    ambientSoundHint: '雨声、远处钟声、风声、静默',
    priority: 65,
  },
  peaceful: {
    type: 'peaceful',
    overlayColor: '#2d5a4a',
    overlayOpacity: 0.04,
    vignetteIntensity: 0.1,
    colorTemperature: -0.05,
    contrastBoost: 1.0,
    recommendedEffects: [
      { type: 'vignette', intensity: 0.1, duration: 2000 },
    ],
    tonePrompt: '你现在的叙事风格应宁静祥和。描述自然环境的细节——光线、风、气味。节奏缓慢，给予玩家思考空间。角色的内心是清晰的，没有冲突。文字像是"呼吸"。',
    suggestedTextColor: '#d0e8d0',
    suggestedAccentColor: '#2d8a6a',
    ambientSoundHint: '鸟鸣、流水、风声、树叶沙沙',
    priority: 25,
  },
};

/** 关键词到氛围的映射 */
const KEYWORD_ATMOSPHERE_MAP: Record<string, AtmosphereType> = {
  // 恐怖
  恐怖: 'horror', 恐惧: 'horror', 怪物: 'horror', 尸体: 'horror', 血迹: 'horror',
  疯狂: 'horror', 不可名状: 'horror', 邪神: 'horror', 诅咒: 'horror', 仪式: 'horror',
  // 紧张
  追逐: 'tense', 逃跑: 'tense', 倒计时: 'tense', 警报: 'tense', 包围: 'tense',
  陷阱: 'tense', 危险: 'tense', 警告: 'tense', 惊觉: 'tense', 暗处: 'tense',
  // 悬疑
  调查: 'mystery', 线索: 'mystery', 谜题: 'mystery', 密码: 'mystery', 隐藏: 'mystery',
  秘密: 'mystery', 档案: 'mystery', 推理: 'mystery', 证据: 'mystery', 失踪: 'mystery',
  // 战斗/史诗
  战斗: 'epic', 敌人: 'epic', 攻击: 'epic', 武器: 'epic', 决战: 'epic',
  冲锋: 'epic', 胜利: 'epic', 牺牲: 'epic', 英雄: 'epic',
  // 温馨
  安全屋: 'warm', 回忆: 'warm', 拥抱: 'warm', 茶: 'warm', 温暖: 'warm',
  炉火: 'warm', 家庭: 'warm', 朋友: 'warm', 信任: 'warm',
  // 悲伤
  死亡: 'sad', 失去: 'sad', 告别: 'sad', 眼泪: 'sad', 葬礼: 'sad',
  遗憾: 'sad', 孤独: 'sad', 破碎: 'sad', 废墟: 'sad',
  // 平静/宁静
  森林: 'peaceful', 湖泊: 'peaceful', 星空: 'peaceful', 清晨: 'peaceful',
  花园: 'peaceful', 小路: 'peaceful', 冥想: 'peaceful', 安息: 'peaceful',
  // 平静
  图书馆: 'calm', 办公室: 'calm', 商店: 'calm', 街道: 'calm', 等待: 'calm',
};

/** 场景标题/描述关键词到氛围的映射 */
const SCENE_ATMOSPHERE_HINTS: Record<string, AtmosphereType> = {
  'san_check': 'horror',
  'combat': 'epic',
  'battle': 'epic',
  'fight': 'epic',
  'investigate': 'mystery',
  'clue': 'mystery',
  'chase': 'tense',
  'escape': 'tense',
  'hide': 'tense',
  'safe': 'warm',
  'rest': 'peaceful',
  'camp': 'peaceful',
  'fire': 'warm',
  'death': 'sad',
  'loss': 'sad',
};

/**
 * 情绪/氛围引擎
 * 根据场景、事件、关键词自动推断并管理游戏氛围
 */
export class EmotionEngine {
  private currentAtmosphere: AtmosphereType | null = null;
  private currentConfig: AtmosphereConfig | null = null;
  private callbacks: AtmosphereCallbacks = {};
  private durationTimer: ReturnType<typeof setTimeout> | null = null;
  private module: Module | null = null;

  constructor(callbacks?: AtmosphereCallbacks) {
    this.callbacks = callbacks || {};
  }

  /** 设置模块上下文（用于场景分析） */
  setModule(module: Module) {
    this.module = module;
  }

  /** 获取当前氛围配置 */
  getCurrentConfig(): AtmosphereConfig | null {
    return this.currentConfig;
  }

  /** 获取当前氛围类型 */
  getCurrentAtmosphere(): AtmosphereType | null {
    return this.currentAtmosphere;
  }

  /**
   * 分析场景并推断氛围
   * 综合：场景标题、描述、关键词、NPC 标签、战斗配置
   */
  analyzeScene(scene: Scene): AtmosphereEvent | null {
    const scores: Record<AtmosphereType, number> = {
      tense: 0, calm: 0, horror: 0, warm: 0, epic: 0, mystery: 0, sad: 0, peaceful: 0,
    };

    const text = `${scene.title || ''} ${scene.description || ''} ${(scene as any).tags?.join(' ') || ''}`.toLowerCase();

    // 1. 关键词匹配打分
    for (const [keyword, atmos] of Object.entries(KEYWORD_ATMOSPHERE_MAP)) {
      if (text.includes(keyword)) {
        scores[atmos] += 1;
      }
    }

    // 2. 场景标题/ID 暗示
    for (const [hint, atmos] of Object.entries(SCENE_ATMOSPHERE_HINTS)) {
      if (scene.id.toLowerCase().includes(hint) || (scene.title || '').toLowerCase().includes(hint)) {
        scores[atmos] += 2;
      }
    }

    // 3. 战斗配置 → epic
    if (scene.combat?.enabled && scene.combat.enemies.length > 0) {
      scores.epic += 3;
    }

    // 4. SAN 检查配置 → horror (使用可选属性)
    if ((scene as any).san_check || (scene as any).sanity_check) {
      scores.horror += 3;
    }

    // 5. 检查 NPC 标签
    if (scene.npcs && scene.npcs.length > 0 && this.module?.npcs) {
      for (const npcId of scene.npcs) {
        const npc: any = this.module.npcs[npcId];
        if (npc?.tags) {
          for (const tag of npc.tags as string[]) {
            const mapped = KEYWORD_ATMOSPHERE_MAP[tag] || SCENE_ATMOSPHERE_HINTS[tag.toLowerCase()];
            if (mapped) scores[mapped] += 1;
          }
        }
        // 敌对 NPC 增加 tension
        if (npc?.attitude === 'hostile' || npc?.attitude === 'enemy') {
          scores.tense += 1;
          scores.epic += 0.5;
        }
        // 友善 NPC 增加 warmth
        if (npc?.attitude === 'friendly' || npc?.attitude === 'ally') {
          scores.warm += 1;
        }
      }
    }

    // 找出最高分
    let maxScore = 0;
    let maxAtmosphere: AtmosphereType | null = null;
    for (const [atmos, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxAtmosphere = atmos as AtmosphereType;
      }
    }

    // 最低阈值：如果没有任何匹配，默认 calm
    if (maxScore < 0.5) {
      maxAtmosphere = 'calm';
      maxScore = 0.5;
    }

    const intensity = Math.min(maxScore / 4, 1);

    return {
      source: 'scene',
      reason: `场景分析：${scene.title || scene.id} → 关键词匹配得分 ${maxScore.toFixed(1)}`,
      suggestedAtmosphere: maxAtmosphere!,
      intensity,
      duration: 0, // 场景氛围是持久的
    };
  }

  /**
   * 根据事件触发氛围变化
   */
  triggerEvent(event: AtmosphereEvent): boolean {
    const newConfig = ATMOSPHERE_CONFIGS[event.suggestedAtmosphere];

    // 如果当前氛围优先级更高，且新事件不是强制覆盖，则保留
    if (
      this.currentConfig &&
      newConfig.priority < this.currentConfig.priority &&
      event.source !== 'combat' &&
      event.source !== 'sanity'
    ) {
      return false; // 被高优先级氛围覆盖，未触发变化
    }

    const prev = this.currentConfig;
    this.currentAtmosphere = event.suggestedAtmosphere;
    this.currentConfig = newConfig;

    // 清除之前的定时器
    if (this.durationTimer) {
      clearTimeout(this.durationTimer);
      this.durationTimer = null;
    }

    // 如果是限时氛围，设置恢复定时器
    if (event.duration > 0) {
      this.durationTimer = setTimeout(() => {
        this.revertToSceneAtmosphere();
      }, event.duration);
    }

    // 触发回调
    this.callbacks.onAtmosphereChange?.(prev, newConfig, event);
    this.callbacks.onVisualFeedback?.(newConfig.recommendedEffects);

    return true;
  }

  /**
   * 手动设置氛围（用于玩家或 GM 强制切换）
   */
  setAtmosphere(type: AtmosphereType, reason: string, duration = 0): boolean {
    return this.triggerEvent({
      source: 'manual',
      reason,
      suggestedAtmosphere: type,
      intensity: 1,
      duration,
    });
  }

  /**
   * 触发战斗氛围
   */
  triggerCombat(intensity = 1): boolean {
    return this.triggerEvent({
      source: 'combat',
      reason: '战斗开始',
      suggestedAtmosphere: 'epic',
      intensity,
      duration: 0,
    });
  }

  /**
   * 触发 SAN 检查/恐怖事件
   */
  triggerHorror(intensity = 1, duration = 5000): boolean {
    return this.triggerEvent({
      source: 'sanity',
      reason: 'SAN 值下降/恐怖事件',
      suggestedAtmosphere: 'horror',
      intensity,
      duration,
    });
  }

  /**
   * 触发 NPC 对话氛围
   */
  triggerNPCDialogue(npcAttitude?: string, emotion?: string): boolean {
    let type: AtmosphereType = 'calm';
    if (emotion?.includes('angry') || emotion?.includes('hostile')) type = 'tense';
    else if (emotion?.includes('sad') || emotion?.includes('grief')) type = 'sad';
    else if (emotion?.includes('mysterious') || emotion?.includes('secret')) type = 'mystery';
    else if (npcAttitude === 'friendly' || npcAttitude === 'ally') type = 'warm';
    else if (npcAttitude === 'hostile' || npcAttitude === 'enemy') type = 'tense';

    return this.triggerEvent({
      source: 'npc',
      reason: `NPC 对话：${emotion || npcAttitude || 'neutral'}`,
      suggestedAtmosphere: type,
      intensity: 0.7,
      duration: 3000, // NPC 对话氛围短暂
    });
  }

  /**
   * 触发剧情事件氛围
   */
  triggerStoryEvent(eventType: 'discovery' | 'betrayal' | 'revelation' | 'death' | 'victory' | 'loss'): boolean {
    const map: Record<string, AtmosphereType> = {
      discovery: 'mystery',
      betrayal: 'tense',
      revelation: 'mystery',
      death: 'sad',
      victory: 'epic',
      loss: 'sad',
    };
    return this.triggerEvent({
      source: 'story',
      reason: `剧情事件：${eventType}`,
      suggestedAtmosphere: map[eventType] || 'calm',
      intensity: 0.8,
      duration: 4000,
    });
  }

  /**
   * 恢复到当前场景的氛围（场景切换后调用）
   */
  revertToSceneAtmosphere(scene?: Scene): void {
    if (scene) {
      const event = this.analyzeScene(scene);
      if (event) this.triggerEvent(event);
    } else if (this.module) {
      // 尝试从当前战役状态推断场景
      // 此处由外部调用时传入 scene，避免直接依赖 gameStore
    }
  }

  /**
   * 生成 LLM 语调风格提示（追加到 system prompt 中）
   */
  getTonePrompt(): string {
    if (!this.currentConfig) return '';
    return this.currentConfig.tonePrompt;
  }

  /**
   * 生成完整的 CSS 滤镜字符串（应用于背景层）
   */
  getCSSFilter(): string {
    if (!this.currentConfig) return '';
    const { colorTemperature, contrastBoost } = this.currentConfig;
    const filters: string[] = [];
    if (colorTemperature !== 0) filters.push(`sepia(${Math.abs(colorTemperature)})`);
    if (contrastBoost !== 1) filters.push(`contrast(${contrastBoost})`);
    return filters.join(' ');
  }

  /**
   * 生成氛围叠加层样式（用于 BackgroundLayer）
   */
  getOverlayStyle(): React.CSSProperties {
    if (!this.currentConfig) return {};
    return {
      backgroundColor: this.currentConfig.overlayColor,
      opacity: this.currentConfig.overlayOpacity,
      mixBlendMode: 'multiply',
    };
  }

  /**
   * 获取暗角样式（用于 vignette 增强）
   */
  getVignetteStyle(): React.CSSProperties {
    if (!this.currentConfig) return {};
    return {
      boxShadow: `inset 0 0 ${150 + this.currentConfig.vignetteIntensity * 100}px ${60 + this.currentConfig.vignetteIntensity * 40}px rgba(0,0,0,${0.7 + this.currentConfig.vignetteIntensity * 0.2})`,
    };
  }

  /**
   * 获取建议的 CSS 变量更新（用于动态主题）
   */
  getCSSVariables(): Record<string, string> {
    if (!this.currentConfig) return {};
    return {
      '--agm-text': this.currentConfig.suggestedTextColor,
      '--agm-accent': this.currentConfig.suggestedAccentColor,
    };
  }

  /**
   * 生成视觉特效列表（传给 EffectLayer）
   */
  getVisualEffects(): Array<{
    type: 'shake' | 'flash' | 'grain' | 'vignette' | 'chromatic';
    intensity: number;
    duration: number;
  }> {
    if (!this.currentConfig) return [];
    return this.currentConfig.recommendedEffects.map((e) => ({
      ...e,
      type: e.type as 'shake' | 'flash' | 'grain' | 'vignette' | 'chromatic',
    }));
  }

  /**
   * 生成音效提示（供后续集成）
   */
  getAmbientSoundHint(): string {
    if (!this.currentConfig) return '';
    return this.currentConfig.ambientSoundHint;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.durationTimer) {
      clearTimeout(this.durationTimer);
      this.durationTimer = null;
    }
  }
}

export default EmotionEngine;
