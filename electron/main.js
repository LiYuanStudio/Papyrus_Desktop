/**
 * Electron Main Process for Papyrus
 * 
 * Handles:
 * - Window creation and management
 * - Node.js backend process spawning
 * - System tray integration
 * - Platform-specific adaptations
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  shell,
  dialog,
  nativeImage,
  nativeTheme,
} = require('electron');

// Preserve user data directory compatibility across productName changes
app.setName('papyrus');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execSync } = require('child_process');
const os = require('os');
const crypto = require('crypto');
const { createDiagnosticWindow } = require('./diagnostic-window');
const { validateExternalUrl, validateOpenFolderPath } = require('./security-validators');
const {
  MACOS_VIBRANCY,
  getBackendLaunchInfo,
  getTrayIconName,
  getWindowAppearance,
  getWindowIconName,
} = require('./platform-config');
const {
  createDesktopApplicationMenuTemplate,
  createMacApplicationMenuTemplate,
  dispatchRendererMenuAction,
} = require('./application-menu');

// Generate a per-session auth token for backend API protection
const PAPYRUS_AUTH_TOKEN = crypto.randomBytes(32).toString('base64url');
// Effective token used for IPC-proxied API calls; may differ when reusing an already-running backend.
let effectiveAuthToken = PAPYRUS_AUTH_TOKEN;

// Resolve backend data directory (matches backend/src/utils/paths.ts defaults).
function getBackendDataDir() {
  if (process.env.PAPYRUS_DATA_DIR) {
    return path.resolve(process.env.PAPYRUS_DATA_DIR);
  }
  return path.join(os.homedir(), 'PapyrusData');
}

// Read the token the running backend actually expects (env or persisted .api_token).
function readPersistedBackendToken(additionalDataDirs = []) {
  const envToken = process.env.PAPYRUS_AUTH_TOKEN;
  if (typeof envToken === 'string' && envToken.length >= 32) {
    return envToken;
  }
  const candidateDirs = [getBackendDataDir(), ...additionalDataDirs];
  for (const dir of candidateDirs) {
    const tokenFile = path.join(dir, '.api_token');
    try {
      if (fs.existsSync(tokenFile)) {
        const token = fs.readFileSync(tokenFile, 'utf8').trim();
        if (token.length >= 32) {
          return token;
        }
      }
    } catch {
      // ignore token read errors
    }
  }
  return null;
}

// When dev scripts start the backend before Electron, reuse its token instead of the per-session one.
function resolveAuthTokenForExistingBackend() {
  const extraDirs = app.isReady() ? [app.getPath('userData')] : [];
  const persisted = readPersistedBackendToken(extraDirs);
  if (persisted) {
    effectiveAuthToken = persisted;
    log('Reusing existing backend auth token');
    return;
  }
  log('Backend is running but no persisted auth token was found; API calls may return 401', 'error');
}

// In-memory log storage for diagnostics
const startupLogs = [];
const originalLog = console.log;
const originalError = console.error;

// Configuration
const CONFIG = {
  frontendDevUrl: 'http://localhost:5173',
  backendPort: 8000,
  backendHost: '127.0.0.1',
  healthCheckInterval: 500,
  backendStartupTimeout: 60000,
};

// Global state
let mainWindow = null;
let tray = null;
let backendProcess = null;
let isQuitting = false;
let isDevMode = !app.isPackaged;

// Paths
const getPaths = () => {
  const resourcesPath = isDevMode 
    ? path.join(__dirname, '..') 
    : process.resourcesPath;
  
  return {
    resourcesPath,
    assetsPath: path.join(resourcesPath, 'assets'),
    frontendDistPath: path.join(__dirname, '..', 'frontend', 'dist'),
    iconPath: path.join(resourcesPath, 'assets', getWindowIconName(process.platform)),
    trayIconPath: path.join(resourcesPath, 'assets', getTrayIconName(process.platform)),
  };
};

// 解析后端启动参数并兼容开发态与打包态。
// 原因：将纯路径判断委托给可测试模块，主进程只负责注入 Electron 运行时路径。
// 未直接拼接 shell 字符串：macOS `.app` 路径常含空格，数组参数才能保持边界可靠。
function getBackendExecutableInfo() {
  return getBackendLaunchInfo({
    appRoot: path.join(__dirname, '..'),
    isDevMode,
    platform: process.platform,
    processExecPath: process.execPath,
    resourcesPath: process.resourcesPath,
  });
}

// Logging utility
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logMessage);
  
  // Store in memory for diagnostics
  startupLogs.push({ timestamp, message, level });
  
  // Also log to file in production
  if (!isDevMode) {
    try {
      const logDir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = path.join(logDir, `main-${new Date().toISOString().split('T')[0]}.log`);
      fs.appendFileSync(logFile, logMessage + '\n');
    } catch (e) {
      // If file logging fails, at least we have console
      console.error('Failed to write to log file:', e);
    }
  }
}

// Check if backend is ready
async function checkBackendHealth() {
  return new Promise((resolve) => {
    const http = require('http');
    const options = {
      hostname: CONFIG.backendHost,
      port: CONFIG.backendPort,
      path: '/api/health',
      method: 'GET',
      timeout: 2000,
    };

    const req = http.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// Wait for backend to be ready
async function waitForBackend(timeout = CONFIG.backendStartupTimeout) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const isReady = await checkBackendHealth();
    if (isReady) {
      log('Backend is ready');
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, CONFIG.healthCheckInterval));
  }
  
  throw new Error('Backend failed to start within timeout');
}

// Start Node.js backend
async function startBackend() {
  const paths = getPaths();

  log(`Environment Info:`);
  log(`  isDevMode: ${isDevMode}`);
  log(`  resourcesPath: ${paths.resourcesPath}`);
  log(`  userData: ${app.getPath('userData')}`);

  const { command, args, cwd } = getBackendExecutableInfo();

  log(`Starting backend: ${command} ${args.join(' ')}`);
  log(`Backend cwd: ${cwd}`);

  // 将旧版 Python 相对于应用根目录保存的 data/Papyrusdata.json 显式传给后端。
  // 原因：打包后端 cwd 位于 resources/backend，无法仅靠相对路径找到旧安装目录的数据。
  // 未复制旧文件到新目录：后端事务迁移成功前保留原件，失败时仍可恢复或重试。
  const legacyCardsFile = process.env.PAPYRUS_LEGACY_CARDS_FILE || path.join(
    isDevMode ? path.join(__dirname, '..') : path.dirname(process.execPath),
    'data',
    'Papyrusdata.json',
  );

  const env = {
    ...process.env,
    PAPYRUS_DATA_DIR: app.getPath('userData'),
    PAPYRUS_LEGACY_CARDS_FILE: legacyCardsFile,
    PAPYRUS_PORT: CONFIG.backendPort.toString(),
    PAPYRUS_AUTH_TOKEN: PAPYRUS_AUTH_TOKEN,
  };

  // In production, the Electron executable acts as the Node.js runtime
  // for the backend process. ELECTRON_RUN_AS_NODE tells Electron to
  // run in headless Node.js mode instead of launching a GUI.
  if (!isDevMode) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }

  backendProcess = spawn(command, args, {
    cwd,
    stdio: 'pipe',
    shell: false,
    env,
  });

  // Handle backend output
  backendProcess.stdout?.on('data', (data) => {
    log(`[Backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr?.on('data', (data) => {
    log(`[Backend Error] ${data.toString().trim()}`, 'error');
  });

  backendProcess.on('error', (error) => {
    log(`Backend process error: ${error.message}`, 'error');
    if (!isQuitting) {
      dialog.showErrorBox('后端启动错误', `无法启动后端服务: ${error.message}\n\n请检查程序是否完整安装。`);
    }
  });

  backendProcess.on('exit', (code, signal) => {
    log(`Backend process exited with code ${code}, signal ${signal}`);
    if (!isQuitting && code !== 0) {
      log('Backend crashed unexpectedly', 'error');
      if (mainWindow) {
        mainWindow.webContents.send('backend-crashed');
      }
    }
  });

  // Wait for backend to be ready
  try {
    await waitForBackend();
    log('Backend started successfully');
  } catch (error) {
    log(`Backend failed to start: ${error.message}`, 'error');
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
    throw new Error(`后端服务启动失败: ${error.message}`);
  }
}

// Stop Node backend
function stopBackend() {
  if (!backendProcess) return;

  const processToStop = backendProcess;
  const pid = processToStop.pid;
  backendProcess = null;
  log(`Stopping backend process (PID: ${pid})...`);

  if (process.platform === 'win32') {
    // Use spawn with array arguments to avoid shell injection
    const { spawnSync } = require('child_process');
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'pipe' });
    } catch (e) {
      log(`taskkill failed, falling back to SIGTERM: ${e.message}`, 'error');
      try {
        processToStop.kill('SIGTERM');
      } catch {
        // process already dead
      }
    }
    // Verify the process is actually gone
    const checkResult = spawnSync('tasklist', ['/FI', `PID eq ${pid}`], { stdio: 'pipe' });
    const checkOutput = checkResult.stdout?.toString() || '';
    if (checkOutput.includes(String(pid))) {
      // Process is still alive — force kill
      log(`Process ${pid} still alive after first kill, retrying...`, 'error');
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'pipe' });
    }
  } else {
    processToStop.kill('SIGTERM');
    // 捕获待停止的进程对象，避免全局引用清空后 3 秒兜底失效。
    // 原因：macOS/Linux 的子进程若忽略 SIGTERM，应用退出前仍必须有确定的 SIGKILL 兜底。
    // 未对全局 backendProcess 延迟调用：它可能已变为 null 或指向一次重启后的新进程。
    const forceKillTimer = setTimeout(() => {
      try {
        if (processToStop.exitCode === null && processToStop.signalCode === null) {
          processToStop.kill('SIGKILL');
        }
      } catch {
        // already dead
      }
    }, 3000);
    forceKillTimer.unref();
  }

  log('Backend process stopped');
}

/**
 * 返回当前原生主题状态，供 BrowserWindow 与 renderer 使用。
 * 原因：macOS vibrancy 必须服从“减少透明度”，深浅背景也应在窗口首帧前匹配系统主题。
 * 未让 renderer 自行猜测：只有主进程的 nativeTheme 能稳定读取 Electron 当前实际偏好。
 */
function getSystemAppearance() {
  return {
    darkMode: nativeTheme.shouldUseDarkColors,
    reduceTransparency: nativeTheme.prefersReducedTransparency,
  };
}

/**
 * 在系统外观变化时同步 macOS 窗口材质并通知 renderer。
 * 原因：用户可能在应用运行期间切换深色模式或减少透明度，原生窗口与 CSS 表面必须同时更新。
 * 未重建 BrowserWindow：setVibrancy/setBackgroundColor 可原地更新，避免丢失页面状态和焦点。
 */
function syncMacWindowAppearance() {
  if (process.platform !== 'darwin' || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const appearance = getSystemAppearance();
  mainWindow.setVibrancy(appearance.reduceTransparency ? null : MACOS_VIBRANCY);
  mainWindow.setBackgroundColor(appearance.darkMode ? '#1e1e22' : '#f7f7f5');
  mainWindow.webContents.send('app:appearance-changed', appearance);
}

/**
 * 把 macOS 原生菜单动作发送给当前窗口，并在窗口关闭后按系统习惯重新创建。
 * 原因：业务路由仍由 React 负责，主进程只处理窗口激活和可信 IPC 通道。
 * 未直接调用 renderer 内部函数：跨进程保持字符串动作协议可测试，也不会暴露 ipcRenderer。
 */
function sendRendererMenuAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  const targetWindow = mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  dispatchRendererMenuAction(targetWindow, action);
}

/**
 * 安装平台匹配的应用菜单，并为 macOS Dock 提供高频新建动作。
 * 原因：macOS 用户依赖系统菜单栏和 Dock 菜单，Windows/Linux 则继续使用自绘 File 菜单。
 * 未为所有平台展示完整原生菜单：非 macOS 已有可见标题栏入口，重复菜单会增加认知负担。
 */
function installApplicationMenu() {
  const template = process.platform === 'darwin'
    ? createMacApplicationMenuTemplate({
        appName: 'Papyrus',
        isDevMode,
        sendAction: sendRendererMenuAction,
      })
    : createDesktopApplicationMenuTemplate();
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate([
      {
        label: 'New Note',
        click: () => sendRendererMenuAction('new-note'),
      },
      {
        label: 'New Card',
        click: () => sendRendererMenuAction('new-card'),
      },
    ]));
  }
}

// Create main window
function createWindow() {
  const paths = getPaths();
  const systemAppearance = getSystemAppearance();
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false, // Don't show until ready
    icon: paths.iconPath,
    title: 'Papyrus Desktop',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      devTools: isDevMode,
    },
    ...getWindowAppearance(process.platform, systemAppearance),
  });

  // Set Content Security Policy to mitigate XSS risks
  // Vite injects an inline React Fast Refresh preamble in development. Production remains strict.
  const scriptSrc = isDevMode ? "'self' 'unsafe-inline'" : "'self'";
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; img-src 'self' file: data: http://127.0.0.1:* http://localhost:* blob:; media-src 'self' http://127.0.0.1:* http://localhost:* blob:; font-src 'self' data:; frame-src 'self';`,
        ],
      },
    });
  });

  // Load content
  if (isDevMode) {
    log(`Loading development URL: ${CONFIG.frontendDevUrl}`);
    mainWindow.loadURL(CONFIG.frontendDevUrl);
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(paths.frontendDistPath, 'index.html');
    log(`Loading production file: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }

  installApplicationMenu();
  
  // Window event handlers
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (isDevMode) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform !== 'darwin' && tray) {
      try {
        event.preventDefault();
        mainWindow.hide();
        tray.displayBalloon({
          iconType: 'info',
          title: 'Papyrus Desktop',
          content: 'Papyrus Desktop is running in the background. Click the tray icon to restore.',
        });
      } catch (trayErr) {
        log(`Tray operation failed, allowing normal close: ${trayErr.message}`, 'error');
        tray = null;
      }
    }
    // If tray is not available, let the window close normally so user isn't locked out
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const validation = validateExternalUrl(url);
    if (validation.ok) {
      shell.openExternal(validation.url);
    }
    return { action: 'deny' };
  });
}

// Create system tray
function createTray() {
  const paths = getPaths();
  
  try {
    let trayImage = nativeImage.createFromPath(paths.trayIconPath);
    if (process.platform === 'darwin') {
      trayImage.setTemplateImage(true);
    }
    tray = new Tray(trayImage);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Papyrus Desktop',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Open Data Folder',
        click: () => {
          const dataPath = app.getPath('userData');
          shell.openPath(dataPath);
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('Papyrus Desktop');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        createWindow();
      }
    });

    log('Tray created successfully');
  } catch (error) {
    log(`Failed to create tray: ${error.message}`, 'error');
  }
}

// IPC handlers
function setupIPC() {
  // Get app version
  ipcMain.handle('app:getVersion', () => app.getVersion());
  
  // Get platform info
  ipcMain.handle('app:getPlatform', () => process.platform);
  
  // Check if development mode
  ipcMain.handle('app:isDev', () => isDevMode);

  // Return native appearance preferences so renderer surfaces can match macOS accessibility settings.
  ipcMain.handle('app:getSystemAppearance', () => getSystemAppearance());

  // Proxy API requests through main process so the renderer never needs the raw token.
  ipcMain.handle('api:fetch', async (_event, payload) => {
    const apiPath = typeof payload?.path === 'string' ? payload.path : '';
    const method = typeof payload?.method === 'string' ? payload.method : 'GET';
    const body = payload?.body;
    const extraHeaders = payload?.headers && typeof payload.headers === 'object' ? payload.headers : {};
    const url = `http://${CONFIG.backendHost}:${CONFIG.backendPort}/api${apiPath}`;
    const response = await fetch(url, {
      method,
      headers: {
        ...extraHeaders,
        'X-Papyrus-Token': effectiveAuthToken,
        // 平台与架构只由主进程注入，后端据此选择匹配的更新产物。
        // 原因：renderer 不应自行声明运行架构，否则更新检查可能返回无法执行的安装包。
        // 未使用 query 参数：可信运行时元数据属于请求上下文，不应污染公开 API URL。
        'X-Papyrus-Platform': process.platform,
        'X-Papyrus-Arch': process.arch,
        // 当前 App 版本由 Electron 主进程提供，避免固定端口上的旧后端替新 UI 决定更新基线。
        // 原因：app.getVersion() 读取安装包元数据，与用户实际启动的可执行文件一致。
        // 未让 renderer 自报版本：渲染进程内容不应成为更新决策的可信来源。
        'X-Papyrus-App-Version': app.getVersion(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: text,
    };
  });

  // Media URLs for <img> tags that cannot attach auth headers.
  ipcMain.handle('api:getMediaUrl', (_event, fileId, action) => {
    const safeId = typeof fileId === 'string' ? fileId : '';
    const safeAction = action === 'download' ? 'download' : action === 'preview' ? 'preview' : 'thumbnail';
    return `http://${CONFIG.backendHost}:${CONFIG.backendPort}/api/files/${safeId}/${safeAction}?access_token=${encodeURIComponent(effectiveAuthToken)}`;
  });

  // Legacy token accessor — kept for streaming endpoints until fully proxied.
  ipcMain.handle('app:getAuthToken', () => effectiveAuthToken);

  // Quit the application (sets isQuitting so window.close() actually quits)
  ipcMain.handle('app:quit', () => {
    isQuitting = true;
    app.quit();
  });

  // Open external link
  ipcMain.handle('shell:openExternal', async (event, url) => {
    const validation = validateExternalUrl(url);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }
    await shell.openExternal(validation.url);
  });
  
  // Open data folder
  ipcMain.handle('shell:openDataFolder', () => {
    const dataPath = app.getPath('userData');
    shell.openPath(dataPath);
  });

  // Open any folder (with path validation)
  ipcMain.handle('shell:openFolder', async (event, folderPath) => {
    const dataDir = app.getPath('userData');
    const homeDir = os.homedir();
    const documentsDir = path.join(homeDir, 'Documents');
    const downloadsDir = path.join(homeDir, 'Downloads');
    const validation = validateOpenFolderPath(folderPath, [dataDir, documentsDir, downloadsDir]);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }
    await shell.openPath(validation.path);
  });

  // Minimize to tray
  ipcMain.handle('window:minimizeToTray', () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });
  
  // Window controls
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });
  
  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  
  ipcMain.handle('window:close', () => {
    if (mainWindow) {
      // Trigger the close event which will handle tray logic
      mainWindow.close();
    }
  });
  
  ipcMain.handle('window:isMaximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });
  
  // Check backend health
  ipcMain.handle('backend:checkHealth', async () => {
    return await checkBackendHealth();
  });
  
  // Restart backend
  let lastBackendRestart = 0;
  ipcMain.handle('backend:restart', async () => {
    // SECURITY: rate limit backend restarts to prevent DoS
    const now = Date.now();
    if (now - lastBackendRestart < 30000) {
      throw new Error('Backend restart rate limited: please wait 30 seconds');
    }
    lastBackendRestart = now;
    stopBackend();
    await startBackend();
    return true;
  });
  
  // Select folder dialog
  ipcMain.handle('dialog:selectFolder', async (event, defaultPath) => {
    if (!mainWindow) return { canceled: true };
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      defaultPath: defaultPath || app.getPath('userData'),
    });
    
    return result;
  });
}

// SECURITY: Root certificate installation removed to prevent MITM attacks.
// Self-signed root certificates should NEVER be installed into the system trust store.

// Single instance lock — must be checked BEFORE app.whenReady() to prevent
// a second instance from initializing backend processes and creating windows
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log('Another instance is already running, quitting...');
  app.quit();
  // return is unreachable due to app.quit(), but explicitly return for clarity
}

app.on('second-instance', () => {
  log('Second instance detected, focusing window');
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});



// App event handlers
app.whenReady().then(async () => {
  log('App is ready');
  
  try {
    // SECURITY: Root certificate installation removed to prevent MITM attacks.
    
    // Check if backend is already running (e.g., started by start-dev.bat)
    const isBackendAlreadyRunning = await checkBackendHealth();
    
    if (isBackendAlreadyRunning) {
      log('Backend is already running (likely started by dev script), skipping backend startup');
      resolveAuthTokenForExistingBackend();
    } else {
      // Start backend only if not already running
      await startBackend();
    }
    
    // Register IPC handlers BEFORE creating the window so the renderer
    // can retrieve the auth token immediately on load.
    setupIPC();

    // Create window and tray
    createWindow();
    createTray();
    nativeTheme.on('updated', syncMacWindowAppearance);
    
  } catch (error) {
    log(`Failed to initialize: ${error.message}`, 'error');
    log(`Stack trace: ${error.stack}`, 'error');
    
    // Gather diagnostic information
    const paths = getPaths();
    const { command, args, cwd } = getBackendExecutableInfo();

    const diagnosticPaths = {
      resourcesPath: paths.resourcesPath,
      backendCommand: command,
      backendArgs: args,
      backendCwd: cwd,
      userData: app.getPath('userData'),
      __dirname: __dirname,
      processResourcesPath: process.resourcesPath,
    };
    
    // Show diagnostic window
    createDiagnosticWindow(startupLogs, diagnosticPaths, error);
    
    // Also show simple error dialog
    dialog.showErrorBox(
      'Initialization Error', 
      `Failed to start: ${error.message}\n\nDiagnostic window opened with details.`
    );
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // On Windows/Linux, keep app running in tray
    // Don't quit unless explicitly requested
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  stopBackend();
});

app.on('quit', () => {
  log('App is quitting');
});

// SECURITY: Prevent new window creation and validate URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    const validation = validateExternalUrl(navigationUrl);
    if (validation.ok) {
      shell.openExternal(validation.url);
    }
  });
});

// Handle certificate errors in development
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDevMode) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        log(`[SECURITY WARNING] Ignoring certificate error for ${url} in dev mode`, 'warning');
        event.preventDefault();
        callback(true);
        return;
      }
    } catch {
      // invalid URL, fall through to deny
    }
  }
  callback(false);
});

// Kill all Papyrus processes (for Windows installer/updater)
// WARNING: This function should ONLY be called by the installer/updater, not by the app itself
// Calling this during app startup will kill the app itself
function killAllPapyrusProcesses() {
  if (process.platform !== 'win32') return;
  
  try {
    log('Killing any existing Papyrus processes...');
    // Kill Papyrus Desktop.exe (main app)
    try {
      execSync('taskkill /F /IM "Papyrus Desktop.exe" 2>nul', { stdio: 'pipe' });
      log('Killed Papyrus Desktop.exe processes');
    } catch (e) {
      // No processes found or already killed
    }
    // Wait a bit for processes to fully terminate
    execSync('timeout /t 1 /nobreak >nul 2>&1', { stdio: 'pipe' });
  } catch (error) {
    log(`Error killing processes: ${error.message}`, 'error');
  }
}

// NOTE: killAllPapyrusProcesses() is intentionally NOT called here.
// It should only be called by the installer/updater to avoid the app killing itself.
// See: https://github.com/electron/electron/issues/36554

// Error handling
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'error');
  log(error.stack, 'error');
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection at: ${promise}, reason: ${reason}`, 'error');
});
