import { useState } from 'react';
import { Typography } from '@arco-design/web-react';
import { IconPlus } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import { PRIMARY_COLOR, CARD_HEIGHT } from '../constants';

interface AddCardProps {
  onClick: () => void;
}

export const AddCard = ({ onClick }: AddCardProps) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        height: `${CARD_HEIGHT}px`,
        // 圆角对齐卡片语言 --radius-lg
        borderRadius: 'var(--radius-lg)',
        // 虚线边框原误用文字色 text-3,改用发丝边框 token(深色模式同样成立)
        border: `1px dashed ${hovered ? PRIMARY_COLOR : 'var(--color-border-hairline)'}`,
        // 修复: `${PRIMARY_COLOR}08` 是无效 CSS 拼接,hover 底色改走 --color-primary-light
        background: hovered ? 'var(--color-primary-light)' : 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        cursor: 'pointer',
        transition: 'border-color var(--duration-normal) var(--ease-standard), background var(--duration-normal) var(--ease-standard)',
        boxSizing: 'border-box' as const,
      }}
    >
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        background: hovered ? PRIMARY_COLOR : 'var(--color-fill-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background var(--duration-normal) var(--ease-standard)',
      }}>
        <IconPlus style={{ 
          fontSize: '24px', 
          color: hovered ? '#fff' : 'var(--color-text-2)' 
        }} />
      </div>
      <Typography.Text 
        type={hovered ? 'primary' : 'secondary'} 
        style={{ fontSize: '14px' }}
      >
        {t('noteDetail.newNote')}
      </Typography.Text>
    </div>
  );
};
