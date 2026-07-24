import { Typography } from '@arco-design/web-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Note } from '../api';
import { useCommonCardStyle, CommonCard, CardGroup } from '../components';
import { addRecentItem } from '../utils/recentFiles';

interface NoteCardProps {
  note: {
    id: string;
    title: string;
    preview: string;
    lastUsed: string;
  };
  onClick?: () => void;
}

const NoteCard = ({ note, onClick }: NoteCardProps) => {
  const { hovered, setHovered, cardStyle, width, height } = useCommonCardStyle({
    borderWidth: 2,
  });

  return (
    <CommonCard
      hovered={hovered}
      setHovered={setHovered}
      cardStyle={cardStyle}
      width={width}
      height={height}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${note.title} - ${note.lastUsed}`}
      style={{
        flex: '0 0 auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        minHeight: '140px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflow: 'hidden' }}>
        <Typography.Text bold style={{ fontSize: 'var(--font-size-md)', lineHeight: 1.3 }}>
          {note.title}
        </Typography.Text>
        <Typography.Text type='secondary' style={{ 
          fontSize: 'var(--font-size-xs)',
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {note.preview}
        </Typography.Text>
      </div>

      <Typography.Text type='secondary' style={{ fontSize: 'var(--font-size-xs)', marginTop: '8px' }}>
        {note.lastUsed}
      </Typography.Text>
    </CommonCard>
  );
};

interface RecentNotesProps {
  height: number;
  onNavigate?: (noteId: string) => void;
}

// 辅助函数：时间戳转换为相对时间字符串
function formatTimestamp(timestamp: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  const now = new Date();
  const date = new Date(timestamp * 1000);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t('startPage.today');
  if (diffDays === 1) return t('startPage.yesterday');
  if (diffDays < 7) return t('startPage.daysAgo', { count: diffDays });
  if (diffDays < 30) return t('startPage.weeksAgo', { count: Math.floor(diffDays / 7) });
  return t('startPage.monthsAgo', { count: Math.floor(diffDays / 30) });
}

const RecentNotes = ({ height, onNavigate }: RecentNotesProps) => {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        setLoading(true);
        const response = await api.listNotes();
        if (response.success) {
          // 取最近4条笔记，按更新时间排序
          const sortedNotes = response.notes
            .sort((a, b) => b.updated_at - a.updated_at)
            .slice(0, 4);
          setNotes(sortedNotes);
        }
      } catch (err) {
        console.error(t('startPage.fetchNotesFailed'), err);
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();

    const handleNotesChanged = () => {
      fetchNotes();
    };
    window.addEventListener('papyrus_notes_changed', handleNotesChanged);
    window.addEventListener('papyrus_new_note', handleNotesChanged);
    return () => {
      window.removeEventListener('papyrus_notes_changed', handleNotesChanged);
      window.removeEventListener('papyrus_new_note', handleNotesChanged);
    };
  }, []);

  return (
    <CardGroup
      height={height}
      loading={loading}
      emptyText={t('startPage.noNotes')}
    >
      {notes.map(n => (
        <NoteCard
          key={n.id}
          note={{
            id: n.id,
            title: n.title,
            preview: n.preview,
            lastUsed: formatTimestamp(n.updated_at, t),
          }}
          onClick={() => {
            addRecentItem({ id: n.id, type: 'note', title: n.title });
            onNavigate?.(n.id);
          }}
        />
      ))}
    </CardGroup>
  );
};

export default RecentNotes;
