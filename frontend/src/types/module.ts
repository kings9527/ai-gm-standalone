export interface Module {
  id: string;
  name: string;
  system: 'coc' | 'dnd5e' | 'custom';
  version: string;
  style: StyleConfig;
  start_scene: string;
  scenes: Record<string, Scene>;
  npcs: Record<string, NPC>;
  items: Record<string, Item>;
  events?: Record<string, Event>;
}

export interface StyleConfig {
  palette: {
    bg: string;
    accent: string;
    text: string;
    dialogue_bg: string;
  };
  atmosphere: string;
  era: string;
  art_style: string;
  lighting: string;
  mood_keywords: string[];
  font_family: string;
  effects: string[];
  image_strategy: {
    background: 'search' | 'generate' | 'upload';
    sprites: 'search' | 'generate' | 'upload';
    search_provider: 'unsplash' | 'pexels';
  };
}

export interface Scene {
  id: string;
  title: string;
  description: string;
  bg: string;
  bg_music?: string;
  sprites: SpritePlacement[];
  dialogue: DialogueEntry;
  choices?: Choice[];
  exits?: Exit[];
  interactables?: string[];
  npcs?: string[];
  combat?: CombatConfig;
  ending?: EndingConfig;
  events?: string[];
  /** Phase 2-C: 隐藏事件列表，需特定自然语言输入触发 */
  hidden_events?: Event[];
}

export interface SpritePlacement {
  char_id: string;
  position: 'left' | 'center' | 'right';
  expression: string;
  enter_animation: 'fade' | 'slide_left' | 'slide_right' | 'none';
}

export interface DialogueEntry {
  speaker: string | null;
  text: string;
  typewriter?: boolean;
  voice?: string;
}

export interface Choice {
  id: string;
  text: string;
  condition?: Condition;
  action: 'next' | 'scene' | 'dice_check' | 'combat' | 'custom';
  target?: string;
  dice_check?: { skill: string; target: number };
}

export interface Exit {
  target: string;
  label: string;
  description?: string;
  condition?: Condition;
}

export interface Condition {
  [key: string]: number | boolean | string | [number, number];
}

export interface NPC {
  id: string;
  name: string;
  description: string;
  personality?: string;
  role: 'neutral' | 'ally' | 'enemy' | 'Boss';
  attitude: string;
  stats: Record<string, number>;
  hp: number;
  sanity?: number;
  sprites: Record<string, string>; // expression -> image URL
  secrets?: { keyword: string; reveal_text: string }[];
  dialogue?: Record<string, string>;
  /** Phase 2-F: NPC 对话树 — 结构化多分支对话 */
  dialogue_tree?: DialogueTree;
  /** Phase 2-F: NPC 动态响应模板 — 根据 personality 和场景生成不同回应 */
  dynamic_response?: DynamicResponseConfig;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  readable?: boolean;
  usable?: boolean;
  content?: string;
  effects?: (string | Effect)[];
}

export interface Effect {
  type: string;
  target?: string;
  operation?: string;
  value?: number | string;
}

export interface Event {
  id: string;
  description: string;
  trigger: {
    scene?: string;
    action?: string;
    time?: string;
    chance?: number;
    condition?: Condition;
    /** Phase 2-C: 自然语言关键词匹配。玩家输入包含任一关键词时触发 */
    keywords?: string[];
    /** Phase 2-C: 自然语言匹配模式。'exact'=精确匹配, 'contains'=包含匹配, 'fuzzy'=模糊匹配 */
    match_mode?: 'exact' | 'contains' | 'fuzzy';
    /** Phase 2-C: 最小匹配关键词数量（默认1） */
    min_match_count?: number;
  };
  effect?: Record<string, unknown>;
  /** Phase 2-C: 事件完成后解锁的场景内容 */
  unlocks?: {
    exits?: Exit[];
    npcs?: string[];
    items?: string[];
    interactables?: string[];
  };
  repeatable?: boolean;
  sanity_check?: { target: number; failure: string };
}

export interface CombatConfig {
  enabled: boolean;
  enemies: string[];
  ambush?: boolean;
}

export interface EndingConfig {
  type: 'good' | 'bad' | 'true' | 'madness' | 'death';
  description: string;
  conditions?: Condition;
}

// ───────────────────────────────────────────
// Phase 2-F: NPC 自由对话系统类型定义
// ───────────────────────────────────────────

/** 对话树节点 — 支持条件分支和玩家输入匹配 */
export interface DialogueTreeNode {
  id: string;
  /** NPC 在此节点的台词 */
  text: string;
  /** 进入此节点的条件（可选） */
  condition?: DialogueCondition;
  /** 玩家可能的回应分支 */
  branches?: DialogueBranch[];
  /** 到达此节点时触发的动作 */
  action?: DialogueNodeAction;
}

/** 对话节点进入条件 */
export interface DialogueCondition {
  /** 最低信任值（默认 0） */
  min_trust?: number;
  /** 最高恐惧值（默认 100） */
  max_fear?: number;
  /** 要求的态度状态 */
  attitude?: string;
  /** 要求的全局标记 */
  flags?: string[];
  /** 要求已揭示的秘密 */
  secrets_revealed?: string[];
}

/** 对话分支 — 匹配玩家输入或选择 */
export interface DialogueBranch {
  id: string;
  /** 分支显示文本（用于选项模式） */
  label: string;
  /** 匹配模式：keywords = 关键词匹配，regex = 正则匹配，any = 任意输入 */
  match_type: 'keywords' | 'regex' | 'any' | 'choice';
  /** 匹配关键词列表（keywords 模式下） */
  keywords?: string[];
  /** 正则表达式（regex 模式下） */
  pattern?: string;
  /** 匹配后跳转的节点 ID */
  next_node?: string;
  /** 匹配后的即时回复文本（覆盖节点文本） */
  response_text?: string;
  /** 分支触发的效果 */
  effects?: DialogueEffect[];
}

/** 对话节点动作 */
export interface DialogueNodeAction {
  type: 'set_flag' | 'change_attitude' | 'reveal_secret' | 'trigger_event' | 'none';
  /** set_flag: 标记名称 */
  flag_name?: string;
  /** change_attitude: 目标态度 */
  target_attitude?: string;
  /** reveal_secret: 秘密关键词 */
  secret_keyword?: string;
  /** trigger_event: 事件 ID */
  event_id?: string;
}

/** 对话效果 */
export interface DialogueEffect {
  type: 'trust_delta' | 'fear_delta' | 'suspicion_delta' | 'sanity_delta';
  value: number;
}

/** 对话树 — 根节点 ID + 节点映射 */
export interface DialogueTree {
  /** 起始节点 ID */
  root_node: string;
  /** 所有节点映射 */
  nodes: Record<string, DialogueTreeNode>;
  /** 默认回复（无匹配分支时） */
  fallback_text?: string;
}

/** 动态响应配置 — 基于 personality 和场景生成回应 */
export interface DynamicResponseConfig {
  /** 基础性格标签（如：cautious, aggressive, kind, mysterious） */
  personality_tags: string[];
  /** 主动发起对话的触发器 */
  initiative_triggers: InitiativeTrigger[];
  /** 响应模板库 */
  response_templates: ResponseTemplate[];
  /** 默认情绪基调 */
  default_emotion: string;
}

/** NPC 主动发起对话的触发器 */
export interface InitiativeTrigger {
  id: string;
  /** 触发场景 ID 或 'any' */
  scene_id: string;
  /** 触发条件描述 */
  condition: string;
  /** 触发时 NPC 台词 */
  dialogue: string;
  /** 台词情绪 */
  emotion: string;
  /** 优先级（越高越优先） */
  priority: number;
  /** 只能触发一次 */
  once_only?: boolean;
}

/** 响应模板 — 匹配特定意图或上下文 */
export interface ResponseTemplate {
  id: string;
  /** 匹配的意图类型 */
  intent_match: string[];
  /** 匹配关键词 */
  keywords?: string[];
  /** 回复模板（支持占位符：{npc_name}, {player_name}, {topic}） */
  templates: string[];
  /** 回复情绪 */
  emotion: string;
  /** 信任值变化 */
  trust_delta?: number;
  /** 恐惧值变化 */
  fear_delta?: number;
}

// ───────────────────────────────────────────

export interface Campaign {
  id: string;
  module_id: string;
  player: Player;
  current_scene: string;
  scene_history: string[];
  global_vars: Record<string, unknown>;
  npcs_state: Record<string, NPCState>;
  combat_state?: CombatState | null;
  flags: Record<string, boolean>;
  turn: number;
  inputHistory?: string[]; // 玩家自由输入历史（Phase 1-B 新增）
}

export interface Player {
  name: string;
  stats: Record<string, number>;
  hp: number;
  max_hp: number;
  sanity: number;
  max_sanity: number;
  inventory: string[];
  status_effects?: StatusEffect[];
}

export interface NPCState {
  id: string;
  current_hp: number;
  current_san: number;
  attitude: string;
  trust: number;
  fear: number;
  suspicion: number;
  known_topics: string[];
  secrets_revealed: string[];
  current_action: string | null;
  turns_in_scene: number;
  is_alive: boolean;
  custom_vars: Record<string, unknown>;
}

export interface CombatState {
  active: boolean;
  current_turn: string;
  turn_order: string[];
  round: number;
  enemies: Record<string, { hp: number; max_hp: number }>;
}

export interface StatusEffect {
  type: string;
  duration: string;
  description: string;
}

import type { VNState } from './engine';

export interface GameSave {
  id: string;
  name: string;
  campaign: Campaign;
  module: Module;
  timestamp: string;
  thumbnail?: string;
  vnSnapshot?: VNState; // 存档时 VN 引擎状态
}

export interface ImageItem {
  id: string;
  type: string;
  source: string;
  url: string | null;
  local_path: string | null;
  prompt: string | null;
  created_at: string;
}
