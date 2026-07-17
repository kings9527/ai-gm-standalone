import { create } from 'zustand';
import type { Campaign, Module, GameSave } from '../types/module';
import type { CombatState } from '../types/combat';
import type { GameStateMachine } from '../engine/state-machine';

interface GameState {
  campaign: Campaign | null;
  module: Module | null;
  stateMachine: GameStateMachine | null;
  combatState: CombatState | null;
  isPlaying: boolean;
  isTransitioning: boolean;
  currentSceneId: string | null;

  // Phase 1-B: 输入系统状态
  inputMode: 'choice' | 'free';
  freeInputText: string;
  inputHistory: string[]; // 从 campaign 派生或同步，UI 快速读取用

  // Actions
  setCampaign: (campaign: Campaign) => void;
  setModule: (module: Module) => void;
  setStateMachine: (sm: GameStateMachine | null) => void;
  setCombatState: (state: CombatState | null) => void;
  updateScene: (sceneId: string) => void;
  updatePlayer: (updates: Partial<Campaign['player']>) => void;
  updateGlobalVar: (key: string, value: unknown) => void;
  addToHistory: (sceneId: string) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsTransitioning: (transitioning: boolean) => void;
  setCurrentSceneId: (sceneId: string) => void;
  reset: () => void;

  // Phase 1-B: 输入系统 Actions
  setInputMode: (mode: 'choice' | 'free') => void;
  setFreeInputText: (text: string) => void;
  addInputHistory: (text: string) => void;

  // Restore from save
  restoreFromSave: (save: GameSave) => void;
  setPlayingAndScene: (sceneId: string) => void;
}

export const useGameStore = create<GameState>((set) => ({
  campaign: null,
  module: null,
  stateMachine: null,
  combatState: null,
  isPlaying: false,
  isTransitioning: false,
  currentSceneId: null,

  // Phase 1-B: 输入系统默认值
  inputMode: 'choice',
  freeInputText: '',
  inputHistory: [],

  setCampaign: (campaign) => set({ campaign, isPlaying: true, inputHistory: campaign.inputHistory ?? [] }),

  setModule: (module) => set({ module }),

  setStateMachine: (sm) => set({ stateMachine: sm }),

  setCombatState: (combatState) => set({ combatState }),

  updateScene: (sceneId) =>
    set((state) => ({
      campaign: state.campaign
        ? { ...state.campaign, current_scene: sceneId }
        : null,
      currentSceneId: sceneId,
    })),

  updatePlayer: (updates) =>
    set((state) => ({
      campaign: state.campaign
        ? { ...state.campaign, player: { ...state.campaign.player, ...updates } }
        : null,
    })),

  updateGlobalVar: (key, value) =>
    set((state) => ({
      campaign: state.campaign
        ? {
            ...state.campaign,
            global_vars: { ...state.campaign.global_vars, [key]: value },
          }
        : null,
    })),

  addToHistory: (sceneId) =>
    set((state) => ({
      campaign: state.campaign
        ? {
            ...state.campaign,
            scene_history: [...state.campaign.scene_history, sceneId],
          }
        : null,
    })),

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsTransitioning: (transitioning) => set({ isTransitioning: transitioning }),
  setCurrentSceneId: (sceneId) => set({ currentSceneId: sceneId }),

  // Phase 1-B: 输入系统 Actions
  setInputMode: (mode) => set({ inputMode: mode }),
  setFreeInputText: (text) => set({ freeInputText: text }),
  addInputHistory: (text) =>
    set((state) => {
      if (!text || text.trim() === '') return state;
      const trimmed = text.trim();
      // Phase 1-F: 限制保存最近 20 条，去重（如果最后一条相同则跳过）
      if (state.inputHistory.length > 0 && state.inputHistory[state.inputHistory.length - 1] === trimmed) {
        return state;
      }
      const newHistory = [...state.inputHistory, trimmed].slice(-20);
      const updatedCampaign = state.campaign
        ? { ...state.campaign, inputHistory: newHistory }
        : null;
      return { inputHistory: newHistory, campaign: updatedCampaign };
    }),

  reset: () =>
    set({
      campaign: null,
      module: null,
      stateMachine: null,
      combatState: null,
      isPlaying: false,
      isTransitioning: false,
      currentSceneId: null,
      inputMode: 'choice',
      freeInputText: '',
      inputHistory: [],
    }),

  restoreFromSave: (save) =>
    set({
      campaign: save.campaign,
      module: save.module,
      isPlaying: true,
      currentSceneId: save.campaign.current_scene,
      // Phase 1-B: 兼容旧存档，无 inputHistory 时默认空数组
      inputHistory: save.campaign.inputHistory ?? [],
      inputMode: 'choice',
      freeInputText: '',
    }),

  setPlayingAndScene: (sceneId) =>
    set((state) => ({
      isPlaying: true,
      currentSceneId: sceneId,
      campaign: state.campaign
        ? {
            ...state.campaign,
            current_scene: sceneId,
            scene_history: [...state.campaign.scene_history, sceneId],
          }
        : null,
    })),
}));
