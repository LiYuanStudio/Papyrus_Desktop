import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Typography } from '@arco-design/web-react';
import { IconArrowLeft } from '@arco-design/web-react/icon';

const { Text } = Typography;

export interface MenuItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
}

interface SettingsSidebarProps {
  title: string;
  menuItems: MenuItem[];
  activeItem: string;
  onItemClick: (key: string) => void;
  onBack: () => void;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export const SettingsSidebar = ({
  title,
  menuItems,
  activeItem,
  onItemClick,
  onBack,
  defaultWidth = 200,
  minWidth = 160,
  maxWidth = 320,
}: SettingsSidebarProps) => {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  // 侧边栏拖拽调整
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, minWidth, maxWidth]);

  return (
    <>
      {/* 次要侧边栏 */}
      <div
        style={{
          width: `${width}px`,
          height: '100%',
          borderRight: '1px solid var(--color-border-2)',
          background: 'var(--color-bg-1)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* 标题栏 */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid var(--color-border-2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Button
            type="text"
            icon={<IconArrowLeft />}
            onClick={onBack}
            style={{ padding: 0, fontSize: 'var(--font-size-sm)' }}
          />
          <Text style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{title}</Text>
        </div>

        {/* 菜单项 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeItem === item.key;
            return (
              <div
                key={item.key}
                onClick={() => onItemClick(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  // 激活态精修：小圆角 + 标准缓动短过渡，避免 "all 0.2s" 的粗糙感
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '4px',
                  background: isActive ? 'var(--color-primary-light)' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-1)',
                  transition: 'background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--color-fill-2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <Icon style={{ fontSize: 'var(--font-size-md)' }} />
                <Text
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: isActive ? 'var(--color-primary)' : 'inherit',
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {item.label}
                </Text>
              </div>
            );
          })}
        </div>
      </div>

      {/* 拖拽条 */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: '4px',
          cursor: isResizing ? 'col-resize' : 'ew-resize',
          background: isResizing ? 'var(--color-primary)' : 'transparent',
          transition: 'background var(--duration-fast) var(--ease-standard)',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!isResizing) e.currentTarget.style.background = 'var(--color-border-2)';
        }}
        onMouseLeave={(e) => {
          if (!isResizing) e.currentTarget.style.background = 'transparent';
        }}
      />
    </>
  );
};

interface SettingsContentProps {
  title: string;
  children: React.ReactNode;
}

export const SettingsContent = ({ title, children }: SettingsContentProps) => {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '48px',
      }}
    >
      <Typography.Title
        heading={2}
        style={{ margin: '0 0 32px 0', fontWeight: 400, fontSize: 'var(--font-size-display-lg)' }}
      >
        {title}
      </Typography.Title>
      {children}
    </div>
  );
};

interface SettingsSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

export const SettingsSection = ({ id, title, children }: SettingsSectionProps) => {
  return (
    <div id={id} className="settings-section">
      <Typography.Title heading={4} className="settings-section-title">
        {title}
      </Typography.Title>
      {children}
    </div>
  );
};

// Hook for scroll spy
export const useScrollSpy = (
  sectionIds: string[],
  options?: { offset?: number; onChange?: (activeId: string) => void }
) => {
  const [activeId, setActiveId] = useState(sectionIds[0] || '');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const offset = options?.offset ?? 48;

      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const element = document.getElementById(sectionIds[i]);
        if (element && element.offsetTop - offset <= scrollTop) {
          if (activeId !== sectionIds[i]) {
            setActiveId(sectionIds[i]);
            options?.onChange?.(sectionIds[i]);
          }
          break;
        }
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [sectionIds, activeId, options]);

  const scrollToSection = useCallback(
    (id: string) => {
      const element = document.getElementById(id);
      if (element && contentRef.current) {
        const container = contentRef.current;
        const offsetTop = element.offsetTop - 24;
        container.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
    },
    []
  );

  return { activeId, contentRef, scrollToSection, setActiveId };
};
