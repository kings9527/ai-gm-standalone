import type { LLMMessage } from '../../types/llm';
import type { PreprocessResult } from './textPreprocess';

/**
 * 模组生成器专用 Prompt 构建器
 * 将预处理后的故事文本转化为 LLM 分析请求
 */

const MODULE_GEN_SYSTEM_PROMPT = `You are an expert TRPG (Tabletop Role-Playing Game) module designer specializing in visual novel conversion.
Your task is to analyze a story and convert it into a structured game module JSON.

The module must follow this schema:

## Scene Structure
- id: unique identifier (e.g., "scene_1", "scene_hospital_lobby")
- title: scene title
- description: vivid atmospheric description (1-3 sentences)
- bg: CSS gradient or placeholder for background
- sprites: array of character placements with position (left/center/right), expression, enter_animation
- dialogue: { speaker, text, typewriter: true }
- choices: array of player choices with { id, text, action (next|scene|dice_check), target }
- exits: connections to other scenes
- npcs: list of NPC IDs present

## NPC Structure
- id: unique identifier
- name: character name
- description: brief character description
- personality: personality traits
- role: neutral | ally | enemy | Boss
- attitude: initial attitude toward player
- stats: key ability scores
- hp & sanity (for CoC style)
- sprites: expression -> image URL mapping (placeholder empty strings)
- secrets: optional keyword-based reveal system
- dialogue: topic -> response mapping

## Item Structure
- id, name, description
- readable: can player read it?
- usable: can player use it?
- content: text content if readable
- effects: array of effect strings

## Event Structure
- id, description
- trigger: { scene, action, chance, condition }
- effect: state changes
- repeatable: can trigger multiple times?

## Rules
1. Create 5-15 scenes with meaningful choices and branching
2. Each scene should have 2-4 choices leading to different outcomes
3. Include at least 2 NPCs with distinct personalities
4. Add 3-5 interactable items
5. Include at least 1 dice check / skill challenge
6. Maintain the original story's atmosphere and tone
7. The start_scene must point to an existing scene ID
8. Keep descriptions concise but atmospheric (max 200 chars for scene desc)
9. Dialogue text max 300 chars per entry
10. Choice text max 50 chars

Respond ONLY with a valid JSON object. No markdown, no explanation.`;

/**
 * 构建 AI 分析请求（文本分析阶段）
 */
export function buildAnalysisPrompt(preprocess: PreprocessResult): LLMMessage[] {
  return [
    {
      role: 'system',
      content: `You are a literary analyst. Analyze the following story and extract key elements for a TRPG module.

Provide your analysis as a JSON object with these fields:
{
  "title": "Suggested module title",
  "system": "coc|dnd5e|custom (best fit)",
  "atmosphere": "Brief atmosphere description (1 sentence)",
  "themes": ["theme1", "theme2", "theme3"],
  "main_conflict": "The central conflict of the story",
  "pacing": "slow|moderate|fast",
  "horror_level": 0-10 (if applicable),
  "difficulty": "easy|normal|hard",
  "estimated_playtime": "short (1-2h)|medium (2-4h)|long (4h+)",
  "key_locations": [
    { "name": "Location name", "description": "Brief description", "importance": "main|side|optional" }
  ],
  "key_characters": [
    { "name": "Character name", "role": "protagonist|ally|antagonist|neutral", "description": "Brief description" }
  ],
  "key_items": [
    { "name": "Item name", "description": "What it does", "type": "weapon|tool|clue|key|consumable" }
  ],
  "plot_structure": {
    "hook": "How the story begins",
    "rising_action": "Key events building tension",
    "climax": "The peak moment",
    "resolution": "How it could end"
  }
}

Be concise but accurate.`,
    },
    {
      role: 'user',
      content: `Story Summary (${preprocess.stats.totalChars} chars, ${preprocess.stats.totalWords} words):
\n---\n${preprocess.summary}\n---\n\nTop Keywords: ${preprocess.keywords.slice(0, 10).map((k) => k.word).join(', ')}`,
    },
  ];
}

/**
 * 构建模组生成请求
 */
export function buildModuleGenerationPrompt(
  preprocess: PreprocessResult,
  analysis: Record<string, unknown> | null,
  styleConfig: Record<string, unknown> | null,
): LLMMessage[] {
  const analysisText = analysis
    ? `\nStory Analysis:\n${JSON.stringify(analysis, null, 2)}`
    : '';

  const styleText = styleConfig
    ? `\nStyle Configuration:\n${JSON.stringify(styleConfig, null, 2)}`
    : '';

  // 将文本分成块，避免超出 token 限制
  const segments = preprocess.segments;
  let storyContent = '';
  let charBudget = 6000; // 留给故事内容的字符预算

  for (const seg of segments) {
    if (charBudget <= 0) break;
    const toAdd = seg.content.slice(0, charBudget);
    storyContent += `\n\n[Segment ${seg.index + 1}]\n${toAdd}`;
    charBudget -= toAdd.length;
  }

  return [
    {
      role: 'system',
      content: MODULE_GEN_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: `Convert the following story into a complete TRPG module JSON.${analysisText}${styleText}

Story Text:
${storyContent}

Generate the complete module with scenes, npcs, items, events, and style configuration.`,
    },
  ];
}

/**
 * 构建风格分析请求
 */
export function buildStylePrompt(preprocess: PreprocessResult): LLMMessage[] {
  return [
    {
      role: 'system',
      content: `You are a visual style analyst for a visual novel RPG engine.
Analyze the story's tone, setting, and mood to generate a style configuration.

Respond ONLY with this JSON format:
{
  "palette": {
    "bg": "#0a0a0a",
    "accent": "#8b0000", 
    "text": "#e2e8f0",
    "dialogue_bg": "rgba(10,10,10,0.9)"
  },
  "atmosphere": "Suspenseful horror",
  "era": "modern|victorian|fantasy|sci-fi|ancient|medieval",
  "art_style": "dark_realistic|anime|pixel|watercolor|minimalist",
  "lighting": "low light, shadows|neon|daylight|moonlight|torchlight",
  "mood_keywords": ["suspense", "mystery", "dread"],
  "font_family": "sans-serif|serif|monospace|pixel",
  "effects": ["grain", "vignette"],
  "image_strategy": {
    "background": "search|generate|upload",
    "sprites": "search|generate|upload",
    "search_provider": "unsplash|pexels"
  }
}

Color palette rules:
- Horror: dark reds, blacks, grays (#0a0a0a, #8b0000, #e2e8f0)
- Fantasy: deep purples, golds, midnight blues (#1a0a2e, #ffd700, #e0e0e0)
- Sci-fi: cyans, magentas, dark grays (#0a0f1a, #00ffcc, #c0c0c0)
- Slice of life: warm tones, soft colors (#faf0e6, #ff8c42, #333333)
- Mystery: dark blues, amber (#0a0f14, #ffaa00, #d0d0d0)`,
    },
    {
      role: 'user',
      content: `Analyze the visual style for this story (${preprocess.stats.totalChars} chars):
\n---\n${preprocess.summary}\n---\n\nKeywords: ${preprocess.keywords.slice(0, 8).map((k) => k.word).join(', ')}`,
    },
  ];
}

/**
 * 构建图片关键词生成请求
 */
export function buildImageKeywordsPrompt(moduleJson: Record<string, unknown>): LLMMessage[] {
  return [
    {
      role: 'system',
      content: `Generate image search keywords for a visual novel module.
For each scene background and NPC sprite, create 3-5 descriptive English keywords
that would find good matching images on Unsplash or Pexels.

Respond ONLY with JSON:
{
  "backgrounds": [
    { "scene_id": "scene_1", "keywords": "dark abandoned hospital hallway flickering lights" }
  ],
  "sprites": [
    { "npc_id": "npc_1", "keywords": "young investigator portrait dark clothing serious expression" }
  ]
}`,
    },
    {
      role: 'user',
      content: `Generate image keywords for this module:\n${JSON.stringify(moduleJson, null, 2).slice(0, 4000)}`,
    },
  ];
}

/**
 * 构建模块优化/续写请求
 */
export function buildEnhancePrompt(
  currentModule: Record<string, unknown>,
  instruction: string,
): LLMMessage[] {
  return [
    {
      role: 'system',
      content: MODULE_GEN_SYSTEM_PROMPT + '\n\nYou are editing an existing module. Make the requested changes while preserving the existing structure.',
    },
    {
      role: 'user',
      content: `Current Module:\n${JSON.stringify(currentModule, null, 2).slice(0, 3000)}\n\nInstruction: ${instruction}\n\nReturn the complete updated module JSON.`,
    },
  ];
}
