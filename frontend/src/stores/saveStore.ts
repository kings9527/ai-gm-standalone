import { create } from 'zustand';
import type { GameSave, Campaign, Module } from '../types/module';
import { electronAPI } from '../api/electron';

export const TOTAL_SLOTS = 10;
export const QUICK_SAVE_SLOT = 0;

export interface SaveSlot {
  slotNumber: number;
  save: GameSave | null;
}

interface SaveState {
  saves: SaveSlot[];
  isLoading: boolean;
  error: string | null;
  lastSavedAt: string | null;

  // Actions
  loadSaves: (moduleId: string) => Promise<void>;
  createSave: (params: {
    slotNumber: number;
    name?: string;
    campaign: Campaign;
    module: Module;
    thumbnail?: string;
  }) => Promise<GameSave>;
  loadSave: (saveId: string) => Promise<GameSave | null>;
  deleteSave: (saveId: string, moduleId: string) => Promise<void>;
  autoSave: (params: {
    campaign: Campaign;
    module: Module;
    thumbnail?: string;
  }) => Promise<GameSave | null>;
  clearError: () => void;
}

function buildEmptySlots(): SaveSlot[] {
  return Array.from({ length: TOTAL_SLOTS }, (_, i) => ({
    slotNumber: i,
    save: null,
  }));
}

function organizeSaves(saves: GameSave[]): SaveSlot[] {
  const slots = buildEmptySlots();
  for (const save of saves) {
    const slotNum = (save as any).slot_number ?? 0;
    if (slotNum >= 0 && slotNum < TOTAL_SLOTS) {
      slots[slotNum] = { slotNumber: slotNum, save };
    }
  }
  return slots;
}

export const useSaveStore = create<SaveState>((set, get) => ({
  saves: buildEmptySlots(),
  isLoading: false,
  error: null,
  lastSavedAt: null,

  loadSaves: async (moduleId: string) => {
    set({ isLoading: true, error: null });
    try {
      const saves = await electronAPI.saveList(moduleId);
      set({ saves: organizeSaves(saves || []), isLoading: false });
    } catch (err: any) {
      console.error('[SaveStore] Failed to load saves:', err);
      set({ error: err.message || '加载存档失败', isLoading: false });
    }
  },

  createSave: async ({ slotNumber, name, campaign, module, thumbnail }) => {
    set({ isLoading: true, error: null });
    try {
      const existing = get().saves.find((s) => s.slotNumber === slotNumber)?.save;

      const saveData: any = {
        id: existing?.id || undefined,
        module_id: module.id,
        slot_number: slotNumber,
        name:
          name ||
          existing?.name ||
          `${module.name} - ${campaign.current_scene} - ${new Date().toLocaleString('zh-CN')}`,
        campaign,
        module,
        timestamp: new Date().toISOString(),
        thumbnail: thumbnail || existing?.thumbnail,
      };

      const result = await electronAPI.saveWrite(saveData);
      const newSave: GameSave = {
        ...saveData,
        id: result.id || existing?.id || `save_${Date.now()}_${slotNumber}`,
      };

      set((state) => {
        const newSaves = [...state.saves];
        newSaves[slotNumber] = { slotNumber, save: newSave };
        return { saves: newSaves, isLoading: false, lastSavedAt: newSave.timestamp };
      });

      return newSave;
    } catch (err: any) {
      console.error('[SaveStore] Failed to create save:', err);
      set({ error: err.message || '保存失败', isLoading: false });
      throw err;
    }
  },

  loadSave: async (saveId: string) => {
    set({ isLoading: true, error: null });
    try {
      const save = await electronAPI.saveRead(saveId);
      if (!save) {
        throw new Error('存档不存在或已损坏');
      }
      set({ isLoading: false });
      return save as GameSave;
    } catch (err: any) {
      console.error('[SaveStore] Failed to load save:', err);
      set({ error: err.message || '读档失败', isLoading: false });
      return null;
    }
  },

  deleteSave: async (saveId: string, moduleId: string) => {
    set({ isLoading: true, error: null });
    try {
      await electronAPI.saveDelete(saveId);
      // Refresh the list
      await get().loadSaves(moduleId);
    } catch (err: any) {
      console.error('[SaveStore] Failed to delete save:', err);
      set({ error: err.message || '删除存档失败', isLoading: false });
      throw err;
    }
  },

  autoSave: async ({ campaign, module, thumbnail }) => {
    try {
      const save = await get().createSave({
        slotNumber: QUICK_SAVE_SLOT,
        name: `【自动存档】${new Date().toLocaleString('zh-CN')}`,
        campaign,
        module,
        thumbnail,
      });
      console.log('[SaveStore] Auto-saved to slot', QUICK_SAVE_SLOT, save.timestamp);
      return save;
    } catch (err: any) {
      console.warn('[SaveStore] Auto-save failed:', err.message);
      return null;
    }
  },

  clearError: () => set({ error: null }),
}));
