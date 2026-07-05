import localforage from 'localforage';
import type { Module, GameSave } from '../types/module';

/**
 * Storage Manager
 * IndexedDB wrapper for modules, saves, and images.
 * Pure frontend — all data stored in browser.
 */

const MODULES_KEY = 'aigm_modules';
const SAVES_KEY = 'aigm_saves';
const IMAGES_KEY = 'aigm_images';

const imageStore = localforage.createInstance({
  name: 'AI-GM',
  storeName: 'images',
});

const saveStore = localforage.createInstance({
  name: 'AI-GM',
  storeName: 'saves',
});

const moduleStore = localforage.createInstance({
  name: 'AI-GM',
  storeName: 'modules',
});

export class StorageManager {
  // ===== Modules =====
  static async saveModule(module: Module): Promise<void> {
    await moduleStore.setItem(module.id, module);
    const list = await this.getModuleList();
    if (!list.includes(module.id)) {
      await moduleStore.setItem(MODULES_KEY, [...list, module.id]);
    }
  }

  static async getModule(moduleId: string): Promise<Module | null> {
    return moduleStore.getItem<Module>(moduleId);
  }

  static async getModuleList(): Promise<string[]> {
    return (await moduleStore.getItem<string[]>(MODULES_KEY)) || [];
  }

  static async deleteModule(moduleId: string): Promise<void> {
    await moduleStore.removeItem(moduleId);
    const list = await this.getModuleList();
    await moduleStore.setItem(MODULES_KEY, list.filter((id) => id !== moduleId));
  }

  // ===== Saves =====
  static async saveGame(save: GameSave): Promise<void> {
    await saveStore.setItem(save.id, save);
    const list = await this.getSaveList();
    if (!list.includes(save.id)) {
      await saveStore.setItem(SAVES_KEY, [...list, save.id]);
    }
  }

  static async getSave(saveId: string): Promise<GameSave | null> {
    return saveStore.getItem<GameSave>(saveId);
  }

  static async getSaveList(): Promise<string[]> {
    return (await saveStore.getItem<string[]>(SAVES_KEY)) || [];
  }

  static async deleteSave(saveId: string): Promise<void> {
    await saveStore.removeItem(saveId);
    const list = await this.getSaveList();
    await saveStore.setItem(SAVES_KEY, list.filter((id) => id !== saveId));
  }

  // ===== Images =====
  static async saveImage(key: string, imageData: string): Promise<void> {
    await imageStore.setItem(key, imageData);
  }

  static async getImage(key: string): Promise<string | null> {
    return imageStore.getItem<string>(key);
  }

  static async deleteImage(key: string): Promise<void> {
    await imageStore.removeItem(key);
  }

  static async listImages(): Promise<string[]> {
    const keys: string[] = [];
    await imageStore.iterate((_, key) => {
      keys.push(key);
    });
    return keys;
  }

  // ===== Export/Import All Data =====
  static async exportAll(): Promise<{
    modules: Module[];
    saves: GameSave[];
  }> {
    const moduleIds = await this.getModuleList();
    const modules = await Promise.all(
      moduleIds.map((id) => this.getModule(id))
    );

    const saveIds = await this.getSaveList();
    const saves = await Promise.all(
      saveIds.map((id) => this.getSave(id))
    );

    return {
      modules: modules.filter(Boolean) as Module[],
      saves: saves.filter(Boolean) as GameSave[],
    };
  }

  static async clearAll(): Promise<void> {
    await moduleStore.clear();
    await saveStore.clear();
    await imageStore.clear();
  }

  static async getStorageUsage(): Promise<{
    modules: number;
    saves: number;
    images: number;
    total: number;
  }> {
    const modules = await moduleStore.length();
    const saves = await saveStore.length();
    const images = await imageStore.length();
    return { modules, saves, images, total: modules + saves + images };
  }
}

export default StorageManager;
