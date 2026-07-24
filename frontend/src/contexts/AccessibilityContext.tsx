/**
 * 无障碍设置上下文
 * 管理 WCAG AA/AAA 级无障碍功能设置
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ============================================
// 类型定义
// ============================================

/** WCAG AA 级基础设置 */
export interface A11yAASettings {
  /** 焦点指示器 - AA 级要求 */
  focusIndicator: boolean;
  /** 屏幕阅读器优化 */
  screenReaderOptimized: boolean;
  /** 大光标 */
  largeCursor: boolean;
}

/** WCAG AAA 级增强设置 */
export interface A11yAAASettings {
  /** 高对比度 - AAA 级对比度要求 */
  highContrast: boolean;
  /** 阅读增强 - AAA 级文本呈现要求 */
  readingEnhancement: boolean;
  /** 完全禁用动画 - AAA 级交互动画要求 */
  noAnimation: boolean;
  /** 节标题导航 - AAA 级节标题要求 */
  sectionNavigation: boolean;
}

/** 完整无障碍设置 */
export interface AccessibilitySettings extends A11yAASettings, A11yAAASettings {
  /** 版本号，用于迁移 */
  version: number;
}

/** 设置上下文类型 */
interface AccessibilityContextType {
  settings: AccessibilitySettings;
  /** 更新单个设置 */
  updateSetting: <K extends keyof AccessibilitySettings>(
    key: K,
    value: AccessibilitySettings[K]
  ) => void;
  /** 批量更新设置 */
  updateSettings: (settings: Partial<AccessibilitySettings>) => void;
  /** 重置为默认设置 */
  resetSettings: () => void;
  /** 是否正在加载 */
  isLoading: boolean;
}

// ============================================
// 默认值和常量
// ============================================

const STORAGE_KEY = 'papyrus_accessibility_settings';
const CURRENT_VERSION = 1;

/** 默认设置 */
export const DEFAULT_SETTINGS: AccessibilitySettings = {
  // AA 级（默认启用）
  focusIndicator: true,
  screenReaderOptimized: false,
  largeCursor: false,
  
  // AAA 级（默认禁用，需用户手动启用）
  highContrast: false,
  readingEnhancement: false,
  noAnimation: false,
  sectionNavigation: false,
  
  // 元数据
  version: CURRENT_VERSION,
};

// ============================================
// 创建上下文
// ============================================

const AccessibilityContext = createContext<AccessibilityContextType | null>(null);

// ============================================
// 辅助函数
// ============================================

/** 从 localStorage 加载设置 */
const loadSettings = (): Partial<AccessibilitySettings> | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('Failed to load accessibility settings:', error);
  }
  return null;
};

/** 保存设置到 localStorage */
const saveSettings = (settings: AccessibilitySettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save accessibility settings:', error);
  }
};

/** 合并设置，处理版本迁移 */
const mergeSettings = (
  stored: Partial<AccessibilitySettings> | null
): AccessibilitySettings => {
  if (!stored) {
    return DEFAULT_SETTINGS;
  }
  
  // 版本迁移处理
  const storedVersion = stored.version || 0;
  if (storedVersion < CURRENT_VERSION) {
    // 未来版本迁移逻辑放在这里
    console.log(`Migrating accessibility settings from v${storedVersion} to v${CURRENT_VERSION}`);
  }
  
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    version: CURRENT_VERSION,
  };
};

/** 应用设置到 DOM */
const applySettingsToDOM = (settings: AccessibilitySettings): void => {
  const { documentElement } = document;

  // AA 级设置
  documentElement.classList.toggle('a11y-focus-indicator', settings.focusIndicator);
  documentElement.classList.toggle('a11y-large-cursor', settings.largeCursor);
  documentElement.classList.toggle('a11y-screen-reader', settings.screenReaderOptimized);

  // AAA 级设置
  documentElement.classList.toggle('aaa-high-contrast', settings.highContrast);
  documentElement.classList.toggle('aaa-reading-mode', settings.readingEnhancement);
  documentElement.classList.toggle('aaa-no-animation', settings.noAnimation);
  documentElement.classList.toggle('aaa-section-nav', settings.sectionNavigation);

  // 应用大光标样式
  if (settings.largeCursor) {
    // 使用 CSS 类来控制大光标，避免内联样式的 SVG 转义问题
    documentElement.classList.add('a11y-large-cursor-active');
  } else {
    documentElement.classList.remove('a11y-large-cursor-active');
  }

  // 注入高特异性样式覆盖所有动画
  const styleId = 'a11y-no-animation-override';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (settings.noAnimation) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      html.aaa-no-animation, html.aaa-no-animation *,
      html.aaa-no-animation *::before, html.aaa-no-animation *::after {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
      }
      html.aaa-no-animation .arco-modal-zoom,
      html.aaa-no-animation .arco-menu-collapse,
      html.aaa-no-animation .arco-message-wrapper,
      html.aaa-no-animation .arco-notification-wrapper {
        animation: none !important;
        transition: none !important;
      }
      html.aaa-no-animation .tw-animate-page-up,
      html.aaa-no-animation .tw-animate-page-down,
      html.aaa-no-animation .tw-animate-page-exit-up,
      html.aaa-no-animation .tw-animate-page-exit-down {
        animation: none !important;
      }
    `;
  } else {
    styleEl?.remove();
  }

  // 广播无障碍设置变化事件
  window.dispatchEvent(new CustomEvent('papyrus_accessibility_changed', {
    detail: { noAnimation: settings.noAnimation },
  }));
};

// ============================================
// Provider 组件
// ============================================

interface AccessibilityProviderProps {
  children: React.ReactNode;
}

export const AccessibilityProvider: React.FC<AccessibilityProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<AccessibilitySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化：从 localStorage 加载设置
  useEffect(() => {
    const stored = loadSettings();
    let merged = mergeSettings(stored);

    // 如果系统没有要求减少动画，但 localStorage 中 noAnimation 为 true，
    // 可能是旧脏数据或意外开启，自动重置为 false 以恢复动画
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion && merged.noAnimation) {
      console.warn('[Accessibility] noAnimation was true but system does not prefer reduced motion. Resetting to false to restore animations.');
      merged = { ...merged, noAnimation: false };
      saveSettings(merged);
    }

    setSettings(merged);
    applySettingsToDOM(merged);
    setIsLoading(false);
  }, []);

  // 更新单个设置
  const updateSetting = useCallback(<K extends keyof AccessibilitySettings>(
    key: K,
    value: AccessibilitySettings[K]
  ) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      applySettingsToDOM(next);
      return next;
    });
  }, []);

  // 批量更新设置
  const updateSettings = useCallback((updates: Partial<AccessibilitySettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      saveSettings(next);
      applySettingsToDOM(next);
      return next;
    });
  }, []);

  // 重置为默认设置
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    applySettingsToDOM(DEFAULT_SETTINGS);
  }, []);

  const value: AccessibilityContextType = {
    settings,
    updateSetting,
    updateSettings,
    resetSettings,
    isLoading,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
};

// ============================================
// Hook
// ============================================

export const useAccessibility = (): AccessibilityContextType => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
};

// ============================================
// 便捷 Hook
// ============================================

/** 只获取设置值 */
export const useA11ySettings = (): AccessibilitySettings => {
  return useAccessibility().settings;
};

/** 只获取更新函数 */
export const useA11yUpdate = (): AccessibilityContextType['updateSetting'] => {
  return useAccessibility().updateSetting;
};

export default AccessibilityContext;
