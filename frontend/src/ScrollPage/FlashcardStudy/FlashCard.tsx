import { Typography } from '@arco-design/web-react';
import type { Card } from '../../api';
import type { StudyState } from './constants';

interface FlashCardProps {
  card: Card | null;
  studyState: StudyState;
  onReveal: () => void;
}

export function FlashCard({ card, studyState, onReveal }: FlashCardProps) {
  return (
    <div
      onClick={onReveal}
      style={{
        width: '100%',
        maxWidth: '720px',
        minHeight: '320px',
        maxHeight: '480px',
        // 卡片统一语言: hairline 边框 + radius-xl + shadow-2(主视觉卡,抬升感强于普通卡)
        background: 'var(--color-bg-1)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border-hairline)',
        boxShadow: 'var(--shadow-2)',
        padding: '48px',
        display: 'flex',
        flexDirection: 'column',
        cursor: studyState === 'question' ? 'pointer' : 'default',
        transition: 'transform var(--duration-normal) var(--ease-standard), box-shadow var(--duration-normal) var(--ease-standard)',
        position: 'relative',
        overflow: 'auto',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography.Text
          type="secondary"
          style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '16px',
          }}
        >
          卷首 · 问题
        </Typography.Text>
        <Typography.Paragraph
          style={{
            fontSize: '22px',
            lineHeight: 1.6,
            margin: 0,
            whiteSpace: 'pre-wrap',
            color: 'var(--color-text-1)',
          }}
        >
          {card?.q}
        </Typography.Paragraph>
      </div>

      <div
        style={{
          height: '1px',
          background: 'var(--color-border-3)',
          margin: '32px 0',
          transition: 'opacity 0.3s',
          opacity: studyState === 'answer' ? 1 : 0.3,
        }}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          opacity: studyState === 'answer' ? 1 : 0,
          transition: 'opacity 0.3s',
        }}
      >
        <Typography.Text
          type="secondary"
          style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '16px',
          }}
        >
          卷尾 · 答案
        </Typography.Text>
        <Typography.Paragraph
          style={{
            fontSize: '20px',
            lineHeight: 1.6,
            margin: 0,
            // 硬编码品牌蓝换成语义 token,深色模式自动适配
            color: 'var(--color-primary)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {card?.a}
        </Typography.Paragraph>
      </div>

      {studyState === 'question' && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: 'var(--color-fill-2)',
            borderRadius: '20px',
          }}
        >
          <Typography.Text style={{ fontSize: '16px', color: 'var(--color-text-1)' }}>
            ␣
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: '14px' }}>
            按空格或回车揭晓答案
          </Typography.Text>
        </div>
      )}
    </div>
  );
}
