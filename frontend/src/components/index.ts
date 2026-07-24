/**
 * 组件导出索引
 */

// 无障碍相关组件
export { default as ScreenReaderAnnouncer } from './ScreenReaderAnnouncer';
export { 
  ScreenReaderAnnouncerProvider, 
  useAnnouncer, 
  useAnnouncePolite, 
  useAnnounceAssertive 
} from './ScreenReaderAnnouncer';

export { default as SectionNavigation } from './SectionNavigation';
export { useAutoHeadingIds } from './SectionNavigation';

// 其他组件
export { default as ChatHistory } from './ChatHistory';
export { default as ReasoningChain } from './ReasoningChain';
export { default as SceneryBackground } from './SceneryBackground';
export { default as SmartTextArea } from './SmartTextArea';
export { default as TailwindExample } from './TailwindExample';
export { default as ToolCallCard } from './ToolCallCard';

// 公共卡片组件
export { CommonCard, useCommonCardStyle, SECONDARY_COLOR, PRIMARY_COLOR } from './CommonCard';
export type { CommonCardStyles, CommonCardConfig } from './CommonCard';
export { CardGroup } from './CardGroup';

// 页面布局组件
export { PageLayout } from './PageLayout';
export type { StatItem, PageLayoutProps } from './PageLayout';
