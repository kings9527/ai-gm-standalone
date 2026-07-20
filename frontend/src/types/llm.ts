import type { LLMProvider } from '../stores/settingsStore';

export interface LLMConfig {
  provider: LLMProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retries: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  cached: boolean;
}

export interface StyleAnalysisResult {
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
}

export interface GeneratedModule {
  module: import('./module').Module;
  imageKeywords: {
    backgrounds: { scene_id: string; keywords: string }[];
    sprites: { npc_id: string; keywords: string }[];
  };
}
