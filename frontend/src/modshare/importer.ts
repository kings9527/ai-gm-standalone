import type { Module } from '../types/module';

/**
 * Module Importer
 * Import module from JSON file or URL hash.
 */

export interface ImportResult {
  success: boolean;
  module?: Module;
  error?: string;
}

export class ModuleImporter {
  static async fromFile(file: File): Promise<ImportResult> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const module = this.parseModule(text);
          resolve({ success: true, module });
        } catch (err) {
          resolve({ success: false, error: (err as Error).message });
        }
      };
      reader.onerror = () => {
        resolve({ success: false, error: 'Failed to read file' });
      };
      reader.readAsText(file);
    });
  }

  static fromURLHash(hash: string): ImportResult {
    try {
      const compressed = hash.replace(/^#/, '');
      if (!compressed) return { success: false, error: 'Empty hash' };
      const json = this.decompressModule(compressed);
      const module = this.parseModule(json);
      return { success: true, module };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  static async fromClipboard(): Promise<ImportResult> {
    try {
      const text = await navigator.clipboard.readText();
      const module = this.parseModule(text);
      return { success: true, module };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  static parseModule(text: string): Module {
    const parsed = JSON.parse(text);
    if (!parsed.id || !parsed.name || !parsed.scenes) {
      throw new Error('Invalid module: missing required fields (id, name, scenes)');
    }
    return parsed as Module;
  }

  private static decompressModule(compressed: string): string {
    try {
      const decoded = decodeURIComponent(escape(atob(compressed)));
      return decoded;
    } catch {
      return atob(compressed);
    }
  }
}

export default ModuleImporter;
