/**
 * TypeScript type definitions for Electron API
 * 
 * This file provides type definitions for the electronAPI object
 * exposed by the preload script.
 */

import type { SystemAppearance } from '../utils/platform';

export interface ElectronAPI {
  /** Get the application version */
  getVersion(): Promise<string>;
  
  /** Get the current platform (win32, darwin, linux) */
  getPlatform(): Promise<string>;
  
  /** Check if running in development mode */
  isDev(): Promise<boolean>;

  /** Read native color and transparency accessibility preferences */
  getSystemAppearance(): Promise<SystemAppearance>;

  /** Subscribe to trusted actions dispatched by the native application menu */
  onMenuAction(callback: (action: NativeMenuAction) => void): () => void;

  /** Subscribe to native theme and transparency preference changes */
  onSystemAppearanceChanged(callback: (appearance: SystemAppearance) => void): () => void;

  /** Proxy authenticated API requests through the main process */
  apiFetch(payload: {
    path: string;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ ok: boolean; status: number; statusText: string; body: string }>;

  /** Build an authenticated media URL for img/video tags */
  getMediaUrl(fileId: string, action: 'preview' | 'download' | 'thumbnail'): Promise<string>;
  
  /** Open an external URL in the default browser */
  openExternal(url: string): Promise<void>;
  
  /** Open the application's data folder */
  openDataFolder(): Promise<void>;

  /** Open any folder in the system file explorer */
  openFolder(folderPath: string): Promise<void>;

  /** Minimize the window to the system tray */
  minimizeToTray(): Promise<void>;
  
  /** Minimize the window */
  minimizeWindow(): Promise<void>;
  
  /** Maximize/unmaximize the window */
  maximizeWindow(): Promise<void>;
  
  /** Close the window */
  closeWindow(): Promise<void>;

  /** Quit the entire application */
  quitApp(): Promise<void>;

  /** Get the backend auth token (legacy — prefer apiFetch) */
  getAuthToken(): Promise<string | null>;

  /** Check if window is maximized */
  isMaximized(): Promise<boolean>;
  
  /** Check if the backend is healthy */
  checkBackendHealth(): Promise<boolean>;
  
  /** Restart the backend process */
  restartBackend(): Promise<boolean>;
  
  /** Select a folder using the native dialog */
  selectFolder(defaultPath?: string): Promise<{ canceled: boolean; filePaths: string[] }>;
}

export interface ElectronEnv {
  /** Current Node environment */
  NODE_ENV: string;
  
  /** Current platform */
  PLATFORM: string;

  /** Current CPU architecture */
  ARCH: string;
}

// 原生应用菜单允许跨越 contextBridge 的稳定动作集合。
// 原因：联合类型让 renderer 穷尽处理全部菜单命令，并阻止任意 IPC 字符串进入业务路由。
// 未传递 Electron MenuItem：renderer 不需要主进程对象，结构化对象也会扩大桥接攻击面。
export type NativeMenuAction =
  | 'find'
  | 'help'
  | 'import-text'
  | 'new-card'
  | 'new-note'
  | 'preferences'
  | 'toggle-chat'
  | 'toggle-sidebar';

declare global {
  interface Window {
    /** Electron API for main process communication */
    electronAPI?: ElectronAPI;
    
    /** Environment information */
    electronEnv?: ElectronEnv;

    /** Application version exposed by Electron preload */
    appVersion?: string;
  }
}

export {};
