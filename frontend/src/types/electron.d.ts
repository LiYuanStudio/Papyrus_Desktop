/**
 * TypeScript type definitions for Electron API
 * 
 * This file provides type definitions for the electronAPI object
 * exposed by the preload script.
 */

export interface ElectronAPI {
  /** Get the application version */
  getVersion(): Promise<string>;
  
  /** Get the current platform (win32, darwin, linux) */
  getPlatform(): Promise<string>;
  
  /** Check if running in development mode */
  isDev(): Promise<boolean>;

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
}

declare global {
  interface Window {
    /** Electron API for main process communication */
    electronAPI: ElectronAPI;
    
    /** Environment information */
    electronEnv: ElectronEnv;
  }
}

export {};
