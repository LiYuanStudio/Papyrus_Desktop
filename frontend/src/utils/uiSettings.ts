import type { UiFontSize, UiLanguage, UiSettings } from '../api';

export const LANGUAGE_STORAGE_KEY = 'papyrus_language';
export const FONT_SIZE_STORAGE_KEY = 'papyrus_font_size';
export const UI_LANGUAGE_CHANGED_EVENT = 'papyrus_language_changed';
export const UI_FONT_SIZE_CHANGED_EVENT = 'papyrus_font_size_changed';

export const DEFAULT_UI_LANGUAGE: UiLanguage = 'zh-CN';
export const DEFAULT_UI_FONT_SIZE: UiFontSize = 'medium';

const SUPPORTED_LANGUAGES: readonly UiLanguage[] = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'];
const SUPPORTED_FONT_SIZES: readonly UiFontSize[] = ['small', 'medium', 'large'];

/**
 * 描述语言变更事件携带的有效语言。
 * 原因：根组件需要从同窗口事件中同步 Arco locale。
 * 未直接传字符串：事件边界保留对象结构便于后续扩展。
 */
export type UiLanguageChangedDetail = {
  language: UiLanguage;
};

/**
 * 描述字号变更事件携带的有效字号。
 * 原因：其他组件可以订阅字号变更，而无需直接读取 DOM dataset。
 * 未直接传字符串：事件边界保留对象结构便于后续扩展。
 */
export type UiFontSizeChangedDetail = {
  fontSize: UiFontSize;
};

/**
 * 校验未知值是否为支持的界面语言。
 * 原因：localStorage、自定义事件和 Arco Select 都是运行时输入。
 * 未使用类型断言：switch 可以让 TypeScript 精确收窄并避免绕过检查。
 */
export const isUiLanguage = (value: unknown): value is UiLanguage => {
  switch (value) {
    case 'zh-CN':
    case 'zh-TW':
    case 'en-US':
    case 'ja-JP':
      return true;
    default:
      return false;
  }
};

/**
 * 校验未知值是否为支持的界面字号。
 * 原因：字号会写入 body dataset，必须在进入 DOM 前收窄。
 * 未使用数组 includes：避免为了 includes 参数类型进行额外断言。
 */
export const isUiFontSize = (value: unknown): value is UiFontSize => {
  switch (value) {
    case 'small':
    case 'medium':
    case 'large':
      return true;
    default:
      return false;
  }
};

/**
 * 从本地缓存读取语言，并对非法值回退。
 * 原因：入口渲染早于后端请求完成，需要一个同步兜底。
 * 未直接信任 localStorage：旧版本或手动修改可能留下非法值。
 */
export const readStoredLanguage = (): UiLanguage => {
  try {
    const language = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isUiLanguage(language) ? language : DEFAULT_UI_LANGUAGE;
  } catch {
    return DEFAULT_UI_LANGUAGE;
  }
};

/**
 * 从本地缓存读取字号，并对非法值回退。
 * 原因：启动首帧需要先应用字号，后端值稍后覆盖。
 * 未直接信任 localStorage：非法字号会导致 CSS 变量不生效。
 */
export const readStoredFontSize = (): UiFontSize => {
  try {
    const fontSize = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    return isUiFontSize(fontSize) ? fontSize : DEFAULT_UI_FONT_SIZE;
  } catch {
    return DEFAULT_UI_FONT_SIZE;
  }
};

/**
 * 将语言镜像到本地缓存。
 * 原因：后端不可用或入口首帧渲染时仍需要同步兜底值。
 * 未把 localStorage 作为主存储：后端 UI 设置才是刷新后的权威来源。
 */
export const mirrorLanguageToLocalStorage = (language: UiLanguage): void => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // ignore
  }
};

/**
 * 将字号镜像到本地缓存。
 * 原因：CSS 首帧字号需要同步可读的兜底值。
 * 未把 localStorage 作为主存储：后端 UI 设置负责跨刷新持久化。
 */
export const mirrorFontSizeToLocalStorage = (fontSize: UiFontSize): void => {
  try {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSize);
  } catch {
    // ignore
  }
};

/**
 * 将字号应用到 body dataset。
 * 原因：现有全局 CSS 通过 body[data-font-size] 驱动 Arco 和普通控件字号。
 * 未改成 React Context：CSS 变量已经覆盖全局组件，继续使用 DOM dataset 改动最小。
 */
export const applyFontSizeToDom = (fontSize: UiFontSize): void => {
  document.body.dataset.fontSize = fontSize;
};

/**
 * 分发同窗口语言变更事件。
 * 原因：storage 事件不会通知发起写入的当前窗口，Root 需要额外信号更新 Arco locale。
 * 未只依赖 i18next：Arco ConfigProvider 有独立 locale 状态。
 */
export const dispatchLanguageChanged = (language: UiLanguage): void => {
  window.dispatchEvent(new CustomEvent<UiLanguageChangedDetail>(UI_LANGUAGE_CHANGED_EVENT, {
    detail: { language },
  }));
};

/**
 * 分发同窗口字号变更事件。
 * 原因：已有代码约定监听该事件获知字号变化，保留兼容性。
 * 未只依赖 DOM dataset：事件能让非 CSS 逻辑同步响应。
 */
export const dispatchFontSizeChanged = (fontSize: UiFontSize): void => {
  window.dispatchEvent(new CustomEvent<UiFontSizeChangedDetail>(UI_FONT_SIZE_CHANGED_EVENT, {
    detail: { fontSize },
  }));
};

/**
 * 将后端 UI 设置同步到浏览器运行态和本地兜底缓存。
 * 原因：根组件、设置页和刷新前启动代码都依赖同一份语言/字号状态，集中处理可避免局部状态漂移。
 * 未让调用方各自处理 localStorage：分散写入容易再次出现 Arco Provider 与 i18n 状态不同步。
 */
export const applyUiSettings = (settings: Pick<UiSettings, 'language' | 'fontSize'>): void => {
  mirrorLanguageToLocalStorage(settings.language);
  mirrorFontSizeToLocalStorage(settings.fontSize);
  applyFontSizeToDom(settings.fontSize);
  dispatchLanguageChanged(settings.language);
  dispatchFontSizeChanged(settings.fontSize);
};
