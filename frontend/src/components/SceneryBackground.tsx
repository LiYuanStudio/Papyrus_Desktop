/**
 * 窗景背景组件
 * 已简化为纯容器，不再处理背景窗景
 */
import { type CSSProperties } from 'react';

interface SceneryBackgroundProps {
  children: React.ReactNode;
  style?: CSSProperties;
  className?: string;
}

// 页面容器 - 已移除背景窗景功能
export const SceneryBackground = ({ children, style, className }: SceneryBackgroundProps) => {
  const containerStyle: CSSProperties = {
    position: 'relative',
    minHeight: '100%',
    ...style,
  };

  return (
    <div className={className} style={containerStyle}>
      {children}
    </div>
  );
};

// 开始页面专用容器 - 已移除背景窗景功能
interface StartPageSceneryBackgroundProps {
  children: React.ReactNode;
  style?: CSSProperties;
  className?: string;
  id?: string;
}

export const StartPageSceneryBackground = ({ children, style, className, id }: StartPageSceneryBackgroundProps) => {
  const containerStyle: CSSProperties = {
    position: 'relative',
    minHeight: '100%',
    ...style,
  };

  return (
    <div id={id} className={className} style={containerStyle}>
      {children}
    </div>
  );
};

export default SceneryBackground;
