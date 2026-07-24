/**
 * Electron Preload Script
 * 
 * Securely exposes API to the renderer process.
 * All communication between main and renderer goes through here.
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 订阅主进程事件并返回精确的清理函数。
 * 原因：React 组件热重载或卸载时必须移除同一个 listener，避免菜单动作被重复执行。
 * 未暴露 ipcRenderer：renderer 只能订阅明确白名单通道，保持 contextIsolation 的安全边界。
 */
function subscribeToMainEvent(channel, callback, normalizePayload) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  const listener = (_event, payload) => {
    const normalizedPayload = normalizePayload(payload);
    if (normalizedPayload !== undefined) {
      callback(normalizedPayload);
    }
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  isDev: () => ipcRenderer.invoke('app:isDev'),
  getSystemAppearance: () => ipcRenderer.invoke('app:getSystemAppearance'),
  onMenuAction: (callback) => subscribeToMainEvent(
    'menu:action',
    callback,
    (payload) => typeof payload === 'string' ? payload : undefined,
  ),
  onSystemAppearanceChanged: (callback) => subscribeToMainEvent(
    'app:appearance-changed',
    callback,
    (payload) => (
      payload &&
      typeof payload.darkMode === 'boolean' &&
      typeof payload.reduceTransparency === 'boolean'
        ? {
            darkMode: payload.darkMode,
            reduceTransparency: payload.reduceTransparency,
          }
        : undefined
    ),
  ),
  apiFetch: (payload) => ipcRenderer.invoke('api:fetch', payload),
  getMediaUrl: (fileId, action) => ipcRenderer.invoke('api:getMediaUrl', fileId, action),
  // Legacy: streaming chat still reads token for SSE headers.
  getAuthToken: () => ipcRenderer.invoke('app:getAuthToken'),

  // Shell operations
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openDataFolder: () => ipcRenderer.invoke('shell:openDataFolder'),
  openFolder: (folderPath) => ipcRenderer.invoke('shell:openFolder', folderPath),

  // Window operations
  minimizeToTray: () => ipcRenderer.invoke('window:minimizeToTray'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  
  // Backend operations
  checkBackendHealth: () => ipcRenderer.invoke('backend:checkHealth'),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  
  // Dialog operations
  selectFolder: (defaultPath) => ipcRenderer.invoke('dialog:selectFolder', defaultPath),
});

// Expose environment info
contextBridge.exposeInMainWorld('electronEnv', {
  NODE_ENV: process.env.NODE_ENV || 'production',
  PLATFORM: process.platform,
  ARCH: process.arch,
});

// Expose app version for non-Vite environments
let appVersion = 'unknown';
try {
  const { readFileSync } = require('fs');
  const { join } = require('path');
  appVersion = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version || 'unknown';
} catch {
  // ignore
}
contextBridge.exposeInMainWorld('appVersion', appVersion);

// Log that preload script has loaded
console.log('[Preload] Electron API exposed successfully');
