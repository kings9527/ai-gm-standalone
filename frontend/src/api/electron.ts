/**
 * Electron IPC API Client
 * Bridges frontend React to backend via Electron IPC channels.
 */

declare global {
  interface Window {
    electronAPI: {
      llmChat: (body: any) => Promise<any>;
      llmStream: (body: any) => Promise<void>;
      onStreamChunk: (callback: (chunk: string) => void) => void;
      onStreamEnd: (callback: () => void) => void;

      moduleList: () => Promise<any[]>;
      moduleGet: (id: string) => Promise<any>;
      moduleSave: (data: any) => Promise<any>;
      moduleDelete: (id: string) => Promise<any>;
      moduleImport: () => Promise<any>;
      moduleExport: (id: string) => Promise<boolean>;

      saveList: (moduleId: string) => Promise<any[]>;
      saveWrite: (data: any) => Promise<any>;
      saveRead: (id: string) => Promise<any>;
      saveDelete: (id: string) => Promise<any>;

      imageSearch: (query: string) => Promise<any>;
      imageDownload: (params: { url: string; type: string }) => Promise<any>;
      imageGenerate: (body: any) => Promise<any>;
      imageList: (type: string) => Promise<any[]>;
      imageDelete: (id: string) => Promise<any>;
      imageUpload: (params: { data: string; filename: string; type: string }) => Promise<any>;
      imageDialog: () => Promise<{ data: string; filename: string } | null>;

      styleList: () => Promise<any[]>;
      styleGet: (id: string) => Promise<any>;
      styleSave: (data: any) => Promise<any>;
      styleUpdate: (id: string, data: any) => Promise<any>;
      styleDelete: (id: string) => Promise<any>;

      settingsGet: (key: string) => Promise<any>;
      settingsSet: (key: string, value: any) => Promise<any>;
      settingsGetAll: () => Promise<any>;

      userDataPath: () => Promise<string>;
    };
  }
}

const api = typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : null;

// Fallback for web dev mode (when not in Electron)
const FALLBACK_BASE = 'http://localhost:9742';

async function fallbackFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${FALLBACK_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(`API ${endpoint} failed: ${res.status}`);
  return res.json();
}

export const electronAPI = {
  // LLM
  async llmChat(body: any) {
    if (api) return api.llmChat(body);
    return fallbackFetch('/api/llm/chat', { method: 'POST', body: JSON.stringify(body) });
  },

  async llmStream(body: any, onChunk: (chunk: string) => void, onEnd: () => void) {
    if (api) {
      api.onStreamChunk(onChunk);
      api.onStreamEnd(onEnd);
      await api.llmStream(body);
      return;
    }
    // Fallback: SSE via fetch
    const res = await fetch(`${FALLBACK_BASE}/api/llm/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
    onEnd();
  },

  // Modules
  async moduleList() {
    if (api) return api.moduleList();
    return fallbackFetch('/api/modules');
  },
  async moduleGet(id: string) {
    if (api) return api.moduleGet(id);
    return fallbackFetch(`/api/modules/${id}`);
  },
  async moduleSave(data: any) {
    if (api) return api.moduleSave(data);
    return fallbackFetch('/api/modules', { method: 'POST', body: JSON.stringify(data) });
  },
  async moduleDelete(id: string) {
    if (api) return api.moduleDelete(id);
    return fallbackFetch(`/api/modules/${id}`, { method: 'DELETE' });
  },
  async moduleImport() {
    if (api) return api.moduleImport();
    throw new Error('File import requires Electron');
  },
  async moduleExport(id: string) {
    if (api) return api.moduleExport(id);
    throw new Error('File export requires Electron');
  },

  // Saves
  async saveList(moduleId: string) {
    if (api) return api.saveList(moduleId);
    return fallbackFetch(`/api/saves?moduleId=${encodeURIComponent(moduleId)}`);
  },
  async saveWrite(data: any) {
    if (api) return api.saveWrite(data);
    return fallbackFetch('/api/saves', { method: 'POST', body: JSON.stringify(data) });
  },
  async saveRead(id: string) {
    if (api) return api.saveRead(id);
    return fallbackFetch(`/api/saves/${id}`);
  },
  async saveDelete(id: string) {
    if (api) return api.saveDelete(id);
    return fallbackFetch(`/api/saves/${id}`, { method: 'DELETE' });
  },

  // Images
  async imageSearch(query: string) {
    if (api) return api.imageSearch(query);
    return fallbackFetch(`/api/images/search?q=${encodeURIComponent(query)}`);
  },
  async imageDownload(params: { url: string; type: string }) {
    if (api) return api.imageDownload(params);
    return fallbackFetch('/api/images/download', { method: 'POST', body: JSON.stringify(params) });
  },
  async imageGenerate(body: any) {
    if (api) return api.imageGenerate(body);
    return fallbackFetch('/api/images/generate', { method: 'POST', body: JSON.stringify(body) });
  },
  async imageList(type: string) {
    if (api) return api.imageList(type);
    return fallbackFetch(`/api/images?type=${encodeURIComponent(type)}`);
  },
  async imageDelete(id: string) {
    if (api) return api.imageDelete(id);
    return fallbackFetch(`/api/images/${id}`, { method: 'DELETE' });
  },
  async imageUpload(params: { data: string; filename: string; type: string }) {
    if (api) return api.imageUpload(params);
    return fallbackFetch('/api/images/upload', { method: 'POST', body: JSON.stringify(params) });
  },
  async imageDialog() {
    if (api) return api.imageDialog();
    throw new Error('File dialog requires Electron');
  },

  // Styles
  async styleList() {
    if (api) return api.styleList();
    return fallbackFetch('/api/styles');
  },
  async styleGet(id: string) {
    if (api) return api.styleGet(id);
    return fallbackFetch(`/api/styles/${encodeURIComponent(id)}`);
  },
  async styleSave(data: any) {
    if (api) return api.styleSave(data);
    return fallbackFetch('/api/styles', { method: 'POST', body: JSON.stringify(data) });
  },
  async styleUpdate(id: string, data: any) {
    if (api) return api.styleUpdate(id, data);
    return fallbackFetch(`/api/styles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async styleDelete(id: string) {
    if (api) return api.styleDelete(id);
    return fallbackFetch(`/api/styles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // Settings
  async settingsGet(key: string) {
    if (api) return api.settingsGet(key);
    return fallbackFetch(`/api/settings/${encodeURIComponent(key)}`);
  },
  async settingsSet(key: string, value: any) {
    if (api) return api.settingsSet(key, value);
    return fallbackFetch('/api/settings', { method: 'POST', body: JSON.stringify({ key, value }) });
  },
  async settingsGetAll() {
    if (api) return api.settingsGetAll();
    return fallbackFetch('/api/settings');
  },

  /** Save entire nested settings object (new batch mode) */
  async settingsSaveAll(payload: any) {
    if (api) {
      // IPC fallback: use settingsSet with empty key to signal batch mode (deprecated)
      // or simply call settingsGetAll and do nothing — actually we need a new IPC channel.
      // For now, use direct fetch in both modes.
    }
    return fallbackFetch('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
  },

  async userDataPath() {
    if (api) return api.userDataPath();
    return '/tmp/ai-gm';
  },

  async quit() {
    if (api && typeof (api as any).quit === 'function') {
      return (api as any).quit();
    }
    window.close();
  },
};

export default electronAPI;
