import type { Module } from '../types/module';
import { ModuleValidator, type ValidationResult } from './validator';

export interface ImportResult {
  success: boolean;
  module?: Module;
  error?: string;
  validation?: ValidationResult;
}

export type ConflictAction = 'overwrite' | 'rename' | 'cancel';

export interface ConflictInfo {
  existingModule: Module;
  newModule: Module;
  conflictType: 'id' | 'name';
}

/**
 * Enhanced Module Importer
 * Supports file import, clipboard import, URL hash import, and validation.
 */
export class ModuleImporter {
  /**
   * Import from a File object (browser drag-drop or file input)
   */
  static async fromFile(file: File): Promise<ImportResult> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          resolve(this.parseAndValidate(text));
        } catch (err) {
          resolve({ success: false, error: (err as Error).message });
        }
      };
      reader.onerror = () => {
        resolve({ success: false, error: '文件读取失败' });
      };
      reader.readAsText(file);
    });
  }

  /**
   * Import from Electron file dialog (Electron IPC)
   * Requires electronAPI.moduleImport to be available.
   */
  static async fromElectronDialog(): Promise<ImportResult> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.moduleImport) {
        const result = await window.electronAPI.moduleImport();
        if (!result) {
          return { success: false, error: '用户取消了导入' };
        }
        return this.parseAndValidate(JSON.stringify(result));
      }
      return { success: false, error: 'Electron API 不可用，请使用浏览器文件导入' };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Import from clipboard text
   */
  static async fromClipboard(): Promise<ImportResult> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        return { success: false, error: '剪贴板为空' };
      }
      return this.parseAndValidate(text);
    } catch (err) {
      if ((err as Error).name === 'NotAllowedError') {
        return { success: false, error: '没有剪贴板读取权限，请手动粘贴' };
      }
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Import from pasted text (manual paste input)
   */
  static fromText(text: string): ImportResult {
    if (!text.trim()) {
      return { success: false, error: '输入内容为空' };
    }
    return this.parseAndValidate(text);
  }

  /**
   * Import from URL hash (Base64 compressed module data)
   */
  static fromURLHash(hash: string): ImportResult {
    try {
      const compressed = hash.replace(/^#/, '');
      if (!compressed) return { success: false, error: 'URL Hash 为空' };
      const json = this.decompressModule(compressed);
      return this.parseAndValidate(json);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Check if importing this module would conflict with existing modules
   */
  static checkConflict(
    module: Module,
    existingModules: Module[]
  ): ConflictInfo | null {
    const byId = existingModules.find((m) => m.id === module.id);
    if (byId) {
      return { existingModule: byId, newModule: module, conflictType: 'id' };
    }
    const byName = existingModules.find((m) => m.name === module.name);
    if (byName) {
      return { existingModule: byName, newModule: module, conflictType: 'name' };
    }
    return null;
  }

  /**
   * Resolve conflict by renaming the module with a suffix
   */
  static renameModule(module: Module, existingModules: Module[]): Module {
    let newName = module.name;
    let suffix = 1;
    const nameExists = (n: string) => existingModules.some((m) => m.name === n);
    while (nameExists(newName)) {
      suffix++;
      newName = `${module.name} (${suffix})`;
    }
    // Also ensure unique id
    let newId = module.id;
    suffix = 1;
    const idExists = (id: string) => existingModules.some((m) => m.id === id);
    while (idExists(newId)) {
      suffix++;
      newId = `${module.id}_${suffix}`;
    }
    return { ...module, id: newId, name: newName };
  }

  /**
   * Parse JSON and validate against module schema
   */
  private static parseAndValidate(text: string): ImportResult {
    try {
      const parsed = JSON.parse(text);
      const validation = ModuleValidator.validate(parsed);
      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
        return {
          success: false,
          error: `校验失败: ${errorMessages}`,
          validation,
        };
      }
      return { success: true, module: parsed as Module, validation };
    } catch (err) {
      if (err instanceof SyntaxError) {
        return { success: false, error: `JSON 解析错误: ${err.message}` };
      }
      return { success: false, error: (err as Error).message };
    }
  }

  private static decompressModule(compressed: string): string {
    try {
      // Try UTF-8 safe decoding first
      const decoded = decodeURIComponent(escape(atob(compressed)));
      return decoded;
    } catch {
      // Fallback to direct base64 decode
      return atob(compressed);
    }
  }
}

export default ModuleImporter;
