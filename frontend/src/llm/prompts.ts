/**
 * Prompt Builder for AI-GM
 * Constructs system prompts for LLM interactions.
 * Ported from old project, adapted for standalone frontend.
 */

import type { Campaign } from '../types/module';

export class PromptBuilder {
  private campaign: Campaign;
  private module: Campaign['module'];

  constructor(campaign: Campaign) {
    this.campaign = campaign;
    this.module = campaign.module;
  }

  buildGMContextPrompt() {
    const scene = this.module.scenes[this.campaign.current_scene];
    const player = this.campaign.player;

    return {
      role: 'system' as const,
      content: `You are the Game Master (GM) for a ${this.module.system} tabletop RPG.

Current Scene: ${scene.title}
Description: ${scene.description}

Player: ${player.name}
Player Stats: ${JSON.stringify(player.stats)}
Player Status: HP ${player.hp}/${player.max_hp}, SAN ${player.sanity}/${player.max_sanity}

NPCs Present: ${(scene.npcs || [])
        .map((id) => this.module.npcs[id]?.name)
        .filter(Boolean)
        .join(', ')}

Global State: ${JSON.stringify(this.campaign.global_vars)}

Your responsibilities:
1. Describe scenes vividly and atmospherically
2. Roleplay NPCs when they speak
3. Request dice rolls when needed (format: [ROLL: SkillName TargetValue])
4. Track game state changes
5. Maintain the horror/mystery tone of the game
6. Be fair but challenging

Always respond in character as the GM. Never break the fourth wall.`,
    };
  }

  buildStyleAnalysisPrompt(storyText: string) {
    return {
      role: 'system' as const,
      content: `You are a visual style analyst for a visual novel RPG engine. Analyze the provided story text and extract the visual atmosphere, era, and mood.

Respond ONLY with a JSON object in this exact format:
{
  "palette": {
    "bg": "#0a0a0a",
    "accent": "#8b0000",
    "text": "#e2e8f0",
    "dialogue_bg": "rgba(10,10,10,0.9)"
  },
  "atmosphere": "horror|mystery|adventure|slice_of_life|fantasy|sci-fi",
  "era": "victorian|modern|fantasy|sci-fi|ancient|medieval",
  "art_style": "dark_realistic|anime|pixel|watercolor|minimalist",
  "lighting": "oil_lamp|neon|daylight|moonlight|torch|none",
  "mood_keywords": ["keyword1", "keyword2", "keyword3"],
  "font_family": "serif|sans-serif|monospace|pixel",
  "effects": ["grain", "vignette", "chromatic_aberration"]
}

Rules:
1. Analyze the text's tone, setting, and emotional quality.
2. Choose palette colors that match the mood (dark for horror, warm for slice of life, etc.).
3. art_style should match the narrative feel (dark_realistic for gritty horror, anime for light fantasy).
4. mood_keywords should be 3-5 evocative words.
5. effects should enhance the atmosphere (grain for old film, vignette for focus, chromatic_aberration for madness).`,
    };
  }

  buildQuestionFlowPrompt(storyText: string, previousAnswers: { question: string; answer: string }[]) {
    const qaHistory = previousAnswers
      .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
      .join('\n\n');

    return {
      role: 'system' as const,
      content: `You are a visual novel scriptwriter. You are helping a player flesh out their story idea into a complete TRPG module.

You have already gathered some information:
${qaHistory || 'No previous answers yet.'}

Original story:
${storyText.substring(0, 2000)}

Ask ONE follow-up question that will help flesh out the module. The question should be:
1. Specific and actionable
2. Related to the story's plot, characters, or setting
3. Designed to create interesting gameplay opportunities
4. Written in a conversational, engaging tone (like a visual novel dialogue)

Respond ONLY with a JSON object:
{
  "question": "The question text (1-2 sentences, conversational)",
  "category": "character|setting|plot|conflict|ending",
  "suggested_answers": ["Short answer 1", "Short answer 2", "Short answer 3"]
}`,
    };
  }

  buildModuleGenerationPrompt(storyText: string, qaHistory: { question: string; answer: string }[], style: object) {
    return {
      role: 'system' as const,
      content: `You are a TRPG module generator. Based on the player's story and your follow-up questions, generate a complete visual novel module.

Style Configuration: ${JSON.stringify(style)}

Player Story + Answers:
${storyText.substring(0, 1500)}

${qaHistory.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}

Generate a module with:
1. 5-10 scenes with descriptions, exits, and choices
2. 2-5 NPCs with personalities and dialogue topics
3. Key items that can be interacted with
4. A coherent plot progression

Respond ONLY with a JSON object conforming to the Module schema (scenes, npcs, items, start_scene). Keep descriptions concise but atmospheric.`,
    };
  }

  buildImageKeywordsPrompt(module: object) {
    return {
      role: 'system' as const,
      content: `Generate image search keywords for a visual novel module. For each scene background and NPC sprite, create 3-5 descriptive keywords that would find good matching images on Unsplash.

Module: ${JSON.stringify(module, null, 2)}

Respond ONLY with a JSON object:
{
  "backgrounds": [
    { "scene_id": "scene1", "keywords": "dark victorian library oil lamp bookshelves" }
  ],
  "sprites": [
    { "npc_id": "npc1", "keywords": "mysterious man victorian coat portrait dark" }
  ]
}`,
    };
  }
}

export default PromptBuilder;
