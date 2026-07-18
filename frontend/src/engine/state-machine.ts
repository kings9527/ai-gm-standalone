import { DiceRoller } from './dice';
import { IntentParser, type IntentResult } from './intent-parser';
import { EventSystem } from './event-system';
import { SceneLoader } from './scene-loader';
import type { Module, Campaign, NPCState } from '../types/module';

/**
 * Game State Machine (ported from old project, ST-decoupled)
 * Manages scene transitions, player actions, and game flow.
 */

export interface GameAction {
  action_type: string;
  player_input?: string;
  action_data?: Record<string, unknown>;
  chat_history?: string;
}

export interface GameResult {
  type: string;
  scene?: string | Record<string, unknown>;
  narration?: string;
  available_actions?: Array<{ type: string; target?: string; label: string }>;
  [key: string]: unknown;
}

export class GameStateMachine {
  module: Module;
  campaign: Campaign;
  currentScene: Module['scenes'][string];
  llmClient: any | null;
  diceRoller: DiceRoller;
  intentParser: IntentParser;
  eventSystem: EventSystem;
  sceneLoader: SceneLoader;

  constructor(module: Module, campaign: Campaign, llmClient: any = null) {
    this.module = module;
    this.campaign = campaign;
    this.currentScene = module.scenes[campaign.current_scene];
    this.llmClient = llmClient;
    this.diceRoller = new DiceRoller();
    this.intentParser = new IntentParser(llmClient, { enableCache: true, llmConfidenceThreshold: 0.7 });
    this.eventSystem = new EventSystem(module, campaign, this.currentScene);
    this.sceneLoader = new SceneLoader(module);
  }

  async processAction(action: GameAction): Promise<GameResult> {
    if (!action || typeof action !== 'object') {
      throw new Error('Invalid action: must be an object');
    }
    const { action_type, player_input, chat_history } = action;

    const intent = await this.parseIntent(player_input || '', action_type);

    const eventResult = this.eventSystem.checkEvents(intent, player_input || '');
    if (eventResult.triggered) {
      // 应用事件解锁的场景更新
      if (eventResult.unlocked) {
        const { scene: updatedScene, changes } = this.sceneLoader.applySceneUnlocks(
          this.currentScene,
          this.campaign,
          eventResult.unlocked
        );
        this.currentScene = updatedScene;
        // 同步更新 module 中的场景引用
        this.module = this.sceneLoader.updateSceneInModule(this.currentScene.id, updatedScene);
        if (changes.length > 0) {
          eventResult.narration = `${eventResult.narration}\n\n【发现】${changes.join('；')}`;
        }
      }
      return {
        type: 'event',
        event_id: eventResult.eventId,
        scene: this.currentScene.id,
        narration: eventResult.narration || '发生了一些事情...',
        available_actions: this.getAvailableActions(),
      };
    }

    if (intent.type === 'move') {
      const matchedExit = this.findMatchingExit(action.action_data?.direction as string, player_input || '');
      if (matchedExit) {
        return this.transitionTo(matchedExit.target, { intent, matchedExit });
      }
      return {
        type: 'interaction',
        scene: this.currentScene.id,
        narration: '你想去那个方向，但似乎没有路。',
        available_actions: this.getAvailableActions(),
      };
    }

    if (intent.type === 'dice_check' || action_type === 'dice_check') {
      return this.handleDiceCheckInteraction(action.action_data, player_input || '');
    }

    if (intent.type === 'interact' || intent.type === 'inspect') {
      return this.handleInteract(intent, player_input || '');
    }

    if (intent.type === 'talk') {
      return await this.handleTalk(intent, player_input || '', chat_history || '');
    }

    if (intent.type === 'attack') {
      return await this.handleCombatInitiation(intent, player_input || '');
    }

    return this.handleSceneInteraction(intent);
  }

  async parseIntent(input: string, actionType?: string): Promise<IntentResult & { type: string; raw: string; llm_enhanced?: boolean; target?: string | null }> {
    // 使用新的 IntentParser 进行解析
    const result = await this.intentParser.parse(input);

    // 将新的 intent 格式映射回 state-machine 内部使用的 type 格式
    const intentTypeMap: Record<string, string> = {
      explore: 'move',
      combat: 'attack',
      chat: 'talk',
      event: 'inspect',
      save: 'interact',
      settings: 'interact',
    };

    const mappedType = intentTypeMap[result.intent] || actionType || 'inspect';

    return {
      type: mappedType,
      intent: result.intent,
      raw: input,
      llm_enhanced: result.confidence >= 0.7,
      confidence: result.confidence,
      target: (result.extractedParams?.target as string) || (result.extractedParams?.scene as string) || null,
      extractedParams: result.extractedParams,
    };
  }

  checkSceneEvents(intent: any): GameResult | null {
    if (!this.module.events) return null;

    for (const [eventId, event] of Object.entries(this.module.events)) {
      const trigger = event.trigger;
      if (!trigger) continue;
      if (trigger.scene && trigger.scene !== this.currentScene.id) continue;
      if (trigger.action && trigger.action !== intent.type) continue;

      const eventKey = `event_triggered:${eventId}`;
      if (this.campaign.global_vars[eventKey]) continue;
      if (trigger.chance && Math.random() > trigger.chance) continue;
      if (trigger.condition && !this.evaluateCondition(trigger.condition)) continue;

      if (!event.repeatable) this.campaign.global_vars[eventKey] = true;
      if (event.effect) this.applyEventEffects(event.effect);

      let narration = this.sanitizeNarration(event.description || '发生了一些事情...');
      if (event.sanity_check) {
        const checkResult = this.performSanityCheck(event.sanity_check);
        narration += `\n\n${checkResult.narration}`;
      }

      return {
        type: 'event',
        event_id: eventId,
        scene: this.currentScene.id,
        narration,
        available_actions: this.getAvailableActions(),
      };
    }
    return null;
  }

  performSanityCheck(check: { target?: number; failure?: string }) {
    const target = check.target || (this.campaign.player.sanity ?? 50);
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= target;

    let narration = `SAN 检定：${roll} / ${target} — `;
    if (success) {
      narration += '成功。你保持理智。';
    } else {
      const lossExpr = check.failure || '1d6';
      const loss = this.parseDiceExpression(lossExpr);
      const oldSanity = this.campaign.player.sanity || 50;
      const newSanity = Math.max(0, oldSanity - loss);
      this.campaign.player.sanity = newSanity;
      narration += `失败。你失去 ${loss} 点 SAN。(${oldSanity} → ${newSanity})`;
      if (loss >= 5) {
        narration += '\n\n你受到了巨大的精神冲击，暂时陷入疯狂状态！';
        this.campaign.player.status_effects = this.campaign.player.status_effects || [];
        this.campaign.player.status_effects.push({ type: 'temp_insanity', duration: '1d10 rounds', description: '暂时性疯狂' });
      }
    }
    return { roll, target, success, narration };
  }

  applyEventEffects(effects: Record<string, unknown>) {
    for (const [key, value] of Object.entries(effects)) {
      if (key.includes('+')) {
        const baseKey = key.replace('+', '').trim();
        this.campaign.global_vars[baseKey] = ((this.campaign.global_vars[baseKey] as number) || 0) + (value as number);
      } else if (key.includes('-')) {
        const baseKey = key.replace('-', '').trim();
        this.campaign.global_vars[baseKey] = ((this.campaign.global_vars[baseKey] as number) || 0) - (value as number);
      } else if (key === 'sanity_loss') {
        const loss = this.parseDiceExpression(value as string);
        const oldSanity = this.campaign.player.sanity || 50;
        this.campaign.player.sanity = Math.max(0, oldSanity - loss);
      } else {
        this.campaign.global_vars[key] = value;
      }
    }
  }

  findMatchingExit(intent: any, input: string) {
    if (!this.currentScene.exits) return null;
    return this.currentScene.exits.find((exit) => {
      if (!intent && !input) return false;
      // Exact match by target or label
      if (exit.target === intent || exit.label === intent) return true;
      // Partial match: input contains exit label or exit label contains input
      if (intent && exit.label && (exit.label.includes(intent) || intent.includes(exit.label))) return true;
      if (input && exit.label && (exit.label.includes(input) || input.includes(exit.label))) return true;
      if (input && exit.description && (exit.description.includes(input) || input.includes(exit.description))) return true;
      if (!exit.condition || Object.keys(exit.condition).length === 0) return true;
      if (typeof exit.condition === 'object') {
        return this.evaluateCondition(exit.condition);
      }
      return false;
    }) || null;
  }

  evaluateCondition(condition: any): boolean {
    for (const [key, value] of Object.entries(condition)) {
      const campaignValue = this.campaign.global_vars[key];
      if (Array.isArray(value)) {
        const cv = campaignValue as number;
        if (cv < value[0] || cv > value[1]) return false;
      } else if (typeof value === 'boolean') {
        if (!!campaignValue !== value) return false;
      } else if (typeof value === 'number') {
        if ((campaignValue as number) !== value) return false;
      } else if (typeof value === 'string') {
        if ((campaignValue as string) !== value) return false;
      }
    }
    return true;
  }

  handleInteract(intent: any, input: string): GameResult {
    const interactables = this.currentScene.interactables || [];
    const items = this.module.items || {};

    if (!this.campaign.player.inventory) this.campaign.player.inventory = [];

    let matchedItem: any = null;
    for (const itemId of interactables) {
      const item = items[itemId];
      if (!item) continue;
      const inputLower = input.toLowerCase();
      const nameLower = item.name.toLowerCase();
      const idLower = itemId.toLowerCase();
      // Check if any significant words overlap
      // For Chinese: check if any 2+ char substring of input matches part of name
      let hasKeywordMatch = false;
      if (/[\u4e00-\u9fff]/.test(input)) {
        // Chinese text: extract 2-char substrings and check
        for (let i = 0; i < inputLower.length - 1; i++) {
          const substr = inputLower.substring(i, i + 2);
          if (substr.length >= 2 && nameLower.includes(substr)) {
            hasKeywordMatch = true;
            break;
          }
        }
      } else {
        const inputWords = inputLower.split(/\s+/).filter(w => w.length > 1);
        const nameWords = nameLower.split(/\s+/).filter(w => w.length > 1);
        hasKeywordMatch = inputWords.some(w => nameLower.includes(w)) || nameWords.some(w => inputLower.includes(w));
      }
      // Full or partial match
      if (hasKeywordMatch || inputLower.includes(nameLower) || nameLower.includes(inputLower) ||
          inputLower.includes(idLower) || idLower.includes(inputLower)) {
        matchedItem = { ...item };
        break;
      }
    }

    if (!matchedItem) {
      return {
        type: 'interaction',
        scene: this.currentScene.id,
        narration: this.currentScene.description || '你环顾四周，没有发现特别的东西。',
        available_actions: this.getAvailableActions(),
      };
    }

    let narration: string;
    const effects: any[] = [];

    if (matchedItem.readable) {
      narration = `你拿起${matchedItem.name}开始阅读。\n\n${matchedItem.content || '上面写满了你看不懂的文字。'}`;
    } else if (matchedItem.usable) {
      narration = `你使用了${matchedItem.name}。`;
    } else {
      narration = `你检查了${matchedItem.name}。\n\n${matchedItem.description}`;
    }

    if (matchedItem.effects) {
      for (const effect of matchedItem.effects) {
        let parsed: any;
        if (typeof effect === 'string') parsed = this.parseEffectString(effect);
        else if (typeof effect === 'object' && effect !== null) parsed = effect;
        if (parsed) {
          if (parsed.type === 'dice_check') return this.handleDiceCheckInteraction(parsed, input);
          this.applyEffect(parsed);
          effects.push(parsed);
        }
      }
      const effectDesc = effects.map((e) => this.describeEffect(e)).join('，');
      if (effectDesc) narration += `\n\n效果：${effectDesc}`;
    }

    if (!matchedItem.readable && !this.campaign.player.inventory.includes(matchedItem.id)) {
      this.campaign.player.inventory.push(matchedItem.id);
      narration += `\n\n${matchedItem.name}已加入你的物品栏。`;
    }

    return {
      type: 'interaction',
      interaction_type: 'item',
      item_id: matchedItem.id,
      scene: this.currentScene.id,
      narration,
      effects,
      available_actions: this.getAvailableActions(),
    };
  }

  handleDiceCheckInteraction(actionData: any, input: string): GameResult {
    let skill = actionData?.skill;
    let skillValue = actionData?.skill_value;

    if (!skill && input) {
      const skillKeywords: Record<string, number> = {
        图书馆使用: 50, library_use: 50, library: 50,
        侦查: 60, spot_hidden: 60, spot: 60,
        聆听: 50, listen: 50,
        格斗: 40, brawl: 40, fight: 40,
        射击: 40, firearms: 40, shoot: 40,
        闪避: 40, dodge: 40,
        急救: 30, first_aid: 30,
        医学: 40, medicine: 40,
        说服: 50, persuade: 50,
        心理学: 50, psychology: 50,
        历史: 40, history: 40,
        神秘学: 30, occult: 30,
      };

      for (const [keyword, defaultValue] of Object.entries(skillKeywords)) {
        if (input.toLowerCase().includes(keyword.toLowerCase())) {
          skill = keyword;
          skillValue = defaultValue;
          break;
        }
      }
    }

    if (!skill) {
      return {
        type: 'interaction',
        scene: this.currentScene.id,
        narration: '你想检定什么技能？请明确说明。',
        available_actions: this.getAvailableActions(),
      };
    }

    const roll = Math.floor(Math.random() * 100) + 1;
    const target = (skillValue || this.campaign.player.stats[skill] || 50) + (actionData?.modifier || 0);
    const success = roll <= target;
    const critical = roll <= 5;
    const fumble = roll >= 96;

    let degree: string | null = null;
    if (roll <= Math.floor(target / 5)) degree = 'extreme';
    else if (roll <= Math.floor(target / 2)) degree = 'hard';

    const result = fumble ? 'fumble' : critical ? 'critical' : degree ? degree : success ? 'success' : 'fail';
    let narration = this.buildCheckNarration(skill, roll, target, result);

    if (success) {
      const triggeredEvent = this.checkSkillSuccessEvents(skill, roll, target);
      if (triggeredEvent) narration += `\n\n${triggeredEvent.narration}`;
    }

    return {
      type: 'dice_check',
      skill,
      roll,
      target,
      result,
      degree,
      narration,
      available_actions: this.getAvailableActions(),
    };
  }

  checkSkillSuccessEvents(skill: string, roll: number, target: number) {
    if (!this.module.events) return null;

    for (const [eventId, event] of Object.entries(this.module.events)) {
      const trigger = event.trigger as any;
      if (!trigger) continue;
      if (trigger.scene && trigger.scene !== this.currentScene.id) continue;
      if (!trigger.skill) continue;

      const skillMatch = (trigger.skill as string[]).some(
        (s: string) => skill.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(skill.toLowerCase()),
      );
      if (!skillMatch) continue;

      const eventKey = `event_triggered:${eventId}`;
      if (this.campaign.global_vars[eventKey]) continue;
      if (trigger.require_success !== false && roll > target) continue;

      if (!event.repeatable) this.campaign.global_vars[eventKey] = true;
      if (event.effect) this.applyEventEffects(event.effect);

      return { narration: this.sanitizeNarration(event.description || '你的技能发现了一些新线索...') };
    }
    return null;
  }

  async handleTalk(intent: any, input: string, chatHistory: string): Promise<GameResult> {
    const npcs = this.currentScene.npcs || [];
    if (npcs.length === 0) {
      return {
        type: 'interaction',
        scene: this.currentScene.id,
        narration: '这里没有可以交谈的人。',
        available_actions: this.getAvailableActions(),
      };
    }

    let matchedNPC: any = null;
    for (const npcId of npcs) {
      const npc = this.module.npcs?.[npcId];
      if (!npc) continue;
      if (input.toLowerCase().includes(npc.name.toLowerCase()) || input.toLowerCase().includes(npcId.toLowerCase())) {
        matchedNPC = { ...npc };
        break;
      }
    }

    if (!matchedNPC && npcs.length === 1) {
      const npcId = npcs[0];
      const npc = this.module.npcs?.[npcId];
      if (npc) matchedNPC = { ...npc };
    }

    if (matchedNPC) {
      // NPC Decision Engine integration (lazy import to avoid circular dependency)
      const { NPCDecisionEngine } = await import('./npc-decision');
      const engine = new NPCDecisionEngine(this.campaign, this.module, matchedNPC.id);

      const decision = await engine.decide({ type: 'player_talk', player_input: input }, this.llmClient, chatHistory);
      const dialogueResult = await engine.generateDialogue(
        `Player says: "${input}"`,
        decision.mood,
        decision.dialogue_topic ?? null,
        this.llmClient,
      );

      engine.updateState(decision, {
        trust_delta: decision.mood === 'friendly' || decision.mood === 'grateful' || decision.action === 'talk' ? 5 : 0,
        fear_delta: decision.mood === 'terrified' || decision.mood === 'scared' ? 5 : 0,
      });

      return {
        type: 'interaction',
        interaction_type: 'talk',
        npc_id: matchedNPC.id,
        scene: this.currentScene.id,
        narration: `${matchedNPC.name}：${dialogueResult.text || '【沉默】'}`,
        npc_decision: { action: decision.action, mood: decision.mood, confidence: decision.confidence },
        available_actions: [
          ...this.getAvailableActions(),
          { type: 'ask', target: matchedNPC.id, label: `继续询问${matchedNPC.name}` },
        ],
      };
    }

    return {
      type: 'interaction',
      scene: this.currentScene.id,
      narration: '你想和谁交谈？',
      available_actions: npcs.map((id: string) => {
        const npc = this.module.npcs?.[id];
        return { type: 'talk_to', target: id, label: npc?.name || id };
      }) || [],
    };
  }

  async handleCombatInitiation(intent: any, input: string): Promise<GameResult> {
    if (!this.currentScene.combat?.enabled) {
      return {
        type: 'interaction',
        scene: this.currentScene.id,
        narration: '这里没有敌人。你的攻击只是打在了空气里。',
        available_actions: this.getAvailableActions(),
      };
    }

    const enemies = this.currentScene.combat.enemies || [];
    if (enemies.length === 0) {
      return {
        type: 'interaction',
        scene: this.currentScene.id,
        narration: '场景中没有可攻击的敌人。',
        available_actions: this.getAvailableActions(),
      };
    }

    let target = enemies[0];
    for (const enemyId of enemies) {
      const npc = this.module.npcs?.[enemyId];
      if (npc && input.toLowerCase().includes(npc.name.toLowerCase())) {
        target = enemyId;
        break;
      }
    }

    const enemyNames = enemies.map((e: string) => this.module.npcs?.[e]?.name || e).join('、');
    let narration = `战斗开始！你面对${enemies.length}个敌人：${enemyNames}。`;

    if (this.llmClient?.isAvailable()) {
      try {
        const sceneDesc = this.currentScene.description || '一个危险的地方';
        const systemPrompt = '你是TRPG战斗叙事生成器。根据场景和敌人信息，生成一段紧张、生动的战斗开场描述。保持简洁（30-50字），风格克苏鲁/恐怖。返回纯文本，不要JSON。';
        const userPrompt = `场景：${sceneDesc}\n敌人：${enemyNames}\n玩家行动：${input || '发起攻击'}`;

        const result = await this.llmClient.chat(
          [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          { maxTokens: 128, temperature: 0.8 },
        );
        if (result?.content) narration = result.content.trim();
      } catch (err: any) {
      /* no-op */ }
    }

    return {
      type: 'combat_start',
      scene: this.currentScene.id,
      narration,
      enemies,
      target,
      available_actions: [
        { type: 'combat_attack', target, label: `攻击${this.module.npcs?.[target]?.name || target}` },
        { type: 'combat_flee', label: '逃跑' },
        { type: 'combat_skill', label: '使用技能' },
      ],
    };
  }

  handleSceneInteraction(intent: any): GameResult {
    const result: GameResult = {
      type: 'interaction',
      scene: this.currentScene.id,
      narration: '你环顾四周...',
      available_actions: this.getAvailableActions(),
    };

    if (intent.type === 'talk') return this.handleTalk(intent, '', '') as any;
    if (intent.type === 'inspect') result.narration = this.currentScene.description || '这里没有什么特别的东西。';
    if (intent.type === 'flee') {
      result.narration = '你想逃跑，但...去哪里？';
      result.available_actions = this.currentScene.exits?.map((e) => ({ type: 'move', target: e.target, label: e.label })) || [];
    }

    return result;
  }

  getAvailableActions(): Array<{ type: string; target?: string; label: string }> {
    const actions: Array<{ type: string; target?: string; label: string }> = [];

    if (this.currentScene.exits) {
      this.currentScene.exits.forEach((e) => {
        if (!e.condition || Object.keys(e.condition).length === 0 || this.evaluateCondition(e.condition)) {
          actions.push({ type: 'move', target: e.target, label: e.label });
        }
      });
    }

    if (this.currentScene.npcs && this.currentScene.npcs.length > 0) {
      this.currentScene.npcs.forEach((npcId: string) => {
        const npc = this.module.npcs?.[npcId];
        actions.push({ type: 'talk', target: npcId, label: `与${npc?.name || npcId}交谈` });
      });
    }

    if (this.currentScene.interactables && this.currentScene.interactables.length > 0) {
      this.currentScene.interactables.forEach((itemId: string) => {
        const item = this.module.items?.[itemId];
        actions.push({ type: 'interact', target: itemId, label: `检查${item?.name || itemId}` });
      });
    }

    if (this.currentScene.combat?.enabled) {
      actions.push({ type: 'attack', label: '进入战斗' });
    }

    return actions;
  }

  async transitionTo(sceneId: string, _metadata: any = {}): Promise<GameResult> {
    const loaded = this.sceneLoader.loadScene(sceneId, this.campaign);
    const scene = loaded.scene;
    if (!scene) throw new Error(`Scene not found: ${sceneId}`);

    if (this.currentScene?.combat?.enabled && !scene.combat?.enabled) {
      this.campaign = { ...this.campaign, combat_state: null };
    }

    this.campaign = {
      ...this.campaign,
      scene_history: [...this.campaign.scene_history, sceneId],
      current_scene: sceneId,
    };
    this.currentScene = scene;

    // 重新初始化 EventSystem 为新场景
    this.eventSystem = new EventSystem(this.module, this.campaign, this.currentScene);

    if (scene.ending) {
      return {
        type: 'ending',
        from: this.campaign.scene_history[this.campaign.scene_history.length - 2] || null,
        to: sceneId,
        scene: { id: scene.id, title: scene.title, description: scene.description },
        ending: scene.ending,
        narration: `${scene.title}\n\n${scene.description}\n\n${scene.ending.description}`,
        available_actions: [{ type: 'restart', label: '重新开始' }, { type: 'load_save', label: '读取存档' }],
      };
    }

    if (scene.combat?.enabled) {
      const enemies = scene.combat.enemies || [];
      return {
        type: 'scene_change_combat',
        from: this.campaign.scene_history[this.campaign.scene_history.length - 2] || null,
        to: sceneId,
        scene: { id: scene.id, title: scene.title, description: scene.description, npcs_present: scene.npcs || [], combat: scene.combat },
        narration: `你来到了${scene.title}。${scene.description}\n\n⚔️ 敌人出现！${enemies.map((e: string) => this.module.npcs?.[e]?.name || e).join('、')}正挡在你面前。`,
        combat: { enemies, alert: true },
        available_actions: [{ type: 'combat_start', label: '开始战斗' }, ...this.getAvailableActions()],
      };
    }

    return {
      type: 'scene_change',
      from: this.campaign.scene_history[this.campaign.scene_history.length - 2] || null,
      to: sceneId,
      scene: { id: scene.id, title: scene.title, description: scene.description, npcs_present: scene.npcs || [], interactables: scene.interactables || [] },
      narration: `你来到了${scene.title}。${scene.description}`,
      available_actions: this.getAvailableActions(),
    };
  }

  sanitizeNarration(text: string): string {
    if (typeof text !== 'string') return String(text);
    return text.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '').replace(/javascript:/gi, '').replace(/on\w+\s*=/gi, '');
  }

  parseEffectString(effectStr: string): any {
    const match = effectStr.match(/^(.+?)\s*([+-])\s*(\d+)|(.+?)\s+(\d+d\d+)|(.+?)\s+(\d+)$/);
    if (!match) return null;
    if (match[1]) return { target: match[1].trim(), operation: match[2], value: parseInt(match[3]) };
    if (match[4]) return { target: match[4].trim(), operation: 'dice', value: match[5] };
    if (match[6]) return { target: match[6].trim(), operation: 'set', value: parseInt(match[7]) };
    return null;
  }

  applyEffect(effect: any) {
    if (effect.operation === '+' || effect.operation === '-') {
      const current = (this.campaign.global_vars[effect.target] as number) || 0;
      const val = typeof effect.value === 'string' ? this.parseDiceExpression(effect.value) : (effect.value as number);
      this.campaign.global_vars[effect.target] = effect.operation === '+' ? current + val : current - val;
    } else if (effect.operation === 'dice') {
      const loss = this.parseDiceExpression(effect.value);
      if (effect.target === 'sanity_loss') {
        const oldSanity = this.campaign.player.sanity || 50;
        this.campaign.player.sanity = Math.max(0, oldSanity - loss);
      }
    } else if (effect.operation === 'set') {
      this.campaign.global_vars[effect.target] = effect.value;
    }
  }

  describeEffect(effect: any): string {
    if (effect.operation === '+' || effect.operation === '-') {
      const sign = effect.operation === '+' ? '增加' : '减少';
      return `${effect.target}${sign}${effect.value}`;
    } else if (effect.operation === 'dice') {
      if (effect.target === 'sanity_loss') {
        const loss = this.parseDiceExpression(effect.value);
        return `失去${loss}点SAN值`;
      }
      return `${effect.target} ${effect.value}`;
    }
    return '';
  }

  parseDiceExpression(expression: string | number): number {
    if (typeof expression === 'number') return expression;
    try {
      const result = this.diceRoller.roll(String(expression));
      return result.total;
    } catch {
      return 0;
    }
  }

  buildCheckNarration(skill: string, roll: number, target: number, result: string): string {
    const diff = target - roll;
    switch (result) {
      case 'critical': return `大成功！你的${skill}检定结果${roll}，远超预期！`;
      case 'extreme': return `极难成功！${skill}检定${roll}，近乎完美的表现。`;
      case 'hard': return `困难成功！${skill}检定${roll}，你的技巧令人印象深刻。`;
      case 'success': return `成功！${skill}检定${roll}，刚好在范围内。`;
      case 'fumble': return `大失败！${skill}检定${roll}...灾难性的失误。`;
      case 'fail': return `失败。${skill}检定${roll}，还差${diff}点。`;
      default: return `${skill}检定：${roll} / ${target}`;
    }
  }

  getCurrentTime(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'night';
  }
}

export default GameStateMachine;
