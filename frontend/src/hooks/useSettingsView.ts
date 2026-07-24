import { useTranslation } from 'react-i18next';
import type { NavItem, Section } from '../SettingsPage/components/SettingsViewLayout';

interface TranslationKeyNavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
}

interface TranslationKeySection {
  id: string;
  title: string;
  icon?: React.ComponentType<{ style?: React.CSSProperties }>;
  iconColor?: string;
}

interface UseSettingsViewConfig {
  navItems: TranslationKeyNavItem[];
  sections: TranslationKeySection[];
}

export const useSettingsView = (config: UseSettingsViewConfig) => {
  const { t } = useTranslation();

  const navItems: NavItem[] = config.navItems.map(item => ({
    ...item,
    label: t(item.label),
  }));

  const sections: Section[] = config.sections.map(section => ({
    ...section,
    title: t(section.title),
  }));

  return { navItems, sections };
};