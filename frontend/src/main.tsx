/**
 * Papyrus 前端入口
 * 
 * 功能：
 * - React 18 并发渲染
 * - Arco Design 组件库
 * - 无障碍支持（WCAG 2.1 AA/AAA）
 * - 深色模式检测
 */
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from '@arco-design/web-react';
import zhCN from '@arco-design/web-react/es/locale/zh-CN';
import enUS from '@arco-design/web-react/es/locale/en-US';
import zhTW from '@arco-design/web-react/es/locale/zh-TW';
import jaJP from '@arco-design/web-react/es/locale/ja-JP';

import '@arco-design/web-react/es/_util/react-19-adapter';
import '@arco-design/web-react/dist/css/arco.css';
import './theme.css';  // 全局主题样式
import './platform.css';  // 平台原生化样式
import './a11y.css';  // 无障碍样式（WCAG 2.1 AA/AAA）
import './tailwind.css';  // Tailwind CSS

import App from './App';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import { ScreenReaderAnnouncerProvider } from './components/ScreenReaderAnnouncer';
import { api, type UiLanguage } from './api';
import {
  applyFontSizeToDom,
  applyUiSettings,
  DEFAULT_UI_LANGUAGE,
  readStoredFontSize,
  readStoredLanguage,
  UI_LANGUAGE_CHANGED_EVENT,
  type UiLanguageChangedDetail,
  isUiLanguage,
} from './utils/uiSettings';
import {
  appPlatform,
  applyPlatformToDom,
  applySystemAppearance,
} from './utils/platform';

// 初始化 i18n
import i18n, { init as i18nInit } from './i18n';

const el = document.getElementById('root');
if (!el) throw new Error('Missing #root');

// ============================================
// 系统偏好检测
// ============================================

// 平台是 preload 提供的同步常量，首个 React render 前写入 DOM 可避免标题栏布局闪烁。
// 原因：macOS traffic lights 安全区必须从首帧生效，否则启动时会短暂覆盖系统按钮。
// 未等待异步 IPC：平台运行期间不会变化，electronEnv 已是可信且足够的只读来源。
applyPlatformToDom(appPlatform);

// 检测深色模式偏好
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (prefersDark) {
  document.body.setAttribute('arco-theme', 'dark');
}

// 初始化字体大小
applyFontSizeToDom(readStoredFontSize());

// 监听深色模式变化
const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
const handleDarkModeChange = (e: MediaQueryListEvent) => {
  if (e.matches) {
    document.body.setAttribute('arco-theme', 'dark');
  } else {
    document.body.removeAttribute('arco-theme');
  }
};
darkModeQuery.addEventListener('change', handleDarkModeChange);

// HMR cleanup: remove listener on hot reload to prevent duplicate listeners
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    darkModeQuery.removeEventListener('change', handleDarkModeChange);
  });
}

// ============================================
// 渲染应用
// ============================================

/**
 * 应用根组件
 * 包装所有必要的 Provider
 */
const LOCALE_MAP: Record<UiLanguage, typeof zhCN> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'en-US': enUS,
  'ja-JP': jaJP,
};

const updateSplashScreenText = async () => {
  try {
    await i18nInit;
    const hintEl = document.querySelector('.splash-screen .hint');
    if (hintEl) {
      hintEl.textContent = i18n.t('settings.splashScreen');
    }
  } catch (e) {
    console.warn('Failed to update splash screen text:', e);
  }
};

const Root = () => {
  const [localeKey, setLocaleKey] = useState<UiLanguage>(() => readStoredLanguage());
  const [i18nReady, setI18nReady] = useState(false);

  const locale = LOCALE_MAP[localeKey] ?? zhCN;

  useEffect(() => {
    let appearanceRequestActive = true;
    const electronAPI = window.electronAPI;
    const unsubscribeAppearance = electronAPI?.onSystemAppearanceChanged((appearance) => {
      applySystemAppearance(appearance);
    });
    void electronAPI?.getSystemAppearance()
      .then((appearance) => {
        if (appearanceRequestActive) {
          applySystemAppearance(appearance);
        }
      })
      .catch((error: unknown) => {
        console.warn('Failed to read native appearance:', error);
      });

    return () => {
      appearanceRequestActive = false;
      unsubscribeAppearance?.();
    };
  }, []);

  useEffect(() => {
    const initI18n = async () => {
      await i18nInit;
      try {
        const data = await api.getUiSettings();
        if (data.success) {
          applyUiSettings(data.settings);
          await i18n.changeLanguage(data.settings.language);
          setLocaleKey(data.settings.language);
        }
      } catch (err) {
        const storedLanguage = readStoredLanguage();
        await i18n.changeLanguage(storedLanguage);
        setLocaleKey(storedLanguage);
        console.warn('Failed to load UI settings:', err);
      }
      setI18nReady(true);
    };
    initI18n();

    const handler = (e: StorageEvent) => {
      if (e.key === 'papyrus_language') {
        setLocaleKey(isUiLanguage(e.newValue) ? e.newValue : DEFAULT_UI_LANGUAGE);
      }
    };
    const languageChangedHandler = (e: Event) => {
      const detail = (e as CustomEvent<UiLanguageChangedDetail>).detail;
      setLocaleKey(isUiLanguage(detail?.language) ? detail.language : DEFAULT_UI_LANGUAGE);
    };
    window.addEventListener('storage', handler);
    window.addEventListener(UI_LANGUAGE_CHANGED_EVENT, languageChangedHandler);
    // 更新启动屏幕文本
    updateSplashScreenText();
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(UI_LANGUAGE_CHANGED_EVENT, languageChangedHandler);
    };
  }, []);

  if (!i18nReady) {
    return null; // 或者可以显示一个简单的加载动画
  }

  return (
    <React.StrictMode>
     <ConfigProvider locale={locale}>
        {/* 无障碍设置管理 */}
        <AccessibilityProvider>
          {/* 屏幕阅读器通知系统 */}
          <ScreenReaderAnnouncerProvider timeout={2000}>
            <App />
          </ScreenReaderAnnouncerProvider>
        </AccessibilityProvider>
      </ConfigProvider>
    </React.StrictMode>
  );
};

// 使用并发渲染
createRoot(el).render(<Root />);
