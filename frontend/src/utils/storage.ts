import { electronAPI } from '../api/electron';

/**
 * Storage Manager (Electron Desktop App version)
 * Uses backend SQLite via IPC instead of IndexedDB.
 */

export class StorageManager {
  private _keys = {
    modules: 'aigm_modules',
    saves: 'aigm_saves',
    images: 'aigm_images',
  };

  async getModules() {
    return electronAPI.moduleList();
  }

  async saveModule(moduleData: any) {
    return electronAPI.moduleSave(moduleData);
  }

  async getModule(id: string) {
    return electronAPI.moduleGet(id);
  }

  async deleteModule(id: string) {
    return electronAPI.moduleDelete(id);
  }

  async importModule() {
    return electronAPI.moduleImport();
  }

  async exportModule(id: string) {
    return electronAPI.moduleExport(id);
  }

  // Saves
  async getSaves(moduleId: string) {
    return electronAPI.saveList(moduleId);
  }

  async saveCampaign(data: { id?: string; module_id: string; slot_number?: number; name?: string; campaign: any }) {
    return electronAPI.saveWrite(data);
  }

  async getSave(id: string) {
    return electronAPI.saveRead(id);
  }

  async deleteSave(id: string) {
    return electronAPI.saveDelete(id);
  }

  // Images
  async searchImages(query: string) {
    return electronAPI.imageSearch(query);
  }

  async downloadImage(url: string, type: string = 'bg') {
    return electronAPI.imageDownload({ url, type });
  }

  async generateImage(prompt: string, provider: string = 'dalle') {
    return electronAPI.imageGenerate({ prompt, provider });
  }

  async getImages(type: string) {
    return electronAPI.imageList(type);
  }

  // Settings
  async getSetting(key: string) {
    const result = await electronAPI.settingsGet(key);
    return result?.value ?? null;
  }

  async setSetting(key: string, value: any) {
    return electronAPI.settingsSet(key, value);
  }

  async getAllSettings() {
    return electronAPI.settingsGetAll();
  }

  async getUserDataPath() {
    return electronAPI.userDataPath();
  }
}

export default StorageManager;
