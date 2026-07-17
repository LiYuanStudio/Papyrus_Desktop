import { useState } from 'react';
import { Typography } from '@arco-design/web-react';
import { IconPlus } from '@arco-design/web-react/icon';
import type { AddCardProps } from '../types';
import { PRIMARY_COLOR } from '../constants';

const AddCard = ({ label, onClick }: AddCardProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}，点击创建新项`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        flex: '0 0 auto',
        width: '220px',
        height: '140px',
        borderRadius: 'var(--radius-lg)',
        // 虚线占位卡: hairline 替代误用的文字色,hover 时品牌蓝 + 浮起,与其他卡片语言一致
        border: `1px dashed ${hovered ? PRIMARY_COLOR : 'var(--color-border-hairline)'}`,
        background: hovered ? 'var(--color-bg-1)' : 'transparent',
        boxShadow: hovered ? 'var(--shadow-1)' : 'none',
        transform: hovered ? 'translateY(-2px)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        cursor: 'pointer',
        transition: 'border-color var(--duration-normal) var(--ease-standard), background var(--duration-normal) var(--ease-standard), box-shadow var(--duration-normal) var(--ease-standard), transform var(--duration-normal) var(--ease-standard)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: hovered ? PRIMARY_COLOR : 'var(--color-fill-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s',
      }}>
        <IconPlus style={{ fontSize: '20px', color: hovered ? '#fff' : 'var(--color-text-1)' }} />
      </div>
      <Typography.Text type={hovered ? 'primary' : 'secondary'} style={{ fontSize: '14px' }}>
        {label}
      </Typography.Text>
    </div>
  );
};

export default AddCard;
