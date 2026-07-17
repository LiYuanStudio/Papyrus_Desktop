import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Typography, Input, Tag, Button, Breadcrumb, Message, Modal, Dropdown } from '@arco-design/web-react';
import SmartTextArea, { type SmartTextAreaRef } from '../../components/SmartTextArea';
import { useTranslation } from 'react-i18next';
const BreadcrumbItem = Breadcrumb.Item;
import {
  IconLeft,
  IconDelete,
  IconFolder,
  IconHistory,
  IconTags,
  IconPlus,
  IconH1,
  IconH2,
  IconH3,
  IconLink,
  IconMindMapping,
} from '@arco-design/web-react/icon';
import { RelationsPanel, RelationGraph } from '../components/Relations';
import type { Note, CreateNoteParams, UpdateNoteParams } from '../types';
import { renderMarkdown } from '../../utils/markdown';

interface NoteDetailViewProps {
  note: Note | null;
  isCreateMode: boolean;
  allFolders: string[];
  onBack: () => void;
  onSave: (params: UpdateNoteParams | CreateNoteParams, isCreate: boolean, shouldReturnToList?: boolean) => Promise<{ id: string } | undefined>;
  onDelete?: (id: string) => void;
}

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

export const NoteDetailView = ({
  note,
  isCreateMode: initialIsCreateMode,
  allFolders,
  onBack,
  onSave,
  onDelete,
}: NoteDetailViewProps) => {
  const { t } = useTranslation();
  // 表单状态
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [folder, setFolder] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  // 关联功能状态
  const [showRelationsPanel, setShowRelationsPanel] = useState(false);
  const [showGraphDrawer, setShowGraphDrawer] = useState(false);
  
  // SmartTextArea ref
  const textAreaRef = useRef<SmartTextAreaRef>(null);

  // 脏状态跟踪与防抖自动保存
  const isDirty = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 创建模式状态和已创建笔记的 ID（用于创建后的自动保存）
  const [isCreateMode, setIsCreateMode] = useState(initialIsCreateMode);
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
  const latestStateRef = useRef({
    title: '',
    content: '',
    folder: '',
    tags: [] as string[],
    noteId: undefined as string | undefined,
    createdNoteId: null as string | null,
    isCreateMode: initialIsCreateMode,
  });

  // 插入标题
  const insertHeading = (level: number) => {
    const heading = '#'.repeat(level) + ' ';
    textAreaRef.current?.insertAtCursor(heading);
  };
  
  // 下拉菜单项
  const headingMenuItems = [
    { key: 'h1', label: t('noteDetail.heading1'), icon: <IconH1 />, onClick: () => insertHeading(1) },
    { key: 'h2', label: t('noteDetail.heading2'), icon: <IconH2 />, onClick: () => insertHeading(2) },
    { key: 'h3', label: t('noteDetail.heading3'), icon: <IconH3 />, onClick: () => insertHeading(3) },
  ];

  // 锁定状态 - 监听全局编辑锁定
  const [isGloballyLocked, setIsGloballyLocked] = useState(false);
  
  useEffect(() => {
    const handleLockChange = (e: CustomEvent<{ locked: boolean }>) => {
      const newLockedState = e.detail.locked;
      setIsGloballyLocked(newLockedState);
      // 如果全局锁定且当前可编辑（非创建模式），自动保存
      if (newLockedState && !latestStateRef.current.isCreateMode) {
        void handleSave(false);
      }
    };

    window.addEventListener('papyrus_edit_lock_changed', handleLockChange as EventListener);
    return () => window.removeEventListener('papyrus_edit_lock_changed', handleLockChange as EventListener);
  }, []);

  // 初始化表单 - 编辑模式（只在 note.id 变化时执行，避免父组件重新渲染覆盖用户输入）
  useEffect(() => {
    if (note?.id) {
      setTitle(note.title);
      setContent(note.content ?? note.preview ?? '');
      setFolder(note.folder);
      setTags(note.tags ?? []);
      isDirty.current = false;
    }
  }, [note?.id]);

  // 创建模式初始化 - 只在进入创建模式时执行
  useEffect(() => {
    if (isCreateMode && !note) {
      setContent('');
      setFolder(allFolders[0] || t('noteDetail.defaultFolderName'));
      setTags([]);
      isDirty.current = false;
    }
  }, [isCreateMode, allFolders, note]);

  // 输入变化时标记脏状态
  useEffect(() => {
    isDirty.current = true;
  }, [title, content, folder, tags]);

  useEffect(() => {
    latestStateRef.current = {
      title,
      content,
      folder,
      tags,
      noteId: note?.id,
      createdNoteId,
      isCreateMode,
    };
  }, [content, createdNoteId, folder, isCreateMode, note?.id, tags, title]);

  const handleSave = useCallback(async (showMessage = true, shouldReturnToList = true) => {
    const latest = latestStateRef.current;
    if (!latest.title.trim()) {
      Message.warning(t('noteDetail.enterTitle'));
      return false;
    }

    try {
      if (latest.isCreateMode) {
        // 创建新笔记
        const createdNote = await onSave({
          title: latest.title.trim(),
          folder: latest.folder.trim() || t('noteDetail.defaultFolderName'),
          content: latest.content.trim(),
          tags: latest.tags,
        }, true, shouldReturnToList);
        // 创建成功后，切换到编辑模式并记录笔记 ID
        if (createdNote?.id) {
          setCreatedNoteId(createdNote.id);
          setIsCreateMode(false);
          latestStateRef.current.createdNoteId = createdNote.id;
          latestStateRef.current.isCreateMode = false;
        }
      } else {
        // 更新已存在的笔记（可能是创建后继续编辑，或直接编辑现有笔记）
        const targetNoteId = latest.createdNoteId || latest.noteId;
        if (targetNoteId) {
          await onSave({
            id: targetNoteId,
            title: latest.title.trim(),
            folder: latest.folder.trim(),
            content: latest.content.trim(),
            tags: latest.tags,
          }, false, shouldReturnToList);
        }
      }
      if (showMessage) {
        Message.success(t('noteDetail.saveSuccess'));
      }
      isDirty.current = false;
      return true;
    } catch (err) {
      Message.error(err instanceof Error ? err.message : t('noteDetail.saveFailed'));
      return false;
    }
  }, [onSave]);

  // 编辑状态由全局锁定和创建模式推导：创建模式始终可编辑，否则由全局锁定控制
  const isEditable = isCreateMode || !isGloballyLocked;

  // 防抖自动保存（2秒无输入后触发）
  useEffect(() => {
    if (!isEditable || !title.trim()) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (isDirty.current) {
        void handleSave(false, false);
        isDirty.current = false;
      }
    }, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [title, content, folder, tags, isEditable]);

  // 组件卸载时如有未保存内容则自动保存
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (isDirty.current && title.trim()) {
        void handleSave(false, false);
      }
    };
  }, []);

  // 返回时自动保存
  const handleBackWithSave = async () => {
    if (isEditable && title.trim()) {
      const success = await handleSave(false, true);
      if (!success) return;
    }
    onBack();
  };

  const handleDelete = () => {
    if (note && onDelete) {
      Modal.confirm({
        title: t('noteDetail.confirmDeleteTitle'),
        content: t('noteDetail.confirmDeleteContent', { title: note.title }),
        onOk: async () => {
          try {
            await onDelete(note.id);
            Message.success(t('noteDetail.deleteSuccess'));
          } catch {
            Message.error(t('noteDetail.deleteFailed'));
          }
        },
      });
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  // 内容区域 ref
  const contentRef = useRef<HTMLDivElement>(null);
  
  // 生成大纲，并记录每个标题的行索引
  const generateOutline = (text: string) => {
    const lines = text.split('\n');
    const outline: { level: number; title: string; lineIndex: number }[] = [];
    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,3})\s+(.+)/);
      if (match) {
        outline.push({
          level: match[1].length,
          title: match[2],
          lineIndex: index,
        });
      }
    });
    return outline;
  };
  
  // 点击大纲跳转到对应位置
  const scrollToHeading = (lineIndex: number) => {
    if (!contentRef.current) return;
    
    // 在预览模式下，通过计算行高来估算位置
    const lineHeight = 27; // 15px font-size * 1.8 line-height
    const paddingTop = 32; // 内容区 padding-top
    const metaHeight = 80; // 元信息区域高度估算
    const targetScrollTop = paddingTop + metaHeight + (lineIndex * lineHeight);
    
    contentRef.current.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth',
    });
  };

  const outline = generateOutline(content);

  // 触发字数统计事件
  useEffect(() => {
    const chars = content.length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const headings = outline.length;
    
    window.dispatchEvent(new CustomEvent('papyrus_note_stats', {
      detail: { chars, words, headings }
    }));
  }, [content, outline]);

  // 组件卸载时清空统计
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('papyrus_note_stats', {
        detail: { chars: 0, words: 0, headings: 0 }
      }));
    };
  }, []);

  // 渲染 Markdown 内容为 HTML
  const renderedContent = useMemo(() => {
    return renderMarkdown(content);
  }, [content]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部栏：面包屑居中 */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--color-border-2)',
          background: 'var(--color-bg-1)',
          display: 'flex',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        {/* 返回按钮 - 左侧 */}
        <Button
          type='text'
          icon={<IconLeft />}
          onClick={handleBackWithSave}
        >
          {t('noteDetail.back')}
        </Button>

        {/* 面包屑 - 居中 */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <Breadcrumb>
            <BreadcrumbItem
              key="notebook"
              style={{ cursor: 'pointer' }}
              onClick={handleBackWithSave}
            >
              {t('noteDetail.notebook')}
            </BreadcrumbItem>
            <BreadcrumbItem key="folder">{folder || note?.folder || t('noteDetail.defaultFolder')}</BreadcrumbItem>
            <BreadcrumbItem key="title">{title || note?.title || t('noteDetail.newNote')}</BreadcrumbItem>
          </Breadcrumb>
        </div>

        {/* 右侧操作按钮 */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {(isEditable) && (
            <>
              <Dropdown droplist={
                <div style={{ 
                  background: 'var(--color-bg-1)', 
                  // 弹层统一语言: 发丝边框 + 圆角阶梯 + shadow-3;overflow 裁掉菜单项 hover 背景的直角溢出
                  border: '1px solid var(--color-border-hairline)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-3)',
                  overflow: 'hidden',
                }}>
                  {headingMenuItems.map(item => (
                    <div
                      key={item.key}
                      onClick={item.onClick}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: 'var(--color-text-1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        // hover 背景为 JS 切换,补短过渡避免生硬
                        transition: 'background var(--duration-fast) var(--ease-standard)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-fill-2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </div>
                  ))}
                </div>
              } position='bottom'>
                <Button type='secondary' icon={<IconPlus />} />
              </Dropdown>
              {!isCreateMode && onDelete && (
                <Button
                  type='text'
                  status='danger'
                  icon={<IconDelete />}
                  onClick={handleDelete}
                />
              )}
            </>
          )}

          {!isCreateMode && (
            <>
              <Button
                type={showRelationsPanel ? 'primary' : 'secondary'}
                icon={<IconLink />}
                onClick={() => setShowRelationsPanel(!showRelationsPanel)}
              >
                {t('noteDetail.relations')}
              </Button>
              <Button
                type='secondary'
                icon={<IconMindMapping />}
                onClick={() => setShowGraphDrawer(true)}
              >
                {t('noteDetail.graph')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左侧：大纲导航 */}
        <div
          style={{
            width: '200px',
            borderRight: '1px solid var(--color-border-2)',
            background: 'var(--color-bg-1)',
            padding: '16px',
            overflowY: 'auto',
          }}
        >
          <Typography.Text
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--color-text-2)',
              display: 'block',
              marginBottom: '16px',
            }}
          >
            {t('noteDetail.outline')}
          </Typography.Text>
          {outline.length > 0 ? (
            outline.map((item, index) => (
              <div
                key={index}
                onClick={() => scrollToHeading(item.lineIndex)}
                style={{
                  padding: '4px 8px',
                  paddingLeft: `${(item.level - 1) * 16 + 8}px`,
                  fontSize: '13px',
                  color: 'var(--color-text-2)',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  // hover 背景为 JS 切换,补短过渡避免生硬
                  transition: 'background var(--duration-fast) var(--ease-standard)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-fill-2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {item.title}
              </div>
            ))
          ) : (
            <Typography.Text type='secondary' style={{ fontSize: '12px' }}>
              {t('noteDetail.outlineHint')}
            </Typography.Text>
          )}
        </div>

        {/* 右侧：编辑/预览区 */}
        <div
          ref={contentRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '32px 48px',
            background: 'var(--color-bg-1)',
          }}
        >
          {/* 元信息区 */}
          <div
            style={{
              padding: '16px',
              background: 'var(--color-fill-2)',
              // 圆角并入 sm/md 阶梯;边框由 border-2 换发丝色,弱化填充面板的边界感
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-hairline)',
              marginBottom: '24px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              alignItems: 'center',
            }}
          >
            {isEditable ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconFolder style={{ fontSize: '14px', color: 'var(--color-text-2)' }} />
                  <Input
                    value={folder}
                    onChange={setFolder}
                    style={{ width: '120px' }}
                    size='small'
                    className='notes-meta-input'
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <IconTags style={{ fontSize: '14px', color: 'var(--color-text-2)' }} />
                  {tags.map(tag => (
                    <Tag
                      key={tag}
                      size='small'
                      color='arcoblue'
                      closable
                      onClose={() => handleRemoveTag(tag)}
                    >
                      {tag}
                    </Tag>
                  ))}
                  <Input
                    value={newTag}
                    onChange={setNewTag}
                    onPressEnter={handleAddTag}
                    onBlur={() => { if (newTag.trim()) handleAddTag(); }}
                    placeholder={t('noteDetail.tagPlaceholder')}
                    style={{ width: '80px' }}
                    size='small'
                    className='notes-meta-input'
                  />
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <IconFolder style={{ fontSize: '14px' }} />
                  {note?.folder}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <IconHistory style={{ fontSize: '14px' }} />
                  {note ? formatTimestamp(note.updatedAtTimestamp, t) : ''}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {note?.tags.map(tag => (
                    <Tag key={tag} size='small' color='arcoblue'>
                      {tag}
                    </Tag>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 标题 */}
          {isEditable ? (
            <Input
              className='no-border-input'
              value={title}
              onChange={setTitle}
              placeholder={t('noteDetail.titlePlaceholder')}
              style={{
                fontSize: '32px',
                fontWeight: 500,
                border: 'none',
                background: 'transparent',
                padding: 0,
                marginBottom: '24px',
              }}
            />
          ) : (
            <Typography.Title
              heading={2}
              style={{ marginBottom: '24px', fontSize: '28px', fontWeight: 400 }}
            >
              {note?.title}
            </Typography.Title>
          )}

          {/* 内容 - 编辑模式：显示 SmartTextArea，预览模式：显示渲染后的 Markdown */}
          {isEditable ? (
            <SmartTextArea
              className='no-border-textarea'
              ref={textAreaRef}
              value={content}
              onChange={setContent}
              placeholder={t('noteDetail.contentPlaceholder')}
              enableCompletion={true}
              autoSize={{ minRows: 20, maxRows: 100 }}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                fontSize: '15px',
                lineHeight: '1.8',
                resize: 'none',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <div
              className="markdown-preview chat-markdown"
              style={{
                fontSize: '15px',
                lineHeight: '1.8',
                color: 'var(--color-text-1)',
              }}
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          )}
        </div>

        {/* 关联面板 */}
        {showRelationsPanel && note && (
          <div
            style={{
              width: '320px',
              borderLeft: '1px solid var(--color-border-2)',
              background: 'var(--color-bg-1)',
            }}
          >
            <RelationsPanel
              noteId={note.id}
              onNavigateToNote={async (_targetId) => {
                // 保存当前笔记后跳转
                if (isEditable && title.trim()) {
                  const success = await handleSave(false);
                  if (!success) return;
                }
                onBack();
                // 这里可以添加跳转到目标笔记的逻辑
              }}
            />
          </div>
        )}
      </div>

      {/* 关联图谱弹窗 */}
      <Modal
        title={t('noteDetail.relationsGraph')}
        visible={showGraphDrawer}
        onCancel={() => setShowGraphDrawer(false)}
        footer={null}
        style={{ width: 800 }}
      >
        {note && (
          <div style={{ height: '500px' }}>
            <RelationGraph
              noteId={note.id}
              depth={1}
              onNodeClick={(_nodeId) => {
                setShowGraphDrawer(false);
                // 可以添加跳转到对应笔记的逻辑
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};
