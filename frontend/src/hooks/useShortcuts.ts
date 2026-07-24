/**
 * 快捷键管理 Hook
 * 统一管理应用快捷键设置
 */
import { useState, useCallback } from 'react';
import { appPlatform, formatShortcutForPlatform } from '../utils/platform';

// 快捷键配置类型
export interface ShortcutConfig {
  // 文件菜单
  newNote: string;
  newCard: string;
  newWindow: string;
  openNotes: string;
  openFiles: string;
  openReview: string;
  importTxt: string;
  save: string;
  saveAll: string;
  preferences: string;
  closeEditor: string;
  exit: string;
  // 编辑菜单
  undo: string;
  redo: string;
  cut: string;
  copy: string;
  paste: string;
  selectAll: string;
  find: string;
  // 通用
  search: string;
}

// 默认快捷键配置
const DEFAULT_SHORTCUTS: ShortcutConfig = {
  // 文件菜单
  newNote: 'Ctrl+N',
  newCard: 'Ctrl+Shift+C',
  newWindow: 'Ctrl+Shift+N',
  openNotes: 'Ctrl+O',
  openFiles: 'Ctrl+K O',
  openReview: 'Ctrl+R',
  importTxt: 'Ctrl+Shift+I',
  save: 'Ctrl+S',
  saveAll: 'Ctrl+K S',
  preferences: 'Ctrl+,',
  closeEditor: 'Ctrl+F4',
  exit: 'Alt+F4',
  // 编辑菜单
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
  cut: 'Ctrl+X',
  copy: 'Ctrl+C',
  paste: 'Ctrl+V',
  selectAll: 'Ctrl+A',
  find: 'Ctrl+F',
  // 通用
  search: 'Ctrl+K',
};

// 本地存储键
const STORAGE_KEY = 'papyrus_shortcuts';

// 加载快捷键配置
const loadShortcuts = (): ShortcutConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_SHORTCUTS, ...JSON.parse(saved) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SHORTCUTS;
};

// 保存快捷键配置
const saveShortcuts = (shortcuts: ShortcutConfig) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  } catch {
    // ignore
  }
};

// 重置为默认快捷键
export const resetShortcuts = (): ShortcutConfig => {
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_SHORTCUTS;
};

export const useShortcuts = () => {
  const [shortcuts, setShortcutsState] = useState<ShortcutConfig>(loadShortcuts);

  // 更新单个快捷键
  const setShortcut = useCallback((key: keyof ShortcutConfig, value: string) => {
    setShortcutsState((prev) => {
      const updated = { ...prev, [key]: value };
      saveShortcuts(updated);
      return updated;
    });
  }, []);

  // 更新多个快捷键
  const setShortcuts = useCallback((updates: Partial<ShortcutConfig>) => {
    setShortcutsState((prev) => {
      const updated = { ...prev, ...updates };
      saveShortcuts(updated);
      return updated;
    });
  }, []);

  // 重置所有快捷键
  const resetToDefault = useCallback(() => {
    const defaults = resetShortcuts();
    setShortcutsState(defaults);
  }, []);

  // 获取快捷键的显示文本
  const getShortcutDisplay = useCallback(
    (key: keyof ShortcutConfig) => {
      const shortcut = shortcuts[key] || DEFAULT_SHORTCUTS[key];
      return formatShortcutForPlatform(shortcut, appPlatform);
    },
    [shortcuts]
  );

  return {
    shortcuts,
    setShortcut,
    setShortcuts,
    resetToDefault,
    getShortcutDisplay,
    defaultShortcuts: DEFAULT_SHORTCUTS,
  };
};

export default useShortcuts;
