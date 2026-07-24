import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from '../locales/zh-CN.json';
import enUS from '../locales/en-US.json';
import zhTW from '../locales/zh-TW.json';
import jaJP from '../locales/ja-JP.json';
import { readStoredLanguage } from '../utils/uiSettings';

const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
  'zh-TW': { translation: zhTW },
  'ja-JP': { translation: jaJP },
};

const savedLanguage = readStoredLanguage();

export const init = i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage,
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
