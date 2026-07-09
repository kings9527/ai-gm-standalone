import type { Campaign, Module, NPC, NPCState } from '../types/module';
import type { LLMClient } from '../llm/client';
import { PromptBuilder } from '../llm/prompts';

/**
 * NPC Decision Engine (ported from old project)
 * Rule-driven NPC behavior with attitude state machine.
 */

const ATTITUDE_STATES: Record<string, { hostility: number; trust_needed: number; aggression: number }> = {
  neutral: { hostility: 0, trust_needed: 40, aggression: 20 },
  friendly: { hostility: 0, trust_needed: 60, aggression: 10 },
  hostile: { hostility: 80, trust_needed: 0, aggression: 70 },
  afraid: { hostility: 10, trust_needed: 0, aggression: 5 },
  hostile_alerted: { hostility: 90, trust_needed: 0, aggression: 85 },
  hostile_fleeing: { hostility: 30, trust_needed: 0, aggression: 15 },
};

const ATTITUDE_TRANSITIONS: Record<string, Record<string, string>> = {
  player_attack: { neutral: 'hostile', friendly: 'hostile', afraid: 'hostile_fleeing', hostile: 'hostile_alerted', hostile_alerted: 'hostile_alerted', hostile_fleeing: 'hostile_fleeing' },
  player_help: { neutral: 'friendly', friendly: 'friendly', afraid: 'neutral', hostile: 'neutral', hostile_alerted: 'afraid', hostile_fleeing: 'neutral' },
  player_threat: { neutral: 'afraid', friendly: 'afraid', afraid: 'hostile_fleeing', hostile: 'hostile_alerted', hostile_alerted: 'hostile_alerted', hostile_fleeing: 'hostile_fleeing' },
  combat_start: { neutral: 'hostile', friendly: 'hostile', afraid: 'hostile_fleeing', hostile: 'hostile_alerted', hostile_alerted: 'hostile_alerted', hostile_fleeing: 'hostile_fleeing' },
  combat_end_player_win: { hostile: 'afraid', hostile_alerted: 'afraid', hostile_fleeing: 'afraid' },
  combat_end_player_lose: { hostile: 'neutral', hostile_alerted: 'neutral', hostile_fleeing: 'neutral' },
};

export interface NPCDecision {
  action: string;
  confidence: number;
  reasoning: string;
  mood: string;
  target_id: string | null;
  dialogue_topic?: string | null;
  llm_enhanced?: boolean;
}

export interface NPCDialogueResult {
  text: string;
  emotion: string;
  secretRevealed?: string | null;
}

export class NPCDecisionEngine {
  campaign: Campaign;
  module: Module;
  npcId: string;
  npcState: NPCState;
  npcTemplate: NPC;

  constructor(campaign: Campaign, moduleData: Module, npcId: string) {
    this.campaign = campaign;
    this.module = moduleData;
    this.npcId = npcId;
    this.npcState = this._ensureNPCState(campaign, npcId);
    this.npcTemplate = moduleData.npcs?.[npcId] || ({} as NPC);
    this._validateTemplate();
  }

  private _ensureNPCState(campaign: Campaign, npcId: string): NPCState {
    if (!campaign.npcs_state) campaign.npcs_state = {};
    if (!campaign.npcs_state[npcId]) {
      const template = this.module.npcs?.[npcId] || ({} as NPC);
      campaign.npcs_state[npcId] = {
        id: npcId,
        current_hp: template.hp || template.stats?.HP || 10,
        current_san: template.sanity || 50,
        attitude: template.attitude || 'neutral',
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
    return campaign.npcs_state[npcId];
  }

  private _validateTemplate() {
    if (!this.npcTemplate.name) { /* template validated elsewhere */ }
  }

  async decide(situation: any, llmClient: LLMClient | null, chatHistory: string = ''): Promise<NPCDecision> {
    if (!this.npcState.is_alive || this.npcState.current_hp <= 0) {
      return { action: 'dead', confidence: 1.0, reasoning: `${this.npcTemplate.name} 已死亡/无法行动`, mood: 'dead', target_id: null };
    }

    const context = this._buildContext(situation, chatHistory);

    const ruleDecision = this._ruleBasedDecision(context);
    if (ruleDecision.confidence >= 0.85) {
      this._updateAttitudeFromDecision(ruleDecision, situation);
      return ruleDecision;
    }

    const attitudeDecision = this._attitudeBasedDecision(context);
    if (attitudeDecision.confidence > 0.5) {
      this._updateAttitudeFromDecision(attitudeDecision, situation);
      return attitudeDecision;
    }

    if (llmClient?.isAvailable()) {
      try {
        const llmDecision = await this._llmEnhancedDecision(context, llmClient);
        this._updateAttitudeFromDecision(llmDecision, situation);
        return llmDecision;
      } catch (error: any) {
      /* no-op */ }
    }

    return this._defaultFallback(context);
  }

  private _buildContext(situation: any, chatHistory: string = '') {
    const player = this.campaign.player || ({} as any);
    const scene = this.module.scenes?.[this.campaign.current_scene] || ({} as any);
    const isCombat = this.campaign.combat_state?.active === true;
    const isPlayerTurn = isCombat && this.campaign.combat_state?.current_turn?.startsWith?.('player');

    return {
      npc: this.npcState,
      template: this.npcTemplate,
      situation: situation || { type: 'idle' },
      campaign_state: {
        current_scene: this.campaign.current_scene,
        player_name: player.name || '调查员',
        player_hp_ratio: (player.hp || 12) / (player.max_hp || 12),
        player_san_ratio: (player.sanity || 60) / (player.max_sanity || 60),
        is_combat: isCombat,
        is_player_turn: isPlayerTurn,
        turn_count: this.campaign.turn || 1,
        global_flags: this.campaign.flags || {},
        scene_npcs: scene.npcs || [],
        scene_enemies: scene.combat?.enemies || [],
      },
      available_actions: this._getAvailableActions(),
      chat_history: chatHistory,
    };
  }

  private _getAvailableActions(): string[] {
    const actions = ['talk', 'emote', 'ignore'];
    const role = this.npcTemplate.role || 'neutral';

    if (role === 'enemy' || role === 'Boss' || this.npcState.attitude.startsWith('hostile')) {
      actions.push('attack', 'flee');
    }
    if (role === 'Boss') {
      actions.push('special_attack', 'summon', 'warn');
    }
    if (role === 'ally' || this.npcState.attitude === 'friendly') {
      actions.push('help', 'investigate', 'heal');
    }
    if (this.npcState.attitude === 'afraid') {
      actions.push('plead', 'flee');
    }

    return actions;
  }

  private _ruleBasedDecision(context: any): NPCDecision {
    const { npc, template, situation, campaign_state } = context;
    const hpMax = template.hp || template.stats?.HP || 10;
    const hpRatio = npc.current_hp / hpMax;
    const sanRatio = npc.current_san / (template.sanity || 50);
    const role = template.role || 'neutral';
    const attitude = npc.attitude;

    if (hpRatio <= 0) {
      return { action: 'dead', confidence: 1.0, reasoning: 'HP 归零', mood: 'dead', target_id: null };
    }
    if (sanRatio <= 0.1 && role !== 'Boss') {
      return { action: 'flee', confidence: 0.92, reasoning: 'SAN 崩溃，失去理智逃跑', mood: 'terrified', target_id: 'player' };
    }

    if (hpRatio < 0.25) {
      if (role === 'enemy' || attitude === 'hostile_alerted') {
        if (role === 'Boss') {
          return { action: 'special_attack', confidence: 0.9, reasoning: 'Boss 濒死，发动特殊攻击', mood: 'desperate', target_id: 'player' };
        }
        return { action: 'flee', confidence: 0.9, reasoning: 'HP 危急，试图逃跑', mood: 'panicked', target_id: 'player' };
      }
      if (role === 'ally') {
        return { action: 'flee', confidence: 0.88, reasoning: '盟友受伤严重，寻求安全', mood: 'wounded', target_id: 'player' };
      }
    }

    if (campaign_state.is_combat) {
      if (campaign_state.is_player_turn && role !== 'Boss') {
        return { action: 'ignore', confidence: 0.7, reasoning: '玩家回合，NPC 等待', mood: 'alert', target_id: null };
      }
      if (role === 'enemy' || attitude.startsWith('hostile')) {
        if (hpRatio < 0.3 && npc.fear > 60) {
          return { action: 'flee', confidence: 0.85, reasoning: '恐惧压倒战斗意志', mood: 'terrified', target_id: 'player' };
        }
        if (role === 'Boss' && hpRatio > 0.5 && Math.random() < 0.3) {
          return { action: 'special_attack', confidence: 0.85, reasoning: 'Boss 发动强力技能', mood: 'dominant', target_id: 'player' };
        }
        return { action: 'attack', confidence: 0.9, reasoning: '战斗中进行攻击', mood: 'aggressive', target_id: 'player' };
      }
      if (role === 'ally') {
        return { action: 'help', confidence: 0.85, reasoning: '盟友协助玩家战斗', mood: 'supportive', target_id: 'player' };
      }
    }

    if (situation.type === 'player_attack') {
      npc.fear = Math.min(100, npc.fear + 30);
      npc.trust = Math.max(0, npc.trust - 40);
      if (role === 'enemy') return { action: 'attack', confidence: 0.92, reasoning: '被玩家攻击，反击', mood: 'enraged', target_id: 'player' };
      if (role === 'neutral') return { action: 'flee', confidence: 0.88, reasoning: '无辜被攻击，恐惧逃跑', mood: 'terrified', target_id: 'player' };
      if (role === 'ally') {
        npc.trust = Math.max(0, npc.trust - 60);
        return { action: 'flee', confidence: 0.85, reasoning: '盟友背叛，心碎逃离', mood: 'betrayed', target_id: 'player' };
      }
    }

    if (situation.type === 'player_help') {
      npc.trust = Math.min(100, npc.trust + 25);
      npc.fear = Math.max(0, npc.fear - 15);
      if (attitude === 'afraid') {
        return { action: 'talk', confidence: 0.88, reasoning: '玩家帮助缓解了恐惧，尝试对话', mood: 'cautious', target_id: 'player', dialogue_topic: 'thanks' };
      }
      return { action: 'talk', confidence: 0.82, reasoning: '玩家帮助，表达感谢', mood: 'grateful', target_id: 'player', dialogue_topic: 'thanks' };
    }

    if (situation.type === 'player_threat') {
      npc.fear = Math.min(100, npc.fear + 25);
      npc.suspicion = Math.min(100, npc.suspicion + 20);
      if (role === 'enemy') return { action: 'attack', confidence: 0.85, reasoning: '威胁激发敌意', mood: 'defiant', target_id: 'player' };
      if (attitude === 'friendly') {
        npc.trust = Math.max(0, npc.trust - 30);
        return { action: 'flee', confidence: 0.78, reasoning: '朋友被威胁，恐惧', mood: 'hurt', target_id: 'player' };
      }
      return { action: 'ignore', confidence: 0.65, reasoning: '被威胁，保持沉默', mood: 'afraid', target_id: 'player' };
    }

    if (situation.type === 'player_talk' && situation.player_input) {
      const input = situation.player_input.toLowerCase();
      if (template.secrets && template.secrets.length > 0) {
        const secretKeywords = template.secrets.map((s: any) => s.keyword?.toLowerCase()).filter(Boolean);
        if (secretKeywords.some((k: string) => input.includes(k))) {
          if (npc.trust < 40) {
            npc.suspicion = Math.min(100, npc.suspicion + 20);
            return { action: 'evade', confidence: 0.85, reasoning: '触及敏感话题，回避', mood: 'suspicious', target_id: 'player', dialogue_topic: 'evade' };
          }
          if (npc.trust > 60 && !npc.secrets_revealed.includes(secretKeywords[0])) {
            npc.secrets_revealed.push(secretKeywords[0]);
            return { action: 'talk', confidence: 0.88, reasoning: '信任足够，透露秘密', mood: 'whispering', target_id: 'player', dialogue_topic: 'secret' };
          }
        }
      }
    }

    if (situation.type === 'player_talk') {
      const topic = this._extractTopic(situation.player_input);
      if (topic && !npc.known_topics.includes(topic)) npc.known_topics.push(topic);
    }

    return { action: '', confidence: 0, reasoning: 'No rule matched', mood: 'neutral', target_id: null };
  }

  private _attitudeBasedDecision(context: any): NPCDecision {
    const { npc, template } = context;
    const attitude = npc.attitude;
    const role = template.role || 'neutral';

    switch (attitude) {
      case 'friendly': return { action: 'talk', confidence: 0.7, reasoning: '友好态度，乐于交流', mood: 'friendly', target_id: 'player', dialogue_topic: 'greeting' };
      case 'hostile':
      case 'hostile_alerted':
        if (role === 'enemy') return { action: 'attack', confidence: 0.65, reasoning: '敌对态度，准备攻击', mood: 'hostile', target_id: 'player' };
        return { action: 'ignore', confidence: 0.6, reasoning: '敌对但非战斗角色，回避', mood: 'cold', target_id: 'player' };
      case 'afraid': return { action: 'flee', confidence: 0.65, reasoning: '恐惧中，保持距离', mood: 'scared', target_id: 'player' };
      case 'neutral':
      default: return { action: 'talk', confidence: 0.6, reasoning: '中立态度，保持礼貌', mood: 'neutral', target_id: 'player', dialogue_topic: 'greeting' };
    }
  }

  private async _llmEnhancedDecision(context: any, llmClient: LLMClient): Promise<NPCDecision> {
    const { npc, template, situation, campaign_state, chat_history } = context;

    const promptBuilder = new PromptBuilder(this.campaign, this.module);
    const gmPrompt = promptBuilder.buildGMContextPrompt();

    const systemPrompt = `${gmPrompt?.content || ''}

You are also the tactical decision engine for NPC: ${template.name || 'an NPC'}.

NPC Profile:
- Name: ${template.name || 'Unknown'}
- Role: ${template.role || 'neutral'}
- Personality: ${template.personality || '未设定'}
- Description: ${template.description || '未设定'}
- Attitude: ${npc.attitude}
- Trust: ${npc.trust}/100, Fear: ${npc.fear}/100, Suspicion: ${npc.suspicion}/100

Scene: ${campaign_state.current_scene}
Player: ${campaign_state.player_name} (HP ${Math.round(campaign_state.player_hp_ratio * 100)}%, SAN ${Math.round(campaign_state.player_san_ratio * 100)}%)
Combat: ${campaign_state.is_combat ? 'YES' : 'NO'}${campaign_state.is_combat ? `, Player Turn: ${campaign_state.is_player_turn ? 'YES' : 'NO'}` : ''}

${template.secrets?.length ? `Secrets: ${template.secrets.map((s: any) => s.keyword).join(', ')}` : ''}
${npc.secrets_revealed.length ? `Already revealed: ${npc.secrets_revealed.join(', ')}` : ''}
${npc.known_topics.length ? `Known topics: ${npc.known_topics.join(', ')}` : ''}

Available actions: ${this._getAvailableActions().join(', ')}.

You must respond with a single JSON object containing exactly these fields:
- action: one of the available actions
- confidence: number 0.0-1.0
- reasoning: brief explanation in Chinese
- mood: emotion descriptor
- target_id: "player" or null
- dialogue_topic: optional topic hint if action is "talk"

Rules:
1. Stay in character based on personality and attitude.
2. Only choose actions the NPC is capable of.
3. If HP is critical (< 25%), strongly consider fleeing (unless Boss/zealot).
4. If trust is high (> 60), favor talk/help over hostility.
5. If fear is high (> 70), favor fleeing or pleading.
6. In combat, enemies attack or use special abilities; allies help.
7. NEVER output markdown, only raw JSON.`;

    const userPrompt = `Situation: ${situation.type}
${situation.player_input ? `Player input: "${situation.player_input}"` : ''}
NPC current state: HP ${npc.current_hp}/${template.hp || template.stats?.HP || 10}, SAN ${npc.current_san}, attitude ${npc.attitude}, trust ${npc.trust}, fear ${npc.fear}, suspicion ${npc.suspicion}
Turn count: ${npc.turns_in_scene}
${chat_history ? `\nRecent conversation:\n${chat_history}` : ''}

What do you do?`;

    try {
      const response = await llmClient.chat(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { temperature: 0.6, maxTokens: 256 },
      );

      let parsed: any = null;
      try {
        const raw = response.content.trim();
        const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
        const jsonText = jsonMatch ? jsonMatch[1].trim() : raw;
        parsed = JSON.parse(jsonText);
      } catch (parseError: any) {
        return this._defaultFallback(context);
      }

      if (!parsed?.action) return this._defaultFallback(context);

      const confidence = parseFloat(parsed.confidence) || 0.5;

      return {
        action: parsed.action,
        confidence: Math.max(0, Math.min(1, confidence)),
        reasoning: parsed.reasoning || 'LLM reasoning',
        mood: parsed.mood || 'neutral',
        target_id: parsed.target_id || 'player',
        dialogue_topic: parsed.dialogue_topic || null,
        llm_enhanced: true,
      };
    } catch (error: any) {
      return this._defaultFallback(context);
    }
  }

  private _defaultFallback(context: any): NPCDecision {
    const { template, situation } = context;
    let decision = 'talk';
    let mood = 'neutral';

    if (template.role === 'enemy') { decision = 'attack'; mood = 'hostile'; }
    if (template.role === 'Boss') { decision = 'special_attack'; mood = 'dominant'; }
    if (situation.type === 'combat_turn') { decision = 'attack'; mood = 'focused'; }

    return { action: decision, confidence: 0.5, reasoning: 'Default role-based decision (MVP fallback)', mood, target_id: 'player', dialogue_topic: situation.type === 'player_talk' ? 'generic' : null };
  }

  private _updateAttitudeFromDecision(decision: NPCDecision, situation: any) {
    const type = situation?.type || 'idle';
    const transitions = ATTITUDE_TRANSITIONS[type];
    if (transitions && transitions[this.npcState.attitude]) {
      const oldAttitude = this.npcState.attitude;
      this.npcState.attitude = transitions[this.npcState.attitude];
      if (oldAttitude !== this.npcState.attitude) {
        this.npcState.current_action = `attitude_change:${oldAttitude}->${this.npcState.attitude}`;
      }
    }
  }

  private _extractTopic(input: string): string | null {
    if (!input) return null;
    const lower = input.toLowerCase();
    const topics: Record<string, string[]> = {
      cult: ['邪教', 'cult', '仪式', 'ritual', '崇拜'],
      book: ['书', 'book', '典籍', 'grimoire', 'necronomicon'],
      location: ['地下', 'basement', '密室', 'secret', '隐藏'],
      escape: ['逃跑', 'escape', '离开', 'leave', '出口'],
      help: ['帮助', 'help', '救', 'save', '援助'],
      threat: ['威胁', 'threat', '杀', 'kill', '死'],
    };
    for (const [topic, keywords] of Object.entries(topics)) {
      if (keywords.some((k) => lower.includes(k))) return topic;
    }
    return 'generic';
  }

  async generateDialogue(contextSummary: string, mood: string, topic: string | null, llmClient: LLMClient | null): Promise<NPCDialogueResult> {
    if (llmClient?.isAvailable()) {
      try {
        return await this._generateLLMDialogue(contextSummary, mood, topic, llmClient);
      } catch (error: any) {
      /* no-op */ }
    }
    return this._generateTemplateDialogue(contextSummary, mood, topic);
  }

  private async _generateLLMDialogue(contextSummary: string, mood: string, topic: string | null, llmClient: LLMClient): Promise<NPCDialogueResult> {
    const template = this.npcTemplate;
    const npc = this.npcState;

    const systemPrompt = `You are ${template.name || 'an NPC'} in a ${this.module.system || 'horror'} RPG. You must respond in strict JSON format. Stay concise (1-2 sentences). Never break character. ${template.personality ? `Personality: ${template.personality}` : ''}`;

    const prompt = `${contextSummary}

Your current mood: ${mood}
Your attitude toward the player: ${npc.attitude}
Trust level: ${npc.trust}/100
Fear level: ${npc.fear}/100
Suspicion: ${npc.suspicion}/100
${topic ? `Suggested topic: ${topic}` : ''}
${npc.secrets_revealed.length > 0 ? `Secrets already revealed: ${npc.secrets_revealed.join(', ')}` : ''}
${npc.known_topics.length > 0 ? `Topics discussed: ${npc.known_topics.join(', ')}` : ''}

Respond ONLY with a JSON object in this exact format:
{"text": "What you say or do (1-2 sentences in character)", "emotion": "current_emotion_name", "secretRevealed": "name_of_secret_if_any"}
If no secret is revealed, omit secretRevealed or set it to null.`;

    const response = await llmClient.chat(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
      { temperature: 0.8, maxTokens: 512 },
    );

    let parsed: any = { text: '', emotion: mood, secretRevealed: null };
    try {
      const raw = response.content.trim();
      const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      const jsonText = jsonMatch ? jsonMatch[1].trim() : raw;
      parsed = JSON.parse(jsonText);
    } catch (error: any) {
      parsed.text = response.content.trim();
      parsed.emotion = mood;
    }

    const text = (parsed.text || response.content.trim() || '【NPC 沉默不语】').substring(0, 1000);
    const emotion = parsed.emotion || mood || 'neutral';
    const secretRevealed = parsed.secretRevealed || null;

    if (secretRevealed && template.secrets) {
      const secret = template.secrets.find((s: any) => s.keyword === secretRevealed);
      if (secret && !npc.secrets_revealed.includes(secretRevealed)) {
        npc.secrets_revealed.push(secretRevealed);
      }
    }

    return { text, emotion, secretRevealed };
  }

  private _generateTemplateDialogue(_contextSummary: string, mood: string, topic: string | null): NPCDialogueResult {
    const template = this.npcTemplate;
    const npc = this.npcState;

    let text: string;
    let secretRevealed: string | null = null;

    const moodOpenings: Record<string, string[]> = {
      calm: ['“……”', '【NPC 沉默地注视着你】', '“请说。”'],
      angry: ['“你——！”', '【NPC 怒目而视】', '“别靠近我！”'],
      scared: ['“不……不要过来……”', '【NPC 后退一步】', '“求求你，别……”'],
      curious: ['“哦？你对这个感兴趣？”', '【NPC 凑近了一些】', '“说说看。”'],
      suspicious: ['“……你想知道什么？”', '【NPC 压低声音】', '“为什么问这个？”'],
      friendly: ['“又见面了。”', '【NPC 微笑】', '“有什么我可以帮你的吗？”'],
      hostile: ['“离我远点。”', '【NPC 握紧拳头】', '“你还没受够教训吗？”'],
      grateful: ['“谢谢你……真的。”', '【NPC 眼眶微红】', '“你救了我。”'],
      terrified: ['“啊啊——！！”', '【NPC 崩溃地尖叫】', '“怪物……怪物啊！！”'],
      desperate: ['“这是……最后的机会了……”', '【NPC 喘息着】', '“一起死吧！”'],
      dominant: ['“跪下。”', '【NPC 张开双臂】', '“臣服，或者毁灭。”'],
      whispering: ['“……你确定要知道吗？”', '【NPC 压低声音】', '“这个秘密……会毁了你。”'],
      hurt: ['“我以为……我们是朋友。”', '【NPC 转身】', '“你走吧。”'],
    };

    const openings = moodOpenings[mood] || moodOpenings['calm'];
    text = openings[Math.floor(Math.random() * openings.length)] + '\n\n';

    if (topic && template.dialogue?.[topic]) {
      text += template.dialogue[topic];
    } else if (topic === 'secret' && template.secrets) {
      const unrevealed = template.secrets.filter((s: any) => !npc.secrets_revealed.includes(s.keyword));
      if (unrevealed.length > 0) {
        const secret = unrevealed[0];
        text += secret.reveal_text || '“我知道一些事情……但不能在这里说。”';
        secretRevealed = secret.keyword;
        if (!npc.secrets_revealed.includes(secret.keyword)) npc.secrets_revealed.push(secret.keyword);
      }
    } else if (template.dialogue?.default) {
      text += template.dialogue.default;
    } else {
      text += '【NPC 没有回应】';
    }

    if (npc.trust > 70 && template.dialogue?.trusted) text += `\n\n${template.dialogue.trusted}`;
    if (npc.suspicion > 70 && template.dialogue?.suspicious) text += `\n\n${template.dialogue.suspicious}`;

    if (npc.attitude === 'hostile' || npc.attitude === 'hostile_alerted') text += '\n\n【NPC 的态度明显充满敌意】';
    else if (npc.attitude === 'afraid') text += '\n\n【NPC 的身体在颤抖】';
    else if (npc.attitude === 'friendly') text += '\n\n【NPC 对你露出微笑】';

    return { text, emotion: mood || 'neutral', secretRevealed };
  }

  updateState(decision: NPCDecision, outcome: { damage_taken?: number; healing_received?: number; sanity_loss?: number; trust_delta?: number; fear_delta?: number; suspicion_delta?: number } = {}) {
    const npc = this.npcState;

    if (outcome.damage_taken !== undefined) npc.current_hp = Math.max(0, npc.current_hp - outcome.damage_taken);
    if (outcome.healing_received !== undefined) npc.current_hp = Math.min(npc.current_hp + outcome.healing_received, this.npcTemplate.hp || 10);
    if (outcome.sanity_loss !== undefined) npc.current_san = Math.max(0, npc.current_san - outcome.sanity_loss);
    if (outcome.trust_delta !== undefined) npc.trust = Math.min(100, Math.max(0, npc.trust + outcome.trust_delta));
    if (outcome.fear_delta !== undefined) npc.fear = Math.min(100, Math.max(0, npc.fear + outcome.fear_delta));
    if (outcome.suspicion_delta !== undefined) npc.suspicion = Math.min(100, Math.max(0, npc.suspicion + outcome.suspicion_delta));

    if (npc.trust > 60 && npc.fear < 30 && npc.attitude !== 'friendly') npc.attitude = 'friendly';
    if (npc.fear > 70 && !npc.attitude.startsWith('hostile') && npc.attitude !== 'afraid') npc.attitude = 'afraid';
    if (npc.trust < 20 && !npc.attitude.startsWith('hostile') && npc.attitude !== 'afraid') npc.attitude = 'hostile';

    npc.current_action = decision.action;
    npc.turns_in_scene++;

    if (npc.current_hp <= 0) { npc.is_alive = false; npc.attitude = 'dead'; }

    return npc;
  }

  getStateSummary() {
    const npc = this.npcState;
    const template = this.npcTemplate;
    return {
      id: this.npcId,
      name: template.name || this.npcId,
      attitude: npc.attitude,
      trust: npc.trust,
      fear: npc.fear,
      suspicion: npc.suspicion,
      hp: `${npc.current_hp}/${template.hp || 10}`,
      is_alive: npc.is_alive,
      current_action: npc.current_action,
      known_topics_count: npc.known_topics.length,
      secrets_revealed_count: npc.secrets_revealed.length,
    };
  }
}

export default NPCDecisionEngine;
