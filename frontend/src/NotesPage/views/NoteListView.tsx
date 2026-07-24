import { useState, useCallback, useMemo } from 'react';
import { Button, Tag, Message, Modal } from '@arco-design/web-react';
import { IconPlus, IconDelete, IconClose, IconCheckSquare } from '@arco-design/web-react/icon';
import type { Note, Folder } from '../types';
import { NoteCard, FolderTab, AddCard } from '../components';
import { PRIMARY_COLOR, UNIFIED_BTN_STYLE } from '../constants';
import { api } from '../../api';
import { PageLayout } from '../../components';
import i18n from '../../i18n';

interface NoteListViewProps {
  folders: Folder[];
  allTags: string[];
  notes: Note[];
  activeFolder: string;
  totalWords: number;
  todayNotes: number;
  isLoading: boolean;
  onFolderChange: (folder: string) => void;
  onNoteClick: (note: Note) => void;
  onCreateClick: () => void;
  onNotesDeleted: () => void;
}

export const NoteListView = ({
  folders,
  allTags,
  notes,
  activeFolder,
  totalWords,
  todayNotes,
  isLoading,
  onFolderChange,
  onNoteClick,
  onCreateClick,
  onNotesDeleted,
}: NoteListViewProps) => {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const cancelSelect = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    const allIds = new Set(notes.map(note => note.id));
    setSelectedIds(allIds);
  }, [notes]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected = useMemo(() => {
    return notes.length > 0 && selectedIds.size === notes.length;
  }, [notes, selectedIds]);

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      deselectAll();
    } else {
      selectAll();
    }
  }, [isAllSelected, selectAll, deselectAll]);

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    Modal.confirm({
      title: i18n.t('noteList.batchDeleteTitle'),
      content: i18n.t('noteList.batchDeleteContent', { count: selectedIds.size }),
      onOk: async () => {
        try {
          const res = await api.batchDeleteNotes([...selectedIds]);
          Message.success(i18n.t('noteList.batchDeleteSuccess', { count: res.deleted }));
          setSelectedIds(new Set());
          setSelecting(false);
          onNotesDeleted();
        } catch {
          Message.error(i18n.t('noteList.batchDeleteFailed'));
        }
      },
    });
  }, [selectedIds, onNotesDeleted]);

  const actions = (
    <>
      <Button
        onClick={() => setSelecting(true)}
        style={UNIFIED_BTN_STYLE}
      >
        {i18n.t('noteList.batchSelect')}
      </Button>
      <Button
        type='primary'
        icon={<IconPlus />}
        onClick={onCreateClick}
        style={{ ...UNIFIED_BTN_STYLE, backgroundColor: PRIMARY_COLOR }}
      >
        {i18n.t('noteList.newNote')}
      </Button>
    </>
  );

  const pageStats = [
    { label: i18n.t('noteList.noteCount'), value: notes.length },
    { label: i18n.t('noteList.totalWords'), value: totalWords > 1000 ? `${(totalWords / 1000).toFixed(1)}k` : totalWords },
    { label: i18n.t('noteList.todayUpdated'), value: todayNotes },
    { label: i18n.t('noteList.tags'), value: allTags.length },
  ];

  return (
    <PageLayout
      title={i18n.t('noteList.title')}
      pageKey='notes'
      actions={selecting ? (
        <>
          <Button
            icon={isAllSelected ? <IconCheckSquare /> : undefined}
            onClick={toggleSelectAll}
            style={UNIFIED_BTN_STYLE}
          >
            {isAllSelected ? i18n.t('noteList.deselectAll') : i18n.t('noteList.selectAll')}
          </Button>
          <Button
            type='primary'
            status='danger'
            icon={<IconDelete />}
            onClick={handleBatchDelete}
            disabled={selectedIds.size === 0}
            style={{ ...UNIFIED_BTN_STYLE }}
          >
            {i18n.t('noteList.deleteSelected', { count: selectedIds.size })}
          </Button>
          <Button
            icon={<IconClose />}
            onClick={cancelSelect}
            style={UNIFIED_BTN_STYLE}
          >
            {i18n.t('common.cancel')}
          </Button>
        </>
      ) : actions}
      stats={pageStats}
      statsLoading={isLoading}
    >
      {/* 文件夹标签 */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '32px',
        overflowX: 'auto',
        paddingBottom: '4px',
      }}>
        {folders.map(({ name, count }) => (
          <FolderTab
            key={name}
            folder={name}
            count={count}
            isActive={activeFolder === name}
            onClick={() => onFolderChange(name)}
          />
        ))}
      </div>

      {/* 标签筛选 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', flexWrap: 'wrap' }}>
        {allTags.map(tag => (
          <Tag key={tag} color='arcoblue' style={{ cursor: 'pointer' }}>
            {tag}
          </Tag>
        ))}
      </div>

      {/* 笔记卡片网格 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {notes.map(note => (
          <NoteCard
            key={note.id}
            note={note}
            onClick={() => onNoteClick(note)}
            selectable={selecting}
            selected={selectedIds.has(note.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
        <AddCard onClick={onCreateClick} />
      </div>
    </PageLayout>
  );
};
