import { create } from 'zustand';
import type { StyleConfig } from '../types/module';
import { electronAPI } from '../api/electron';

/**
 * style.json 扩展接口（含元数据）
 */
export interface StyleJson extends StyleConfig {
  id?: string;
  name?: string;
  description?: string;
  updatedAt?: string;
}

/**
 * CSS 变量映射表
 */
export interface CSSVariableMap {
  '--agm-bg': string;
  '--agm-accent': string;
  '--agm-text': string;
  '--agm-dialogue-bg': string;
  '--agm-font-family': string;
  '--agm-lighting': string;
}

/**
 * 构建 CSS 变量映射
 */
export function buildCSSVariables(style: StyleJson): CSSVariableMap {
  return {
    '--agm-bg': style.palette?.bg || '#0a0a0a',
    '--agm-accent': style.palette?.accent || '#8b0000',
    '--agm-text': style.palette?.text || '#e2e8f0',
    '--agm-dialogue-bg': style.palette?.dialogue_bg || 'rgba(10,10,10,0.9)',
    '--agm-font-family': style.font_family === 'serif' ? 'Georgia, "Noto Serif SC", serif'
      : style.font_family === 'sans-serif' ? 'system-ui, "Noto Sans SC", sans-serif'
      : style.font_family === 'monospace' ? '"Courier New", monospace'
      : style.font_family === 'pixel' ? '"Courier New", monospace'
      : style.font_family || 'system-ui, sans-serif',
    '--agm-lighting': style.lighting || 'none',
  };
}

/**
 * 应用 CSS 变量到 DOM
 */
export function applyCSSVariables(vars: CSSVariableMap): void {
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, val]) => {
    root.style.setProperty(key, val);
  });
}

/**
 * 清除 CSS 变量
 */
export function clearCSSVariables(): void {
  const root = document.documentElement;
  ['--agm-bg', '--agm-accent', '--agm-text', '--agm-dialogue-bg', '--agm-font-family', '--agm-lighting'].forEach((k) => {
    root.style.removeProperty(k);
  });
}

interface StyleStoreState {
  // 当前风格配置
  currentStyle: StyleJson | null;
  // 已保存的风格列表
  savedStyles: { id: string; name: string; updatedAt?: string }[];
  // 加载状态
  loading: boolean;
  error: string | null;

  // Actions
  setCurrentStyle: (style: StyleJson | null) => void;
  applyStyle: (style: StyleJson) => void;
  resetStyle: () => void;

  // 后端 API
  loadSavedStyles: () => Promise<void>;
  loadStyle: (id: string) => Promise<void>;
  saveStyle: (style: StyleJson) => Promise<string>;
  updateStyle: (id: string, style: Partial<StyleJson>) => Promise<void>;
  deleteStyle: (id: string) => Promise<void>;
}

export const useStyleStore = create<StyleStoreState>((set, get) => ({
  currentStyle: null,
  savedStyles: [],
  loading: false,
  error: null,

  setCurrentStyle: (style) => {
    set({ currentStyle: style });
    if (style) {
      applyCSSVariables(buildCSSVariables(style));
    } else {
      clearCSSVariables();
    }
  },

  applyStyle: (style) => {
    applyCSSVariables(buildCSSVariables(style));
    set({ currentStyle: style });
  },

  resetStyle: () => {
    clearCSSVariables();
    set({ currentStyle: null });
  },

  loadSavedStyles: async () => {
    set({ loading: true, error: null });
    try {
      const styles = await electronAPI.styleList();
      set({ savedStyles: styles || [], loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  loadStyle: async (id) => {
    set({ loading: true, error: null });
    try {
      const style = await electronAPI.styleGet(id);
      if (style) {
        applyCSSVariables(buildCSSVariables(style));
        set({ currentStyle: style, loading: false });
      }
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  saveStyle: async (style) => {
    set({ loading: true, error: null });
    try {
      const id = style.id || `style_${Date.now()}`;
      const toSave = { ...style, id, name: style.name || '未命名风格' };
      const res = await electronAPI.styleSave(toSave);
      set({ currentStyle: res.style || toSave, loading: false });
      // 刷新列表
      await get().loadSavedStyles();
      return res.id || id;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  updateStyle: async (id, updates) => {
    set({ loading: true, error: null });
    try {
      const res = await electronAPI.styleUpdate(id, updates);
      if (get().currentStyle?.id === id) {
        const merged = { ...get().currentStyle!, ...res.style };
        applyCSSVariables(buildCSSVariables(merged));
        set({ currentStyle: merged, loading: false });
      } else {
        set({ loading: false });
      }
      await get().loadSavedStyles();
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  deleteStyle: async (id) => {
    set({ loading: true, error: null });
    try {
      await electronAPI.styleDelete(id);
      if (get().currentStyle?.id === id) {
        clearCSSVariables();
        set({ currentStyle: null });
      }
      await get().loadSavedStyles();
      set({ loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },
}));

export default useStyleStore;
