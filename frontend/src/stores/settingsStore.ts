import { create } from 'zustand';
import type { LLMConfig } from '../types/llm';

interface SettingsState {
  llmConfig: LLMConfig;
  imageStrategy: 'search' | 'generate' | 'upload';
  searchProvider: 'unsplash' | 'pexels';
  theme: 'auto' | 'dark' | 'light';
  typewriterSpeed: number; // ms per character
  soundEnabled: boolean;
  
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  setImageStrategy: (strategy: 'search' | 'generate' | 'upload') => void;
  setSearchProvider: (provider: 'unsplash' | 'pexels') => void;
  setTheme: (theme: 'auto' | 'dark' | 'light') => void;
  setTypewriterSpeed: (speed: number) => void;
  setSoundEnabled: (enabled: boolean) => void;
}

const defaultLLMConfig: LLMConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  maxTokens: 512,
  temperature: 0.7,
  timeout: 30000,
  retries: 2,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  llmConfig: { ...defaultLLMConfig },
  imageStrategy: 'search',
  searchProvider: 'unsplash',
  theme: 'auto',
  typewriterSpeed: 30,
  soundEnabled: true,

  setLLMConfig: (config) =>
    set((state) => ({
      llmConfig: { ...state.llmConfig, ...config },
    })),
  
  setImageStrategy: (strategy) => set({ imageStrategy: strategy }),
  setSearchProvider: (provider) => set({ searchProvider: provider }),
  setTheme: (theme) => set({ theme }),
  setTypewriterSpeed: (speed) => set({ typewriterSpeed: speed }),
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
}));
