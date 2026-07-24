import { Typography, Button } from '@arco-design/web-react';
import { IconUndo } from '@arco-design/web-react/icon';
import { RATING_CONFIG, type RatingGrade } from './constants';

interface ResultToastProps {
  grade: RatingGrade;
  onUndo: () => void;
  canUndo: boolean;
}

export function ResultToast({ grade, onUndo, canUndo }: ResultToastProps) {
  const config = RATING_CONFIG[grade];
  const Icon = config.icon;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: config.bgColor,
        borderRadius: '8px',
        border: `1px solid ${config.color}20`,
        animation: 'slideIn 0.3s ease',
      }}
    >
      <Icon style={{ fontSize: '18px', color: config.color }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <Typography.Text
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: config.color,
            lineHeight: 1.4,
          }}
        >
          上一张卡片标记为「{config.label}」
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: '12px', lineHeight: 1.4 }}>
          {config.desc}
        </Typography.Text>
      </div>
      {canUndo && (
        <Button
          type="text"
          size="small"
          icon={<IconUndo style={{ fontSize: '14px' }} />}
          onClick={onUndo}
          style={{
            marginLeft: '8px',
            color: 'var(--color-text-2)',
            fontSize: '13px',
          }}
        >
          撤销{' '}
          <kbd
            style={{
              padding: '2px 6px',
              background: 'var(--color-bg-1)',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '11px',
              marginLeft: '4px',
            }}
          >
            U
          </kbd>
        </Button>
      )}
    </div>
  );
}
