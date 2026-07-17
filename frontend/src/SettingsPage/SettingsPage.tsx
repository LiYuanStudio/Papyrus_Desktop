import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Typography,
} from '@arco-design/web-react';
import {
  IconRobot,
  IconSettings,
  IconStorage,
  IconEdit,
  IconTool,
  IconFileImage,
  IconInfoCircle,
  IconCommon,
} from '@arco-design/web-react/icon';
import IconAccessibility from '../icons/IconAccessibility';
import IconCharts from '../icons/IconCharts';
import ExtensionsPage from '../ExtensionsPage/ExtensionsPage';
import './SettingsPage.css';
import {
  AppearanceView,
  GeneralView,
  ChatView,
  ToolView,
  ShortcutsView,
  AccessibilityView,
  StatisticsView,
  DataView,
  AboutView,
} from './views';

const { Title, Text, Paragraph } = Typography;

const getSettingCategories = (t: (key: string) => string) => [
  {
    key: 'appearance',
    title: t('settings.appearance'),
    desc: t('settings.appearanceDesc'),
    icon: IconFileImage,
    color: 'var(--color-primary)',
  },
  {
    key: 'general',
    title: t('settings.general'),
    desc: t('settings.generalDesc'),
    icon: IconSettings,
    color: 'var(--color-success)',
  },
  {
    key: 'chat',
    title: t('settings.chat'),
    desc: t('settings.chatDesc'),
    icon: IconRobot,
    // 功能强调色走 Arco 色板变量（rgb 三元组），深色模式下自动变亮，不写死 hex
    color: 'rgb(var(--purple-6))',
  },
  {
    key: 'mcp',
    title: t('settings.tools'),
    desc: t('settings.toolsDesc'),
    icon: IconTool,
    color: 'var(--color-danger)',
  },
  {
    key: 'shortcuts',
    title: t('settings.shortcuts'),
    desc: t('settings.shortcutsDesc'),
    icon: IconEdit,
    color: 'var(--color-warning)',
  },
  {
    key: 'accessibility',
    title: t('settings.accessibility'),
    desc: t('settings.accessibilityDesc'),
    icon: IconAccessibility,
    color: 'rgb(var(--gold-6))',
  },
  {
    key: 'statistics',
    title: t('chartsPage.title'),
    desc: t('settings.statisticsDesc'),
    icon: IconCharts,
    color: 'var(--color-primary)',
  },
  {
    key: 'data',
    title: t('settings.data'),
    desc: t('settings.dataDesc'),
    icon: IconStorage,
    color: 'rgb(var(--cyan-6))',
  },
  {
    key: 'extensions',
    title: t('settings.extensions'),
    desc: t('settings.extensionsDesc'),
    icon: IconCommon,
    color: 'rgb(var(--purple-6))',
  },
  {
    key: 'about',
    title: t('settings.about'),
    desc: t('settings.aboutDesc'),
    icon: IconInfoCircle,
    color: 'var(--color-primary)',
  },
];

interface CategoryCardProps {
  category: {
    key: string;
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  };
  onCategoryClick: (key: string) => void;
}

const CategoryCard = ({ category, onCategoryClick }: CategoryCardProps) => {
  const Icon = category.icon;

  return (
    <div
      className="settings-category-card"
      onClick={() => onCategoryClick(category.key)}
      role="button"
      tabIndex={0}
      aria-label={`${category.title}: ${category.desc}`}
      onKeyDown={(e) => e.key === 'Enter' && onCategoryClick(category.key)}
    >
      <div 
        className="settings-category-icon"
        style={{ 
          color: category.color,
        }}
      >
        <Icon className="settings-category-icon-svg" />
      </div>
      <div className="settings-category-content">
        <Text bold className="settings-category-title">{category.title}</Text>
        <Paragraph type="secondary" className="settings-category-desc">
          {category.desc}
        </Paragraph>
      </div>
    </div>
  );
};

interface MainViewProps {
  title: string;
  categories: Array<{
    key: string;
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }>;
  onCategoryClick: (key: string) => void;
}

const MainView = ({ title, categories, onCategoryClick }: MainViewProps) => (
  <div className="settings-main settings-main-scrollable">
    <Title heading={1} style={{ fontWeight: 600, lineHeight: 1, margin: 0, fontSize: 'var(--font-size-display-xl)' }}>{title}</Title>
    <div className="settings-categories-grid">
      {categories.map(category => (
        <CategoryCard key={category.key} category={category} onCategoryClick={onCategoryClick} />
      ))}
    </div>
  </div>
);

const SettingsPage = () => {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const SETTING_CATEGORIES = getSettingCategories(t);

  const handleCategoryClick = (key: string) => {
    setDirection('in');
    setAnimating(true);
    setActiveCategory(key);
  };

  const handleBack = () => {
    setDirection('out');
    setAnimating(true);
    setTimeout(() => {
      setActiveCategory(null);
      setAnimating(false);
    }, 200);
  };

  useEffect(() => {
    if (!animating) return;
    const timer = setTimeout(() => setAnimating(false), 200);
    return () => clearTimeout(timer);
  }, [animating, activeCategory]);

  const getViewComponent = (key: string) => {
    const views: Record<string, React.ReactNode> = {
      appearance: <AppearanceView onBack={handleBack} />,
      general: <GeneralView onBack={handleBack} />,
      chat: <ChatView onBack={handleBack} />,
      mcp: <ToolView onBack={handleBack} />,
      shortcuts: <ShortcutsView onBack={handleBack} />,
      accessibility: <AccessibilityView onBack={handleBack} />,
      statistics: <StatisticsView onBack={handleBack} />,
      data: <DataView onBack={handleBack} />,
      extensions: <ExtensionsPage onBack={handleBack} />,
      about: <AboutView onBack={handleBack} />,
    };
    return views[key];
  };

  return (
    <div className="settings-page">
      {activeCategory === null && !animating && (
        <MainView 
          title={t('settings.title')}
          categories={SETTING_CATEGORIES}
          onCategoryClick={handleCategoryClick}
        />
      )}
      {activeCategory === null && animating && direction === 'out' && (
        <div className="settings-main settings-main-scrollable settings-page-exit">
          <Title heading={1} style={{ fontWeight: 600, lineHeight: 1, margin: 0, fontSize: 'var(--font-size-display-xl)' }}>{t('settings.title')}</Title>
          <div className="settings-categories-grid">
            {SETTING_CATEGORIES.map(category => (
              <CategoryCard key={category.key} category={category} onCategoryClick={handleCategoryClick} />
            ))}
          </div>
        </div>
      )}
      {activeCategory !== null && (
        <div
          className={`settings-animation-wrapper ${direction === 'in' ? 'settings-page-enter' : 'settings-page-exit'}`}
        >
          {getViewComponent(activeCategory)}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
