import { Typography } from '@arco-design/web-react';
import { usePageScenery, type PageType } from '../hooks/useScenery';
import { Spin } from '@arco-design/web-react';
import { useState } from 'react';

const STATS_FONT_SIZE = '24px';
const STATS_LABEL_FONT_SIZE = '12px';
const STATS_VALUE_COLOR = '#FFFFFF';
const STATS_LABEL_COLOR = 'rgba(255, 255, 255, 0.75)';

export interface StatItem {
  value: string | number;
  label: string;
  suffix?: string;
}

export interface PageLayoutProps {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  stats?: StatItem[];
  statsLoading?: boolean;
  pageKey?: PageType;
  extraStatsContent?: React.ReactNode;
  statsContent?: React.ReactNode;
}

export const PageLayout = ({
  title,
  children,
  actions,
  stats,
  statsLoading = false,
  pageKey,
  extraStatsContent,
  statsContent,
}: PageLayoutProps) => {
  const { config: sceneryConfig, loaded } = usePageScenery(pageKey || 'common');
  const [failedSceneryImages, setFailedSceneryImages] = useState<Record<string, true>>({});

  const imageFailed = !!failedSceneryImages[sceneryConfig.image];
  const canShowScenery = sceneryConfig.enabled && !!sceneryConfig.image && !imageFailed;

  const renderStats = () => {
    if (statsContent) {
      if (!loaded || statsLoading) {
        return (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '24px',
            marginBottom: '32px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-hairline)',
          boxShadow: 'var(--shadow-1)',
            background: 'var(--color-bg-1)',
          }}>
            <Spin size={24} />
          </div>
        );
      }

      const image = sceneryConfig.image;
      const overlayOpacity = Math.max(0.25, Math.min(0.75, sceneryConfig.opacity));

      return (
        <div style={{
          position: 'relative',
          padding: '24px',
          marginBottom: '32px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border-hairline)',
          boxShadow: 'var(--shadow-1)',
          overflow: 'hidden',
        }}>
          {canShowScenery && (
            <>
              <img
                src={image}
                alt="窗景图片"
                onError={() => setFailedSceneryImages(prev => ({ ...prev, [image]: true }))}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `rgba(var(--scenery-overlay-rgb), ${overlayOpacity})`,
                }}
              />
            </>
          )}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            {statsContent}
            {extraStatsContent}
          </div>
        </div>
      );
    }

    if (!stats && !extraStatsContent) return null;

    if (!loaded || statsLoading) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '24px',
          marginBottom: '32px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border-hairline)',
          boxShadow: 'var(--shadow-1)',
          background: 'var(--color-bg-1)',
        }}>
          <Spin size={24} />
        </div>
      );
    }

    const statValueColor = canShowScenery ? STATS_VALUE_COLOR : 'var(--color-text-1)';
    const statLabelColor = canShowScenery ? STATS_LABEL_COLOR : 'var(--color-text-2)';

    const content = (
      <div style={{ display: 'flex', gap: stats ? '48px' : '0', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', gap: stats ? '48px' : '0' }}>
          {stats?.map((stat, index) => (
            <div key={index} style={{ textAlign: 'center' }}>
              <Typography.Text style={{
                fontSize: STATS_FONT_SIZE,
                fontWeight: 600,
                color: statValueColor,
              }}>
                {stat.value}
                {stat.suffix && <span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '4px' }}>{stat.suffix}</span>}
              </Typography.Text>
              <Typography.Text style={{
                fontSize: STATS_LABEL_FONT_SIZE,
                display: 'block',
                marginTop: '4px',
                color: statLabelColor,
              }}>
                {stat.label}
              </Typography.Text>
            </div>
          ))}
        </div>
        {extraStatsContent}
      </div>
    );

    if (!canShowScenery) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '24px',
          marginBottom: '32px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border-hairline)',
          boxShadow: 'var(--shadow-1)',
          background: 'var(--color-bg-1)',
        }}>
          {content}
        </div>
      );
    }

    const image = sceneryConfig.image;
    const overlayOpacity = Math.max(0.25, Math.min(0.75, sceneryConfig.opacity));

    return (
      <div style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px',
        marginBottom: '32px',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-hairline)',
          boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}>
        <img
          src={image}
          alt="窗景图片"
          onError={() => setFailedSceneryImages(prev => ({ ...prev, [image]: true }))}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `rgba(var(--scenery-overlay-rgb), ${overlayOpacity})`,
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          {content}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '48px 64px 64px',
      background: 'var(--color-bg-canvas)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px'
      }}>
        <Typography.Title
          heading={1}
          style={{ fontWeight: 600, lineHeight: 1, margin: 0, fontSize: 'var(--font-size-display-xl)', letterSpacing: '-0.01em' }}
        >
          {title}
        </Typography.Title>
        {actions && (
          <div style={{ display: 'flex', gap: '12px' }}>
            {actions}
          </div>
        )}
      </div>

      {renderStats()}

      {children}

      <div style={{ height: '32px' }} />
    </div>
  );
};

export default PageLayout;
