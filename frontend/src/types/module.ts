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
  };
  effect?: Record<string, unknown>;
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
