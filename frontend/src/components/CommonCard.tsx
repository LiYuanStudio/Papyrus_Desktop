import { useState } from 'react';

export interface CommonCardStyles {
  borderRadius: string;
  border: string;
  background: string;
  boxShadow: string;
  transform: string;
  transition: string;
  cursor: string;
}

export interface CommonCardConfig {
  borderWidth?: number;
  defaultBorderColor?: string;
  hoverBorderColor?: string;
  defaultBackground?: string;
  hoverBackground?: string;
  width?: number | string;
  height?: number | string;
}

// 默认卡片语言: 发丝边框(hairline) + 静态浅阴影,hover 换 primary 细边 + 抬升加深阴影。
// 未沿用 var(--color-text-3) 描边: 文字色当边框在两种主题下都显脏;
// 未保留 primary-light 整卡染色: 抬升+细边已足够表达可交互,染色会让密集卡片页面发花。
const DEFAULT_CONFIG: Required<CommonCardConfig> = {
  borderWidth: 1,
  defaultBorderColor: 'var(--color-border-hairline)',
  hoverBorderColor: 'var(--color-primary)',
  defaultBackground: 'var(--color-bg-1)',
  hoverBackground: 'var(--color-bg-1)',
  width: 220,
  height: 140,
};

export const useCommonCardStyle = (config: CommonCardConfig = {}) => {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const [hovered, setHovered] = useState(false);

  const cardStyle: CommonCardStyles = {
    borderRadius: 'var(--radius-lg)',
    border: `${mergedConfig.borderWidth}px solid ${hovered ? mergedConfig.hoverBorderColor : mergedConfig.defaultBorderColor}`,
    background: hovered ? mergedConfig.hoverBackground : mergedConfig.defaultBackground,
    boxShadow: hovered ? 'var(--shadow-2)' : 'var(--shadow-1)',
    transform: hovered ? 'translateY(-2px)' : 'none',
    transition: 'border-color var(--duration-normal) var(--ease-standard), background var(--duration-normal) var(--ease-standard), box-shadow var(--duration-normal) var(--ease-standard), transform var(--duration-normal) var(--ease-standard)',
    cursor: 'pointer',
  };

  return {
    hovered,
    setHovered,
    cardStyle,
    width: mergedConfig.width,
    height: mergedConfig.height,
  };
};

interface CommonCardProps {
  hovered: boolean;
  setHovered: (hovered: boolean) => void;
  cardStyle: CommonCardStyles;
  children: React.ReactNode;
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
  role?: string;
  tabIndex?: number;
  'aria-label'?: string;
  'aria-disabled'?: boolean | 'true' | 'false';
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export const CommonCard = ({
  hovered: _hovered,
  setHovered,
  cardStyle,
  children,
  width,
  height,
  style,
  className,
  onClick,
  role,
  tabIndex,
  'aria-label': ariaLabel,
  'aria-disabled': ariaDisabled,
  onKeyDown,
}: CommonCardProps) => {
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      aria-disabled={ariaDisabled}
      className={className}
      style={{
        ...cardStyle,
        ...(width !== undefined && { width }),
        ...(height !== undefined && { height }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export { SECONDARY_COLOR, PRIMARY_COLOR } from '../theme-constants';
