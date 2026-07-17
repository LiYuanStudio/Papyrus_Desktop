import { useState, useCallback, useMemo, useEffect } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { NoteListView } from './views/NoteListView';
import { NoteDetailView } from './views/NoteDetailView';
import { FileTree } from './components/FileTree';
import { useNotes } from './useNotes';
import { PRIMARY_COLOR } from '../theme-constants';
import { addRecentItem } from '../utils/recentFiles';

import type { Note } from './types';

type ViewMode = 'list' | 'detail';
type AnimationDirection = 'in' | 'out';

type NotesPageProps = {
  initialNoteId?: string;
  onInitialNoteIdUsed?: () => void;
};

const NotesPage = ({ initialNoteId, onInitialNoteIdUsed }: NotesPageProps) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<AnimationDirection>('in');

  const {
    notes,
    folders,
    allTags,
    filteredNotes,
    activeFolder,
    totalWords,
    todayNotes,
    isLoading,
    setActiveFolder,
    saveNote,
    deleteNote,
    refreshNotes,
  } = useNotes();

  

  // 获取所有文件夹名称
  const allFolders = useMemo(() => 
    folders.filter(f => f.name !== '__all_notes__').map(f => f.name),
    [folders, t]
  );

  const handleNoteClick = useCallback((note: Note) => {
    addRecentItem({ id: note.id, type: 'note', title: note.title });
    setAnimationDirection('in');
    setSelectedNote(note);
    setIsCreateMode(false);
    setViewMode('detail');
  }, []);

  useEffect(() => {
    if (initialNoteId && !isLoading && notes.length > 0) {
      const note = notes.find(n => n.id === initialNoteId);
      if (note) {
        handleNoteClick(note);
        onInitialNoteIdUsed?.();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNoteId, isLoading, notes]);

  const handleCreateClick = useCallback(() => {
    setAnimationDirection('in');
    setSelectedNote(null);
    setIsCreateMode(true);
    setViewMode('detail');
  }, []);

  const handleCreateInFolder = useCallback((folder: string) => {
    setAnimationDirection('in');
    setSelectedNote({
      id: 'temp',
      title: '',
      folder,
      preview: '',
      tags: [],
      updatedAtTimestamp: Math.floor(Date.now() / 1000),
      wordCount: 0,
      content: '',
    });
    setIsCreateMode(true);
    setViewMode('detail');
  }, []);

  const handleBack = useCallback(() => {
    setAnimationDirection('out');
    setTimeout(() => {
      setAnimationDirection('in');
      setViewMode('list');
      setSelectedNote(null);
      setIsCreateMode(false);
    }, 150);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteNote(id);
      setAnimationDirection('out');
      setTimeout(() => {
        setAnimationDirection('in');
        setViewMode('list');
      }, 150);
      Message.success(t('notesPage.deleteSuccess'));
    } catch (err) {
      Message.error(err instanceof Error ? err.message : t('notesPage.deleteFailed'));
    }
  }, [deleteNote, t]);

  // 监听全局新建笔记事件（来自 TitleBar）
  useEffect(() => {
    const handleGlobalNewNote = () => {
      handleCreateClick();
    };
    window.addEventListener('papyrus_new_note', handleGlobalNewNote);
    return () => window.removeEventListener('papyrus_new_note', handleGlobalNewNote);
  }, [handleCreateClick]);

  const handleSave = useCallback(async (
    params: Parameters<typeof saveNote>[0],
    isCreate: Parameters<typeof saveNote>[1],
    shouldReturnToList = true
  ) => {
    const result = await saveNote(params, isCreate);
    if (result) {
      setSelectedNote(result);
    }
    if (shouldReturnToList) {
      setAnimationDirection('out');
      setTimeout(() => {
        setAnimationDirection('in');
        setViewMode('list');
      }, 150);
    }
    return result;
  }, [saveNote]);

  // 侧边栏拖拽调整
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(180, Math.min(400, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [sidebarWidth]);

  return (
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      overflow: 'hidden',
      position: 'relative',
      // 页面工作区底色走画布 token,让 bg-1 面板/卡片自然浮出
      background: 'var(--color-bg-canvas)',
    }}>
      {/* 文件树侧边栏 - 只在详情模式显示 */}
      <div
        style={{
          display: 'flex',
          overflow: 'hidden',
          transition: 'width var(--duration-normal) var(--ease-standard)',
          width: viewMode === 'detail' ? sidebarWidth + 4 : 0,
        }}
      >
        {viewMode === 'detail' && (
          <>
            <FileTree
              notes={notes}
              selectedNoteId={selectedNote?.id || null}
              onSelectNote={handleNoteClick}
              onCreateNote={handleCreateInFolder}
              width={sidebarWidth}
            />
            <div
              onMouseDown={handleMouseDown}
              style={{
                width: '4px',
                cursor: isResizing ? 'col-resize' : 'ew-resize',
                background: isResizing ? PRIMARY_COLOR : 'transparent',
                transition: 'background var(--duration-fast) var(--ease-standard)',
              }}
              onMouseEnter={(e) => {
                if (!isResizing) e.currentTarget.style.background = 'var(--color-border-2)';
              }}
              onMouseLeave={(e) => {
                if (!isResizing) e.currentTarget.style.background = 'transparent';
              }}
            />
          </>
        )}
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {viewMode === 'list' && (
          <div
            style={{
              flex: 1,
              opacity: animationDirection === 'out' ? 0 : 1,
              transform: animationDirection === 'out' ? 'translateX(20px)' : 'translateX(0)',
              transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
            }}
          >
            <NoteListView
              folders={folders}
              allTags={allTags}
              notes={filteredNotes}
              activeFolder={activeFolder}
              totalWords={totalWords}
              todayNotes={todayNotes}
              isLoading={isLoading}
              onFolderChange={setActiveFolder}
              onNoteClick={handleNoteClick}
              onCreateClick={handleCreateClick}
              onNotesDeleted={refreshNotes}
            />
          </div>
        )}
        {viewMode === 'detail' && (
          <div
            style={{
              flex: 1,
              opacity: animationDirection === 'in' ? 1 : 0,
              transform: animationDirection === 'in' ? 'translateX(0)' : 'translateX(-20px)',
              transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
            }}
          >
            <NoteDetailView
              note={selectedNote}
              isCreateMode={isCreateMode}
              allFolders={allFolders}
              onBack={handleBack}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesPage;
