const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

// =============================================================================
// AUTO-UPDATER (electron-updater)
// =============================================================================
// Strategy: GitHub Releases
//   - Publishes to GitHub Releases via electron-builder --publish=always
//   - Auto-updater checks for updates on app startup (production only)
//   - Falls back to manual check via IPC
//
// NOTE: Update the GitHub repository in package.json build.publish config
//   "publish": { "provider": "github", "owner": "YOUR_ORG", "repo": "YOUR_REPO" }
//   before enabling auto-updater in production.
// =============================================================================

function setupAutoUpdater() {
  if (isDev) {
    console.log('[AutoUpdater] Disabled in development mode');
    return;
  }

  // Check for updates on startup (silent)
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[AutoUpdater] Check failed:', err.message);
  });

  // Event: update available
  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version ${info.version} is available. It will be downloaded in the background.`,
      buttons: ['OK'],
    });
  });

  // Event: update downloaded
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded. Restart the application to apply the update.`,
      buttons: ['Restart Now', 'Later'],
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  // Event: update not available
  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] No updates available');
  });

  // Event: error
  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
  });
}

// IPC handler for manual update check
ipcMain.handle('aigm:updater:check', async () => {
  if (isDev) return { dev: true, message: 'Update check disabled in development' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      updateAvailable: result?.updateInfo?.version !== app.getVersion(),
      currentVersion: app.getVersion(),
      latestVersion: result?.updateInfo?.version || null,
    };
  } catch (err) {
    return { error: err.message };
  }
});

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

  // 中文菜单
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建模组', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('aigm:menu:new-module') },
        { label: '导入模组', accelerator: 'CmdOrCtrl+O', click: () => mainWindow.webContents.send('aigm:menu:import-module') },
        { type: 'separator' },
        { label: '退出', accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.webContents.reload() },
        { label: '开发者工具', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '重置缩放', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '用户手册', click: () => mainWindow.webContents.send('aigm:menu:docs') },
        { label: '关于', click: () => dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: '关于 AI-GM Standalone',
          message: `AI-GM Standalone v${app.getVersion()}`,
          detail: '一个 AI 驱动的游戏主持人引擎。',
          buttons: ['确定'],
        })},
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

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

  // 使用 Electron 自带 Node 运行时，避免系统 Node ABI 不匹配
  const nodeExec = process.execPath;
  const env = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    NODE_ENV: isDev ? 'development' : 'production',
    AIGM_USER_DATA: app.getPath('userData'),
    ELECTRON_RUN_AS_NODE: '1',
  };

  backendProcess = spawn(nodeExec, [backendPath], {
    env,
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

// Helper to wrap IPC handlers with error catching
function safeHandler(fn) {
  return async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[IPC Main] Handler failed: ${message}`, err);
      throw new Error(`[Main] ${message}`);
    }
  };
}

// LLM
ipcMain.handle('aigm:llm:chat', safeHandler(async (_event, body) => {
  return apiFetch('/api/llm/chat', { method: 'POST', body: JSON.stringify(body) });
}));

ipcMain.handle('aigm:llm:stream', safeHandler(async (event, body) => {
  const res = await fetch(`${API_BASE}/api/llm/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`LLM stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      event.sender.send('aigm:llm:stream:chunk', chunk);
    }
    event.sender.send('aigm:llm:stream:end');
  } catch (streamErr) {
    console.error('[IPC Main] LLM stream error:', streamErr);
    event.sender.send('aigm:llm:stream:end');
    throw streamErr;
  }
}));

// Modules
ipcMain.handle('aigm:module:list', safeHandler(async () => apiFetch('/api/modules')));
ipcMain.handle('aigm:module:get', safeHandler(async (_event, id) => apiFetch(`/api/modules/${id}`)));
ipcMain.handle('aigm:module:save', safeHandler(async (_event, data) =>
  apiFetch('/api/modules', { method: 'POST', body: JSON.stringify(data) })
));
ipcMain.handle('aigm:module:delete', safeHandler(async (_event, id) =>
  apiFetch(`/api/modules/${id}`, { method: 'DELETE' })
));
ipcMain.handle('aigm:module:import', safeHandler(async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled) return null;
  const fs = require('fs').promises;
  const content = await fs.readFile(result.filePaths[0], 'utf-8');
  return apiFetch('/api/modules/import', { method: 'POST', body: JSON.stringify({ content }) });
}));
ipcMain.handle('aigm:module:export', safeHandler(async (_event, id) => {
  const mod = await apiFetch(`/api/modules/${id}`);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${mod.name || 'module'}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled) return false;
  const fs = require('fs').promises;
  await fs.writeFile(result.filePath, JSON.stringify(mod, null, 2), 'utf-8');
  return true;
}));

// Saves
ipcMain.handle('aigm:save:list', safeHandler(async (_event, moduleId) =>
  apiFetch(`/api/saves?moduleId=${encodeURIComponent(moduleId)}`)
));
ipcMain.handle('aigm:save:write', safeHandler(async (_event, data) =>
  apiFetch('/api/saves', { method: 'POST', body: JSON.stringify(data) })
));
ipcMain.handle('aigm:save:read', safeHandler(async (_event, id) => apiFetch(`/api/saves/${id}`)));
ipcMain.handle('aigm:save:delete', safeHandler(async (_event, id) =>
  apiFetch(`/api/saves/${id}`, { method: 'DELETE' })
));

// Images
ipcMain.handle('aigm:image:search', safeHandler(async (_event, query) =>
  apiFetch(`/api/images/search?q=${encodeURIComponent(query)}`)
));
ipcMain.handle('aigm:image:download', safeHandler(async (_event, { url, type }) =>
  apiFetch('/api/images/download', { method: 'POST', body: JSON.stringify({ url, type }) })
));
ipcMain.handle('aigm:image:generate', safeHandler(async (_event, body) =>
  apiFetch('/api/images/generate', { method: 'POST', body: JSON.stringify(body) })
));
ipcMain.handle('aigm:image:list', safeHandler(async (_event, type) =>
  apiFetch(`/api/images?type=${encodeURIComponent(type)}`)
));
ipcMain.handle('aigm:image:delete', safeHandler(async (_event, id) =>
  apiFetch(`/api/images/${id}`, { method: 'DELETE' })
));
ipcMain.handle('aigm:image:upload', safeHandler(async (_event, { data, filename, type }) => {
  return apiFetch('/api/images/upload', {
    method: 'POST',
    body: JSON.stringify({ data, filename, type }),
  });
}));
ipcMain.handle('aigm:image:dialog', safeHandler(async () => {
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
}));

// Settings
ipcMain.handle('aigm:settings:get', safeHandler(async (_event, key) =>
  apiFetch(`/api/settings/${encodeURIComponent(key)}`)
));
ipcMain.handle('aigm:settings:set', safeHandler(async (_event, { key, value }) =>
  apiFetch('/api/settings', { method: 'POST', body: JSON.stringify({ key, value }) })
));
ipcMain.handle('aigm:settings:getAll', safeHandler(async () => apiFetch('/api/settings')));

// Styles
ipcMain.handle('aigm:style:list', safeHandler(async () => apiFetch('/api/styles')));
ipcMain.handle('aigm:style:get', safeHandler(async (_event, id) => apiFetch(`/api/styles/${encodeURIComponent(id)}`)));
ipcMain.handle('aigm:style:save', safeHandler(async (_event, data) =>
  apiFetch('/api/styles', { method: 'POST', body: JSON.stringify(data) })
));
ipcMain.handle('aigm:style:update', safeHandler(async (_event, { id, ...data }) =>
  apiFetch(`/api/styles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })
));
ipcMain.handle('aigm:style:delete', safeHandler(async (_event, id) =>
  apiFetch(`/api/styles/${encodeURIComponent(id)}`, { method: 'DELETE' })
));

// Path
ipcMain.handle('aigm:path:userData', safeHandler(async () => app.getPath('userData')));

// App lifecycle
app.whenReady().then(async () => {
  try {
    await startBackend();
    console.log('[Main] Backend ready');
    createWindow();
    setupAutoUpdater();
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
