import type { Module } from '../types/module';

/**
 * Module Exporter
 * Export module to JSON file for sharing.
 */

export class ModuleExporter {
  static exportToJSON(module: Module, filename?: string): void {
    const json = JSON.stringify(module, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${module.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static exportToURLHash(module: Module): string {
    const compressed = this.compressModule(module);
    return `${window.location.origin}${window.location.pathname}#${compressed}`;
  }

  static async exportToClipboard(module: Module): Promise<boolean> {
    try {
      const json = JSON.stringify(module, null, 2);
      await navigator.clipboard.writeText(json);
      return true;
    } catch {
      return false;
    }
  }

  private static compressModule(module: Module): string {
    // Simple compression: JSON.stringify + base64
    const json = JSON.stringify(module);
    try {
      const compressed = btoa(unescape(encodeURIComponent(json)));
      return compressed;
    } catch {
      return btoa(json);
    }
  }
}

export default ModuleExporter;
