import { Typography } from '@arco-design/web-react';
import { IconBook, IconEdit } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import { useCommonCardStyle, CommonCard } from '../../components';
import type { CollectionCardProps } from '../types';

const CollectionCard = ({ collection, onClick, onManage }: CollectionCardProps) => {
  const { t } = useTranslation();
  // 删掉自定义 2px 描边配置,吃 useCommonCardStyle 默认新卡片语言
  const { hovered, setHovered, cardStyle, width, height } = useCommonCardStyle();

  return (
    <CommonCard
      hovered={hovered}
      setHovered={setHovered}
      cardStyle={cardStyle}
      width={width}
      height={height}
      role="button"
      tabIndex={0}
      aria-label={`${collection.title}，包含 ${collection.scrollCount} 个卷轴，共 ${collection.totalCards} 张卡片`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          background: 'var(--color-fill-2)',
          color: 'var(--color-text-3)',
          borderRadius: '999px',
          padding: '2px 10px',
          fontSize: '12px',
          fontWeight: 600,
        }}>
          {t('scrollPage.cards', { count: collection.totalCards })}
        </div>
        <Typography.Text bold style={{ fontSize: '16px', lineHeight: 1.3 }}>
          {collection.title}
        </Typography.Text>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <IconBook style={{ fontSize: '14px', color: 'var(--color-text-3)' }} />
        <Typography.Text type='secondary' style={{ fontSize: '13px' }}>
          {t('scrollPage.cards', { count: collection.totalCards })}
        </Typography.Text>
      </div>

      {hovered && onManage && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onManage(e);
          }}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'var(--color-fill-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <IconEdit style={{ fontSize: '12px', color: 'var(--color-text-2)' }} />
        </div>
      )}
    </CommonCard>
  );
};

export default CollectionCard;