import { create } from 'zustand';
import type { Module } from '../types/module';

interface ModuleState {
  currentModule: Module | null;
  modules: Module[];
  loading: boolean;
  error: string | null;

  setCurrentModule: (module: Module | null) => void;
  addModule: (module: Module) => void;
  removeModule: (moduleId: string) => void;
  updateModule: (moduleId: string, updates: Partial<Module>) => void;
  setModules: (modules: Module[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Persistence
  loadFromStorage: () => void;
  saveToStorage: () => void;
  persistModule: (module: Module) => void;
  deleteFromStorage: (moduleId: string) => void;
}

const STORAGE_KEY = 'aigm_modules_v1';

export const useModuleStore = create<ModuleState>((set, get) => ({
  currentModule: null,
  modules: [],
  loading: false,
  error: null,

  setCurrentModule: (module) => set({ currentModule: module }),

  setModules: (modules) => set({ modules }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  addModule: (module) =>
    set((state) => {
      const filtered = state.modules.filter((m) => m.id !== module.id);
      const newModules = [...filtered, module];
      // Persist immediately
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newModules));
      } catch {
        // Storage quota exceeded, ignore
      }
      return { modules: newModules };
    }),

  removeModule: (moduleId) =>
    set((state) => {
      const newModules = state.modules.filter((m) => m.id !== moduleId);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newModules));
      } catch {
        // Ignore
      }
      return {
        modules: newModules,
        currentModule: state.currentModule?.id === moduleId ? null : state.currentModule,
      };
    }),

  updateModule: (moduleId, updates) =>
    set((state) => {
      const newModules = state.modules.map((m) =>
        m.id === moduleId ? { ...m, ...updates } : m
      );
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newModules));
      } catch {
        // Ignore
      }
      return {
        modules: newModules,
        currentModule:
          state.currentModule?.id === moduleId
            ? { ...state.currentModule, ...updates }
            : state.currentModule,
      };
    }),

  // Load modules from localStorage on startup
  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Module[];
        if (Array.isArray(parsed)) {
          set({ modules: parsed });
        } else {
          console.error('[moduleStore] localStorage data is not an array, ignoring');
        }
      }
    } catch (err) {
      console.error('[moduleStore] Failed to load from localStorage:', err);
    }
  },

  saveToStorage: () => {
    try {
      const { modules } = get();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
    } catch (err) {
    /* no-op */ }
  },

  persistModule: (module) => {
    const { modules } = get();
    const existing = modules.find((m) => m.id === module.id);
    if (existing) {
      get().updateModule(module.id, module);
    } else {
      get().addModule(module);
    }
    get().saveToStorage();
  },

  deleteFromStorage: (moduleId) => {
    get().removeModule(moduleId);
    get().saveToStorage();
  },
}));

// Auto-load on module import
if (typeof window !== 'undefined') {
  useModuleStore.getState().loadFromStorage();
}

export default useModuleStore;
