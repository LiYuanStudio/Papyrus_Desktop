import { Typography } from '@arco-design/web-react';
import { IconClockCircle, IconPlayCircle } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import { useCommonCardStyle, CommonCard } from '../../components';
import type { ScrollCardProps } from '../types';
import { PRIMARY_COLOR, SUCCESS_COLOR } from '../constants';

const ScrollCard = ({ scroll, onStudy }: ScrollCardProps) => {
  const { t } = useTranslation();
  // 吃默认新卡片语言(1px hairline + shadow-1/hover 抬升),不再自定义 2px 描边
  const { hovered, setHovered, cardStyle, width, height } = useCommonCardStyle();

  return (
    <CommonCard
      hovered={hovered}
      setHovered={setHovered}
      cardStyle={cardStyle}
      width={width}
      height={height}
      role="button"
      tabIndex={onStudy ? 0 : -1}
      aria-label={`${scroll.title}，${scroll.collection}，${scroll.dueCount > 0 ? t('scrollPage.dueCards', { count: scroll.dueCount }) : t('scrollPage.completedCards')}，共 ${scroll.cardCount} 张卡片`}
      aria-disabled={!onStudy ? 'true' : 'false'}
      onClick={onStudy}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onStudy) {
          e.preventDefault();
          onStudy();
        }
      }}
      style={{
        flex: '0 0 auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {scroll.dueCount > 0 && hovered && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onStudy?.();
          }}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: PRIMARY_COLOR,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            // 硬编码品牌蓝投影换中性 shadow-1: 无 primary 投影 token,中性阴影深浅主题都协调
            boxShadow: 'var(--shadow-1)',
          }}
        >
          <IconPlayCircle style={{ fontSize: '18px', color: '#fff' }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {scroll.dueCount > 0 ? (
            <div style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              background: PRIMARY_COLOR,
              color: '#fff',
              borderRadius: '999px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 600,
            }}>
              {t('scrollPage.dueCards', { count: scroll.dueCount })}
            </div>
          ) : (
            <div style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              // 硬编码浅绿底换 success-light token,深色模式为半透明绿底不刺眼
              background: 'var(--color-success-light)',
              color: SUCCESS_COLOR,
              borderRadius: '999px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 600,
            }}>
              {t('scrollPage.completedCards')}
            </div>
          )}
          <Typography.Text type='secondary' style={{ fontSize: '12px' }}>
            {scroll.collection}
          </Typography.Text>
        </div>
        <Typography.Text bold style={{ fontSize: '16px', lineHeight: 1.3 }}>
          {scroll.title}
        </Typography.Text>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconClockCircle style={{ fontSize: '14px', color: 'var(--color-text-3)' }} />
          <Typography.Text type='secondary' style={{ fontSize: '13px' }}>
            {scroll.lastStudied}
          </Typography.Text>
        </div>
        <Typography.Text type='secondary' style={{ fontSize: '13px' }}>
          {scroll.masteredCount}/{scroll.cardCount}
        </Typography.Text>
      </div>
    </CommonCard>
  );
};

export default ScrollCard;