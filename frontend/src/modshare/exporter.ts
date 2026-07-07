import type { Module } from '../types/module';

export interface ExportResult {
  success: boolean;
  url?: string;
  filename?: string;
  error?: string;
}

/**
 * Enhanced Module Exporter
 * Supports JSON file export, zip export (with images), URL hash sharing, and clipboard.
 */
export class ModuleExporter {
  /**
   * Export module as JSON file (browser download)
   */
  static exportToJSON(module: Module, filename?: string): ExportResult {
    try {
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

      return { success: true, filename: a.download };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Export module via Electron save dialog (if available)
   */
  static async exportToFile(module: Module): Promise<ExportResult> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.moduleExport) {
        const result = await window.electronAPI.moduleExport(module.id);
        if (result) {
          return { success: true, filename: `${module.id}.json` };
        }
        return { success: false, error: '导出被取消或失败' };
      }
      // Fallback to browser download
      return this.exportToJSON(module);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Export module as a zip file containing JSON + image resources
   * Requires JSZip to be available. If not available, falls back to JSON-only.
   */
  static async exportToZip(
    module: Module,
    imageMap?: Record<string, Blob>
  ): Promise<ExportResult> {
    try {
      // Check if JSZip is available (dynamic import)
      let JSZip: any;
      try {
        const mod = await import('jszip');
        JSZip = mod.default || mod;
      } catch {
        // JSZip not installed, fallback to JSON-only
        return this.exportToJSON(module, `${module.id}.zip.json`);
      }

      const zip = new JSZip();

      // Add module JSON
      const json = JSON.stringify(module, null, 2);
      zip.file(`${module.id}.json`, json);

      // Add images if provided
      if (imageMap) {
        const imagesFolder = zip.folder('images');
        for (const [filename, blob] of Object.entries(imageMap)) {
          imagesFolder?.file(filename, blob);
        }
      }

      // Also auto-collect sprite URLs from module and try to fetch them
      const collectedImages = await this.collectImagesFromModule(module);
      if (collectedImages.length > 0) {
        const imagesFolder = zip.folder('images') || zip;
        for (const { filename, blob } of collectedImages) {
          imagesFolder.file(filename, blob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${module.id}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { success: true, filename: `${module.id}.zip` };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Export module to a shareable URL hash (Base64 compressed)
   */
  static exportToURLHash(module: Module): ExportResult {
    try {
      const compressed = this.compressModule(module);
      const hash = `${window.location.origin}${window.location.pathname}#${compressed}`;
      return { success: true, url: hash };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Copy module JSON to clipboard
   */
  static async exportToClipboard(module: Module): Promise<ExportResult> {
    try {
      const json = JSON.stringify(module, null, 2);
      await navigator.clipboard.writeText(json);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Copy shareable URL to clipboard
   */
  static async copyShareURL(module: Module): Promise<ExportResult> {
    const result = this.exportToURLHash(module);
    if (!result.success || !result.url) return result;
    try {
      await navigator.clipboard.writeText(result.url);
      return { success: true, url: result.url };
    } catch (err) {
      return { success: true, url: result.url, error: 'URL 已生成但复制到剪贴板失败' };
    }
  }

  private static compressModule(module: Module): string {
    const json = JSON.stringify(module);
    try {
      // UTF-8 safe base64 encoding
      const compressed = btoa(unescape(encodeURIComponent(json)));
      return compressed;
    } catch {
      return btoa(json);
    }
  }

  /**
   * Collect image resources from module (sprite URLs, bg URLs)
   * Attempts to fetch them as blobs for zip packaging.
   */
  private static async collectImagesFromModule(
    module: Module
  ): Promise<{ filename: string; blob: Blob }[]> {
    const images: { filename: string; blob: Blob }[] = [];
    const seenUrls = new Set<string>();

    // Collect background URLs from scenes
    for (const scene of Object.values(module.scenes)) {
      if (scene.bg && scene.bg.startsWith('http') && !seenUrls.has(scene.bg)) {
        seenUrls.add(scene.bg);
        try {
          const blob = await this.fetchImageBlob(scene.bg);
          if (blob) {
            const ext = this.getImageExtension(scene.bg);
            images.push({ filename: `bg_${scene.id}.${ext}`, blob });
          }
        } catch {
          // Skip failed fetches
        }
      }
    }

    // Collect sprite URLs from NPCs
    for (const npc of Object.values(module.npcs)) {
      for (const [expression, url] of Object.entries(npc.sprites)) {
        if (url && url.startsWith('http') && !seenUrls.has(url)) {
          seenUrls.add(url);
          try {
            const blob = await this.fetchImageBlob(url);
            if (blob) {
              const ext = this.getImageExtension(url);
              images.push({ filename: `sprite_${npc.id}_${expression}.${ext}`, blob });
            }
          } catch {
            // Skip failed fetches
          }
        }
      }
    }

    return images;
  }

  private static async fetchImageBlob(url: string): Promise<Blob | null> {
    try {
      const response = await fetch(url, { mode: 'no-cors' });
      if (!response.ok && response.type !== 'opaque') return null;
      return await response.blob();
    } catch {
      return null;
    }
  }

  private static getImageExtension(url: string): string {
    const match = url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i);
    return match ? match[1].toLowerCase() : 'png';
  }
}

export default ModuleExporter;
