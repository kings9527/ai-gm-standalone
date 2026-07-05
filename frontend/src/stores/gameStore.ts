import { create } from 'zustand';
import type { Campaign, Player } from '../types/module';

interface GameState {
  campaign: Campaign | null;
  isPlaying: boolean;
  isTransitioning: boolean;
  
  // Actions
  setCampaign: (campaign: Campaign) => void;
  updateScene: (sceneId: string) => void;
  updatePlayer: (updates: Partial<Player>) => void;
  updateGlobalVar: (key: string, value: unknown) => void;
  addToHistory: (sceneId: string) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsTransitioning: (transitioning: boolean) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  campaign: null,
  isPlaying: false,
  isTransitioning: false,

  setCampaign: (campaign) => set({ campaign, isPlaying: true }),
  
  updateScene: (sceneId) =>
    set((state) => ({
      campaign: state.campaign
        ? { ...state.campaign, current_scene: sceneId }
        : null,
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
  
  reset: () => set({ campaign: null, isPlaying: false, isTransitioning: false }),
}));
