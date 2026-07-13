import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMConfig } from '../types/llm';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto';

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

export type LLMProvider = 'openai' | 'claude' | 'ollama';
export type ImageStrategy = 'search' | 'generate' | 'upload';
export type ThemeMode = 'auto' | 'dark' | 'light';

export interface ImageConfig {
  unsplashKey: string;
  dalleKey: string;
  defaultStrategy: ImageStrategy;
}

export interface GameConfig {
  typewriterSpeed: number;      // ms per char
  fontSize: number;             // px
  autoAdvanceDelay: number;     // ms before auto-advancing
  skipUnread: boolean;          // allow skipping unread text
  soundEnabled: boolean;        // 音效开关
  fullscreen: boolean;          // 默认全屏模式
}

export interface ThemeConfig {
  mode: ThemeMode;
  customVars: Record<string, string>;
}

export interface AppSettings {
  llm: LLMConfig;
  image: ImageConfig;
  game: GameConfig;
  theme: ThemeConfig;
}

interface SettingsState extends AppSettings {
  /** @deprecated use `llm` instead — kept for backward compat */
  llmConfig: LLMConfig;
  loaded: boolean;
  setLLM: (partial: Partial<LLMConfig>) => void;
  setImage: (partial: Partial<ImageConfig>) => void;
  setGame: (partial: Partial<GameConfig>) => void;
  setTheme: (partial: Partial<ThemeConfig>) => void;
  saveToBackend: () => Promise<void>;
  loadFromBackend: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
//  Defaults
/* ------------------------------------------------------------------ */

const defaultLLM: LLMConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  maxTokens: 512,
  temperature: 0.7,
  timeout: 30000,
  retries: 2,
};

const defaultImage: ImageConfig = {
  unsplashKey: '',
  dalleKey: '',
  defaultStrategy: 'search',
};

const defaultGame: GameConfig = {
  typewriterSpeed: 30,
  fontSize: 16,
  autoAdvanceDelay: 0,
  skipUnread: false,
  soundEnabled: true,
  fullscreen: false,
};

const defaultTheme: ThemeConfig = {
  mode: 'dark',
  customVars: {},
};

/* ------------------------------------------------------------------ */
//  API helpers (direct HTTP to backend — works in both Electron & web dev)
/* ------------------------------------------------------------------ */

const API_BASE = 'http://localhost:9742';

async function apiPost(endpoint: string, body: any) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${endpoint} failed: ${res.status}`);
  return res.json();
}

async function apiGet(endpoint: string) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) throw new Error(`API ${endpoint} failed: ${res.status}`);
  return res.json();
}

/** Keys that should be encrypted before sending to backend */
const SENSITIVE_KEYS = ['apiKey', 'unsplashKey', 'dalleKey'];

/**
 * Recursively encrypt sensitive fields in a settings object.
 */
async function encryptSensitive(obj: Record<string, any>): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.includes(k) && typeof v === 'string' && v && !isEncrypted(v)) {
      out[k] = await encrypt(v);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out[k] = await encryptSensitive(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Recursively decrypt sensitive fields in a settings object.
 */
async function decryptSensitive(obj: Record<string, any>): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.includes(k) && typeof v === 'string' && v && isEncrypted(v)) {
      out[k] = await decrypt(v);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out[k] = await decryptSensitive(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
//  Store
/* ------------------------------------------------------------------ */

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // State
      llm: { ...defaultLLM },
      llmConfig: { ...defaultLLM },
      image: { ...defaultImage },
      game: { ...defaultGame },
      theme: { ...defaultTheme },
      loaded: false,

      // Setters (single-field merges)
      setLLM: (partial) =>
        set((s) => ({ llm: { ...s.llm, ...partial }, llmConfig: { ...s.llm, ...partial } })),
      setImage: (partial) =>
        set((s) => ({ image: { ...s.image, ...partial } })),
      setGame: (partial) =>
        set((s) => ({ game: { ...s.game, ...partial } })),
      setTheme: (partial) =>
        set((s) => ({ theme: { ...s.theme, ...partial } })),

      /**
       * Save all settings to backend via nested-object batch API.
       * Sensitive fields are encrypted before transmission.
       */
      saveToBackend: async () => {
        const state = get();
        const payload: AppSettings = {
          llm: { ...state.llm },
          image: { ...state.image },
          game: { ...state.game },
          theme: { ...state.theme },
        };
        const encrypted = await encryptSensitive(payload as Record<string, any>);
        await apiPost('/api/settings', encrypted);
      },

      /**
       * Load all settings from backend nested-object API.
       * Decrypts sensitive fields after retrieval.
       */
      loadFromBackend: async () => {
        try {
          const data = await apiGet('/api/settings');
          const decrypted = await decryptSensitive(data) as AppSettings;
          set({
            llm: { ...defaultLLM, ...decrypted.llm },
            llmConfig: { ...defaultLLM, ...decrypted.llm },
            image: { ...defaultImage, ...decrypted.image },
            game: { ...defaultGame, ...decrypted.game },
            theme: { ...defaultTheme, ...decrypted.theme },
            loaded: true,
          });
        } catch (err) {
          set({ loaded: true });
        }
      },
    }),
    {
      name: 'aigm-settings-local',
      // Only persist non-sensitive fields to localStorage as backup
      partialize: (state) => ({
        game: state.game,
        theme: state.theme,
      }),
    }
  )
);

/* ------------------------------------------------------------------ */
//  Model presets per provider
/* ------------------------------------------------------------------ */

export const PROVIDER_MODELS: Record<LLMProvider, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  claude: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  ollama: ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5', 'phi4'],
};

export const PROVIDER_DEFAULTS: Record<LLMProvider, Partial<LLMConfig>> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  claude: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-20241022' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
};
