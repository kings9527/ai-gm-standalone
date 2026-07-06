const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script — exposes safe IPC API to renderer process
 * Renderer can only call these predefined channels.
 */

contextBridge.exposeInMainWorld('electronAPI', {
  // LLM
  llmChat: (body) => ipcRenderer.invoke('aigm:llm:chat', body),
  llmStream: (body) => ipcRenderer.invoke('aigm:llm:stream', body),
  onStreamChunk: (callback) => ipcRenderer.on('aigm:llm:stream:chunk', (_event, chunk) => callback(chunk)),
  onStreamEnd: (callback) => ipcRenderer.on('aigm:llm:stream:end', callback),

  // Modules
  moduleList: () => ipcRenderer.invoke('aigm:module:list'),
  moduleGet: (id) => ipcRenderer.invoke('aigm:module:get', id),
  moduleSave: (data) => ipcRenderer.invoke('aigm:module:save', data),
  moduleDelete: (id) => ipcRenderer.invoke('aigm:module:delete', id),
  moduleImport: () => ipcRenderer.invoke('aigm:module:import'),
  moduleExport: (id) => ipcRenderer.invoke('aigm:module:export', id),

  // Saves
  saveList: (moduleId) => ipcRenderer.invoke('aigm:save:list', moduleId),
  saveWrite: (data) => ipcRenderer.invoke('aigm:save:write', data),
  saveRead: (id) => ipcRenderer.invoke('aigm:save:read', id),
  saveDelete: (id) => ipcRenderer.invoke('aigm:save:delete', id),

  // Images
  imageSearch: (query) => ipcRenderer.invoke('aigm:image:search', query),
  imageDownload: (params) => ipcRenderer.invoke('aigm:image:download', params),
  imageGenerate: (body) => ipcRenderer.invoke('aigm:image:generate', body),
  imageList: (type) => ipcRenderer.invoke('aigm:image:list', type),
  imageDelete: (id) => ipcRenderer.invoke('aigm:image:delete', id),
  imageUpload: (params) => ipcRenderer.invoke('aigm:image:upload', params),
  imageDialog: () => ipcRenderer.invoke('aigm:image:dialog'),

  // Settings
  settingsGet: (key) => ipcRenderer.invoke('aigm:settings:get', key),
  settingsSet: (key, value) => ipcRenderer.invoke('aigm:settings:set', { key, value }),
  settingsGetAll: () => ipcRenderer.invoke('aigm:settings:getAll'),

  // Path
  userDataPath: () => ipcRenderer.invoke('aigm:path:userData'),
});
