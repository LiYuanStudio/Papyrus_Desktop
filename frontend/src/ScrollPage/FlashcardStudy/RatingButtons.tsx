import { Button, Typography } from '@arco-design/web-react';
import { RATING_CONFIG, type RatingGrade } from './constants';

interface RatingButtonsProps {
  onRate: (grade: RatingGrade) => void;
}

export function RatingButtons({ onRate }: RatingButtonsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '16px',
        justifyContent: 'center',
      }}
    >
      {/* 柔和填充风评分按钮: 浅色功能底 + 同色 1px 边,hover 微抬升、active 下沉。
          交互态写在类里而非内联: 内联 style 无法表达 :hover/:active;
          未用 useState 跟踪 hover: 纯样式类即可,不引入额外渲染状态。 */}
      <style>{`
        .papyrus-rating-btn {
          transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
        }
        .papyrus-rating-btn:hover {
          transform: translateY(-1px);
          box-shadow: var(--shadow-1);
        }
        .papyrus-rating-btn:active {
          transform: translateY(0);
          box-shadow: none;
        }
      `}</style>
      {(Object.entries(RATING_CONFIG) as [string, typeof RATING_CONFIG[1]][]).map(
        ([grade, config]) => {
          const Icon = config.icon;
          return (
            <Button
              key={grade}
              size="large"
              className="papyrus-rating-btn"
              onClick={() => onRate(Number(grade) as RatingGrade)}
              aria-label={`${config.label}，${config.desc}，快捷键 ${grade}`}
              style={{
                height: '72px',
                minWidth: '140px',
                borderRadius: 'var(--radius-lg)',
                border: `1px solid ${config.color}`,
                background: config.bgColor,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '0 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon style={{ fontSize: '18px', color: config.color }} />
                <Typography.Text
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: config.color,
                    lineHeight: 1.4,
                  }}
                >
                  {config.label}
                </Typography.Text>
              </div>
              <Typography.Text type="secondary" style={{ fontSize: '12px', lineHeight: 1.4 }}>
                {config.desc}
              </Typography.Text>
            </Button>
          );
        }
      )}
    </div>
  );
}

export function RevealHint() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 24px',
        background: 'var(--color-fill-2)',
        borderRadius: '24px',
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: '14px' }}>
        按
      </Typography.Text>
      <kbd
        style={{
          padding: '4px 12px',
          background: 'var(--color-bg-1)',
          border: '1px solid var(--color-border-2)',
          borderRadius: '6px',
          fontFamily: 'monospace',
          fontSize: '14px',
        }}
      >
        Space
      </kbd>
      <Typography.Text type="secondary" style={{ fontSize: '14px' }}>
        或
      </Typography.Text>
      <kbd
        style={{
          padding: '4px 12px',
          background: 'var(--color-bg-1)',
          border: '1px solid var(--color-border-2)',
          borderRadius: '6px',
          fontFamily: 'monospace',
          fontSize: '14px',
        }}
      >
        Enter
      </kbd>
      <Typography.Text type="secondary" style={{ fontSize: '14px' }}>
        揭晓答案
      </Typography.Text>
    </div>
  );
}
