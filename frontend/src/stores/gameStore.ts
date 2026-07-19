import { create } from 'zustand';
import type { Campaign, Module, GameSave, NPCDialogueHistoryEntry, QuestLog } from '../types/module';
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

  // Phase 3-D: NPC 长期对话上下文记忆
  npcDialogueHistory: Record<string, NPCDialogueHistoryEntry[]>;
  addNpcDialogueHistory: (npcId: string, entries: NPCDialogueHistoryEntry[]) => void;
  setNpcDialogueHistory: (history: Record<string, NPCDialogueHistoryEntry[]>) => void;

  // Phase 3-E: 情绪/氛围引擎状态
  atmosphere: string | null;
  atmosphereOverlay: React.CSSProperties;
  atmosphereFilter: string;
  setAtmosphere: (atmosphere: string | null) => void;
  setAtmosphereOverlay: (overlay: React.CSSProperties) => void;
  setAtmosphereFilter: (filter: string) => void;
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

  // Phase 3-F: 任务系统状态
  questLog: QuestLog | null;
  setQuestLog: (questLog: QuestLog | null) => void;
  updateQuestLog: (updates: Partial<QuestLog>) => void;
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

  // Phase 3-D: NPC 对话历史初始值
  npcDialogueHistory: {},

  // Phase 3-F: 任务日志初始值
  questLog: null,

  setCampaign: (campaign) => set({
    campaign,
    isPlaying: true,
    inputHistory: campaign.inputHistory ?? [],
    // Phase 3-D: 兼容旧存档，无 npcDialogueHistory 时默认空对象
    npcDialogueHistory: campaign.npcDialogueHistory ?? {},
    // Phase 3-F: 兼容旧存档，无 questLog 时默认 null
    questLog: campaign.questLog ?? null,
  }),

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

  atmosphere: null,
  atmosphereOverlay: {},
  atmosphereFilter: '',
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsTransitioning: (transitioning) => set({ isTransitioning: transitioning }),
  setCurrentSceneId: (sceneId) => set({ currentSceneId: sceneId }),
  setAtmosphere: (atmosphere) => set({ atmosphere }),
  setAtmosphereOverlay: (atmosphereOverlay) => set({ atmosphereOverlay }),
  setAtmosphereFilter: (atmosphereFilter) => set({ atmosphereFilter }),

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

  // Phase 3-D: NPC 对话历史 Actions
  addNpcDialogueHistory: (npcId, entries) =>
    set((state) => {
      const existing = state.npcDialogueHistory[npcId] || [];
      // 合并并限制每个 NPC 最多保留 50 条完整对话记录（避免存档膨胀）
      const merged = [...existing, ...entries].slice(-50);
      const newHistory = { ...state.npcDialogueHistory, [npcId]: merged };
      // 同步到 campaign，确保存档时一并保存
      const updatedCampaign = state.campaign
        ? { ...state.campaign, npcDialogueHistory: newHistory }
        : null;
      return { npcDialogueHistory: newHistory, campaign: updatedCampaign };
    }),

  setNpcDialogueHistory: (history) =>
    set((state) => {
      const updatedCampaign = state.campaign
        ? { ...state.campaign, npcDialogueHistory: history }
        : null;
      return { npcDialogueHistory: history, campaign: updatedCampaign };
    }),

  // Phase 3-F: 任务日志 Actions
  setQuestLog: (questLog) =>
    set((state) => {
      const updatedCampaign = state.campaign
        ? { ...state.campaign, questLog: questLog ?? undefined }
        : null;
      return { questLog, campaign: updatedCampaign };
    }),

  updateQuestLog: (updates) =>
    set((state) => {
      if (!state.questLog) return state;
      const newLog = { ...state.questLog, ...updates };
      const updatedCampaign = state.campaign
        ? { ...state.campaign, questLog: newLog }
        : null;
      return { questLog: newLog, campaign: updatedCampaign };
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
      npcDialogueHistory: {},
      questLog: null,
    }),

  restoreFromSave: (save) =>
    set({
      campaign: save.campaign,
      module: save.module,
      isPlaying: true,
      currentSceneId: save.campaign.current_scene,
      // Phase 1-B: 兼容旧存档，无 inputHistory 时默认空数组
      inputHistory: save.campaign.inputHistory ?? [],
      // Phase 3-D: 兼容旧存档，无 npcDialogueHistory 时默认空对象
      npcDialogueHistory: save.campaign.npcDialogueHistory ?? {},
      // Phase 3-F: 兼容旧存档，无 questLog 时默认 null
      questLog: save.campaign.questLog ?? null,
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
