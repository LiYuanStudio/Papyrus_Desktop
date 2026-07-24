import { Typography, Button, Empty } from '@arco-design/web-react';
import { PRIMARY_COLOR, SUCCESS_COLOR, DANGER_COLOR } from './constants';
import type { StudyStats } from './constants';

interface EmptyOrCompleteProps {
  stats: StudyStats;
  onReset: () => void;
  onExit: () => void;
}

export function EmptyOrComplete({
  stats,
  onReset,
  onExit,
}: EmptyOrCompleteProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '48px',
      }}
    >
      <Empty
        icon={<div style={{ fontSize: '64px' }}>🎉</div>}
        description={
          <div style={{ textAlign: 'center' }}>
            <Typography.Title
              heading={3}
              style={{ marginBottom: '8px', fontWeight: 200, fontSize: '16px' }}
            >
              今日复习完成！
            </Typography.Title>
            <Typography.Text type="secondary">
              没有待复习的卡片了，明天再来吧
            </Typography.Text>
          </div>
        }
      />

      {stats.studied > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '32px',
            padding: '24px 48px',
            background: 'var(--color-fill-2)',
            borderRadius: 'var(--radius-lg)',
            marginTop: '16px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <Typography.Text
              style={{ fontSize: '24px', fontWeight: 600, color: PRIMARY_COLOR }}
            >
              {stats.studied}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>
              已复习
            </Typography.Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Typography.Text
              style={{ fontSize: '24px', fontWeight: 600, color: SUCCESS_COLOR }}
            >
              {stats.mastered}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>
              已掌握
            </Typography.Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Typography.Text
              style={{ fontSize: '24px', fontWeight: 600, color: DANGER_COLOR }}
            >
              {stats.forgotten}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>
              需加强
            </Typography.Text>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: '16px',
          padding: '16px 24px',
          background: 'var(--color-fill-2)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <Button
          type="primary"
          onClick={() => {
            onReset();
          }}
        >
          重新开始
        </Button>
      </div>

      <Button
        type="primary"
        size="large"
        onClick={onExit}
        style={{
          marginTop: '8px',
          // 圆角统一走 token;背景 PRIMARY_COLOR 本身已是 var(--color-primary)
          borderRadius: 'var(--radius-xl)',
          padding: '0 32px',
          backgroundColor: PRIMARY_COLOR,
        }}
      >
        返回卷轴列表
      </Button>
    </div>
  );
}
