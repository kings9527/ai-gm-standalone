import { create } from 'zustand';
import type { Module } from '../types/module';

interface ModuleState {
  currentModule: Module | null;
  modules: Module[]; // Imported/created modules
  
  setCurrentModule: (module: Module | null) => void;
  addModule: (module: Module) => void;
  removeModule: (moduleId: string) => void;
  updateModule: (moduleId: string, updates: Partial<Module>) => void;
}

export const useModuleStore = create<ModuleState>((set) => ({
  currentModule: null,
  modules: [],

  setCurrentModule: (module) => set({ currentModule: module }),
  
  addModule: (module) =>
    set((state) => ({
      modules: [...state.modules.filter((m) => m.id !== module.id), module],
    })),
  
  removeModule: (moduleId) =>
    set((state) => ({
      modules: state.modules.filter((m) => m.id !== moduleId),
      currentModule:
        state.currentModule?.id === moduleId ? null : state.currentModule,
    })),
  
  updateModule: (moduleId, updates) =>
    set((state) => ({
      modules: state.modules.map((m) =>
        m.id === moduleId ? { ...m, ...updates } : m
      ),
      currentModule:
        state.currentModule?.id === moduleId
          ? { ...state.currentModule, ...updates }
          : state.currentModule,
    })),
}));
