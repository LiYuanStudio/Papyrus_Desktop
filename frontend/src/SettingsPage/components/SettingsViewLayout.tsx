import { Button, Typography } from '@arco-design/web-react';
import { IconArrowLeft } from '@arco-design/web-react/icon';
import { useScrollNavigation } from '../../hooks/useScrollNavigation';

const { Text, Paragraph } = Typography;

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
}

export interface Section {
  id: string;
  title?: string;
  icon?: React.ComponentType<{ style?: React.CSSProperties }>;
  iconColor?: string;
}

interface SettingsViewLayoutProps {
  title: string;
  description?: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  iconColor?: string;
  navItems: NavItem[];
  sections: Section[];
  onBack: () => void;
  children: (sectionId: string) => React.ReactNode;
  sidebarWidth?: number;
}

export const SettingsViewLayout = ({
  title,
  description,
  icon: Icon,
  iconColor = 'var(--color-primary)',
  navItems,
  sections,
  onBack,
  children,
  sidebarWidth = 200,
}: SettingsViewLayoutProps) => {
  const { contentRef, activeSection, scrollToSection } = useScrollNavigation(navItems);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      overflow: 'hidden',
      position: 'relative',
      // 页面工作区底色用 canvas，让 bg-1 的侧边栏与分区卡片自然浮出
      background: 'var(--color-bg-canvas)',
      height: '100%',
    }}>
      <div style={{
        width: sidebarWidth,
        height: '100%',
        borderRight: '1px solid var(--color-border-2)',
        background: 'var(--color-bg-1)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <div style={{
          padding: 16,
          borderBottom: '1px solid var(--color-border-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Button
            type="text"
            icon={<IconArrowLeft />}
            onClick={onBack}
            style={{ padding: 0, fontSize: 'var(--font-size-sm)' }}
          />
          <Text style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{title}</Text>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {navItems.map((item) => {
            const ItemIcon = item.icon;
            const isActive = activeSection === item.key;
            return (
              <button
                key={item.key}
                onClick={() => scrollToSection(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  // 与 SettingsSidebar 菜单项同一套精修：小圆角 + 标准缓动
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 4,
                  background: isActive ? 'var(--color-primary-light)' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-1)',
                  border: 'none',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)',
                  userSelect: 'none',
                }}
              >
                <ItemIcon style={{ fontSize: 'var(--font-size-md)' }} />
                <Text style={{
                  fontSize: 'var(--font-size-sm)',
                  color: isActive ? 'var(--color-primary)' : 'inherit',
                  fontWeight: isActive ? 500 : 400,
                }}>{item.label}</Text>
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={contentRef}
        onWheel={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 48px',
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Icon style={{ fontSize: 'var(--font-size-display-lg)', color: iconColor }} />
            <Typography.Title heading={2} style={{ margin: 0, fontWeight: 400, fontSize: 'var(--font-size-display-lg)' }}>
              {title}
            </Typography.Title>
          </div>
          {description && (
            <Paragraph type="secondary">
              {description}
            </Paragraph>
          )}
        </div>

        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            style={{ marginBottom: 48, scrollMarginTop: 24 }}
          >
            {section.title && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                {section.icon && (
                  <section.icon style={{ fontSize: 'var(--font-size-xl)', color: section.iconColor || 'var(--color-text-1)' }} />
                )}
                <Typography.Title heading={4} style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>
                  {section.title}
                </Typography.Title>
              </div>
            )}
            <div className="settings-section" style={{
              // 分区容器升级为统一卡片语言：bg-1 + hairline 边 + 静态投影，
              // 替代原来的 bg-2 灰块，深色模式下层级更清晰
              background: 'var(--color-bg-1)',
              border: '1px solid var(--color-border-hairline)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-1)',
              padding: '16px 20px',
              marginBottom: index === sections.length - 1 ? 0 : 24,
            }}>
              {children(section.id)}
            </div>
          </section>
        ))}

        <div style={{ height: 'calc(100vh - 200px)', flexShrink: 0 }} />
      </div>
    </div>
  );
};

export default SettingsViewLayout;
