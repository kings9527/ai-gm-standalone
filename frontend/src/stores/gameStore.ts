import { create } from 'zustand';
import type { Campaign, Module, GameSave } from '../types/module';
import type { GameStateMachine } from '../engine/state-machine';

interface GameState {
  campaign: Campaign | null;
  module: Module | null;
  stateMachine: GameStateMachine | null;
  isPlaying: boolean;
  isTransitioning: boolean;
  currentSceneId: string | null;

  // Actions
  setCampaign: (campaign: Campaign) => void;
  setModule: (module: Module) => void;
  setStateMachine: (sm: GameStateMachine | null) => void;
  updateScene: (sceneId: string) => void;
  updatePlayer: (updates: Partial<Campaign['player']>) => void;
  updateGlobalVar: (key: string, value: unknown) => void;
  addToHistory: (sceneId: string) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsTransitioning: (transitioning: boolean) => void;
  setCurrentSceneId: (sceneId: string) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  campaign: null,
  module: null,
  stateMachine: null,
  isPlaying: false,
  isTransitioning: false,
  currentSceneId: null,

  setCampaign: (campaign) => set({ campaign, isPlaying: true }),

  setModule: (module) => set({ module }),

  setStateMachine: (sm) => set({ stateMachine: sm }),

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

  reset: () =>
    set({
      campaign: null,
      module: null,
      stateMachine: null,
      isPlaying: false,
      isTransitioning: false,
      currentSceneId: null,
    }),
}));
