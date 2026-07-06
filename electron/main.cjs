const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Keep a global reference to prevent GC
let mainWindow;
let backendProcess;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const BACKEND_PORT = 9742; // Fixed port for backend

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'default',
    show: false,
  });

  // Load frontend
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  const backendPath = isDev
    ? path.join(__dirname, '../backend/src/index.js')
    : path.join(process.resourcesPath, 'backend/src/index.js');

  backendProcess = spawn('node', [backendPath], {
    env: { ...process.env, PORT: String(BACKEND_PORT), NODE_ENV: isDev ? 'development' : 'production', AIGM_USER_DATA: app.getPath('userData') },
    stdio: 'pipe',
  });

  backendProcess.stdout.on('data', (data) => {
    console.log('[Backend]', data.toString().trim());
  });

  backendProcess.stderr.on('data', (data) => {
    console.error('[Backend]', data.toString().trim());
  });

  backendProcess.on('exit', (code) => {
    console.log(`[Backend] exited with code ${code}`);
  });

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      const http = require('http');
      const req = http.get(`http://localhost:${BACKEND_PORT}/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(checkInterval);
          resolve(true);
        }
      });
      req.on('error', () => {});
    }, 500);

    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('Backend failed to start'));
    }, 15000);
  });
}

// IPC Handlers — bridge to backend API
const API_BASE = `http://localhost:${BACKEND_PORT}`;

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(`API ${endpoint} failed: ${res.status}`);
  return res.json();
}

// LLM
ipcMain.handle('aigm:llm:chat', async (_event, body) => {
  return apiFetch('/api/llm/chat', { method: 'POST', body: JSON.stringify(body) });
});

ipcMain.handle('aigm:llm:stream', async (event, body) => {
  const res = await fetch(`${API_BASE}/api/llm/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    event.sender.send('aigm:llm:stream:chunk', chunk);
  }
  event.sender.send('aigm:llm:stream:end');
});

// Modules
ipcMain.handle('aigm:module:list', async () => apiFetch('/api/modules'));
ipcMain.handle('aigm:module:get', async (_event, id) => apiFetch(`/api/modules/${id}`));
ipcMain.handle('aigm:module:save', async (_event, data) =>
  apiFetch('/api/modules', { method: 'POST', body: JSON.stringify(data) })
);
ipcMain.handle('aigm:module:delete', async (_event, id) =>
  apiFetch(`/api/modules/${id}`, { method: 'DELETE' })
);
ipcMain.handle('aigm:module:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled) return null;
  const fs = require('fs').promises;
  const content = await fs.readFile(result.filePaths[0], 'utf-8');
  return apiFetch('/api/modules/import', { method: 'POST', body: JSON.stringify({ content }) });
});
ipcMain.handle('aigm:module:export', async (_event, id) => {
  const mod = await apiFetch(`/api/modules/${id}`);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${mod.name || 'module'}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled) return false;
  const fs = require('fs').promises;
  await fs.writeFile(result.filePath, JSON.stringify(mod, null, 2), 'utf-8');
  return true;
});

// Saves
ipcMain.handle('aigm:save:list', async (_event, moduleId) =>
  apiFetch(`/api/saves?moduleId=${encodeURIComponent(moduleId)}`)
);
ipcMain.handle('aigm:save:write', async (_event, data) =>
  apiFetch('/api/saves', { method: 'POST', body: JSON.stringify(data) })
);
ipcMain.handle('aigm:save:read', async (_event, id) => apiFetch(`/api/saves/${id}`));
ipcMain.handle('aigm:save:delete', async (_event, id) =>
  apiFetch(`/api/saves/${id}`, { method: 'DELETE' })
);

// Images
ipcMain.handle('aigm:image:search', async (_event, query) =>
  apiFetch(`/api/images/search?q=${encodeURIComponent(query)}`)
);
ipcMain.handle('aigm:image:download', async (_event, { url, type }) =>
  apiFetch('/api/images/download', { method: 'POST', body: JSON.stringify({ url, type }) })
);
ipcMain.handle('aigm:image:generate', async (_event, body) =>
  apiFetch('/api/images/generate', { method: 'POST', body: JSON.stringify(body) })
);
ipcMain.handle('aigm:image:list', async (_event, type) =>
  apiFetch(`/api/images?type=${encodeURIComponent(type)}`)
);
ipcMain.handle('aigm:image:delete', async (_event, id) =>
  apiFetch(`/api/images/${id}`, { method: 'DELETE' })
);
ipcMain.handle('aigm:image:upload', async (_event, { data, filename, type }) => {
  return apiFetch('/api/images/upload', {
    method: 'POST',
    body: JSON.stringify({ data, filename, type }),
  });
});
ipcMain.handle('aigm:image:dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const fs = require('fs').promises;
  const filePath = result.filePaths[0];
  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString('base64');
  const ext = path.extname(filePath);
  const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png';
  return { data: `data:${mimeType};base64,${base64}`, filename: path.basename(filePath) };
});

// Settings
ipcMain.handle('aigm:settings:get', async (_event, key) =>
  apiFetch(`/api/settings/${encodeURIComponent(key)}`)
);
ipcMain.handle('aigm:settings:set', async (_event, { key, value }) =>
  apiFetch('/api/settings', { method: 'POST', body: JSON.stringify({ key, value }) })
);
ipcMain.handle('aigm:settings:getAll', async () => apiFetch('/api/settings'));

// Path
ipcMain.handle('aigm:path:userData', () => app.getPath('userData'));

// App lifecycle
app.whenReady().then(async () => {
  try {
    await startBackend();
    console.log('[Main] Backend ready');
    createWindow();
  } catch (err) {
    console.error('[Main] Failed to start backend:', err);
    dialog.showErrorBox('启动失败', '后端服务启动失败，请检查日志。');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
});

// Ensure backend is killed even if Electron crashes
process.on('exit', () => {
  if (backendProcess) backendProcess.kill();
});
