import { useState } from 'react';
import { Typography, Checkbox } from '@arco-design/web-react';
import { IconFolder } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import type { Note } from '../types';
import { PRIMARY_COLOR } from '../constants';

function formatTimestamp(timestamp: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  const now = new Date();
  const date = new Date(timestamp * 1000);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t('notesPage.today');
  if (diffDays === 1) return t('notesPage.yesterday');
  if (diffDays < 7) return t('notesPage.daysAgo', { count: diffDays });
  if (diffDays < 30) return t('notesPage.weeksAgo', { count: Math.floor(diffDays / 7) });
  return t('notesPage.monthsAgo', { count: Math.floor(diffDays / 30) });
}

interface NoteCardProps {
  note: Note;
  onClick: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export const NoteCard = ({ note, onClick, selectable, selected, onToggleSelect }: NoteCardProps) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  // 卡片视觉: 发丝边框 + 分层阴影 + hover 轻抬升,选中态用 primary-light 实底。
  // 修复: 原 `${PRIMARY_COLOR}10` 会拼出 "var(--color-primary)10" 无效 CSS,选中背景静默失效;
  // 未用 color-mix(): 项目已有 --color-primary-light 语义 token,浅色 8%/深色 20% 透明度,直接用更一致。
  const cardStyle = {
    borderRadius: 'var(--radius-lg)',
    border: `1px solid ${selected ? PRIMARY_COLOR : hovered ? PRIMARY_COLOR : 'var(--color-border-hairline)'}`,
    background: selected ? 'var(--color-primary-light)' : 'var(--color-bg-1)',
    boxShadow: selected || hovered ? 'var(--shadow-2)' : 'var(--shadow-1)',
    transform: hovered ? 'translateY(-2px)' : 'none',
    transition: 'border-color var(--duration-normal) var(--ease-standard), background var(--duration-normal) var(--ease-standard), box-shadow var(--duration-normal) var(--ease-standard), transform var(--duration-normal) var(--ease-standard)',
    cursor: 'pointer',
    height: '200px',
    boxSizing: 'border-box' as const,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={selectable ? () => onToggleSelect?.(note.id) : onClick}
      style={cardStyle}
    >
      {selectable && (
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 1 }} onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onChange={() => onToggleSelect?.(note.id)}
          />
        </div>
      )}
      {/* 头部：文件夹和时间 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '16px' 
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          background: 'var(--color-fill-2)',
          color: 'var(--color-text-3)',
          borderRadius: '999px',
          padding: '2px 10px',
          fontSize: '11px',
        }}>
          <IconFolder style={{ fontSize: '10px' }} />
          {note.folder}
        </div>
        <Typography.Text type='secondary' style={{ fontSize: '12px' }}>
          {formatTimestamp(note.updatedAtTimestamp, t)}
        </Typography.Text>
      </div>

      {/* 标题 */}
      <Typography.Text bold style={{ fontSize: '16px', lineHeight: 1.4, marginBottom: '8px' }}>
        {note.title}
      </Typography.Text>

      {/* 预览 */}
      <Typography.Paragraph
        type='secondary'
        style={{ fontSize: '13px', lineHeight: '1.6', margin: 0, flex: 1 }}
        ellipsis={{ rows: 3 }}
      >
        {note.preview}
      </Typography.Paragraph>

      {/* 底部：字数 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end',
        alignItems: 'center', 
        marginTop: '16px' 
      }}>
        <Typography.Text type='secondary' style={{ fontSize: '12px' }}>
          {note.wordCount} {t('common.wordsUnit')}
        </Typography.Text>
      </div>
    </div>
  );
};
