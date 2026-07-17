import { Typography, Button, Tag, Radio, Empty, Tooltip, Message, Modal, Input, Breadcrumb } from '@arco-design/web-react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconFolderAdd, IconUpload, IconFolder, IconImage, IconFileVideo, IconMusic, IconFile, IconDownload, IconDelete } from '@arco-design/web-react/icon';
import { api, getFileUrl, getThumbnailUrl } from '../api';
import i18n from '../i18n';
import type { FileItemData } from '../api';
import { PageLayout } from '../components';
import { PRIMARY_COLOR } from '../theme-constants';
import { addRecentItem } from '../utils/recentFiles';
import { formatDateBySetting } from '../utils/dateFormat.js';

import ZipIcon from './ZipIcon';
import FilePreviewModal from './FilePreviewModal';
import './FilesPage.css';

// 文件图标
// 配色: 文件夹/视频/压缩包走语义 token(主色/危险/警告), 图片紫与音频青无对应 token,
// 保留 Arco 标准色板值(饱和度适中, 深色 bg-1=#1e1e22 下不刺眼)。
const FileTypeIcon = ({ type, size = 48 }: { type: string; size?: number }) => {
  const iconSize = size * 0.5;

  switch (type) {
    case 'folder':
      return <IconFolder style={{ fontSize: iconSize, color: 'var(--color-primary)' }} />;
    case 'image':
      return <IconImage style={{ fontSize: iconSize, color: '#722ED1' }} />;
    case 'video':
      return <IconFileVideo style={{ fontSize: iconSize, color: 'var(--color-danger)' }} />;
    case 'audio':
      return <IconMusic style={{ fontSize: iconSize, color: '#14C9C9' }} />;
    case 'archive':
      return <ZipIcon size={iconSize} color="var(--color-warning)" />;
    default:
      return <IconFile style={{ fontSize: iconSize, color: 'var(--color-text-3)' }} />;
  }
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number): string {
  return formatDateBySetting(timestamp);
}

// 网格文件卡片
const GridFileCard = ({ file, onClick, formatItemCount }: { file: FileItemData; onClick?: (f: FileItemData) => void; formatItemCount: (count: number) => string }) => {
  const isImage = file.type === 'image' && !file.is_folder;

  return (
    <Tooltip content={file.name} position='top'>
      <div
        className="files-grid-card"
        onClick={() => onClick?.(file)}
      >
        {isImage ? (
          <div className="files-grid-card-thumbnail-wrapper">
            <img
              src={getThumbnailUrl(file.id)}
              alt={file.name}
              className="files-grid-card-thumbnail"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="files-grid-card-icon-wrapper">
            <FileTypeIcon type={file.type} size={48} />
          </div>
        )}
        <div className="files-grid-card-name-wrapper">
          <Typography.Text className="files-grid-card-name" title={file.name}>
            {file.name}
          </Typography.Text>
          <Typography.Text type='secondary' className="files-grid-card-meta">
            {file.is_folder ? formatItemCount(file.itemCount ?? 0) : formatSize(file.size)} · {formatDate(file.updated_at)}
          </Typography.Text>
        </div>
      </div>
    </Tooltip>
  );
};

// 列表文件行
const ListFileRow = ({ file, onClick, onDownload, onDelete, formatItemCount }: { file: FileItemData; onClick?: (f: FileItemData) => void; onDownload?: (f: FileItemData) => void; onDelete?: (id: string) => void; formatItemCount: (count: number) => string }) => {
  return (
    <div
      className="files-list-row"
      onClick={() => onClick?.(file)}
    >
      <FileTypeIcon type={file.type} size={32} />
      <div className="files-list-name-wrapper">
        <Typography.Text className="files-list-name" title={file.name}>
          {file.name}
        </Typography.Text>
      </div>
      <Typography.Text type='secondary' className="files-list-size">
        {file.is_folder ? formatItemCount(file.itemCount ?? 0) : formatSize(file.size)}
      </Typography.Text>
      <Typography.Text type='secondary' className="files-list-date">
        {formatDate(file.updated_at)}
      </Typography.Text>
      <div className="files-list-actions">
        <IconDownload className="files-list-action-icon" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDownload?.(file); }} />
        <IconDelete className="files-list-action-icon" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete?.(file.id); }} />
      </div>
    </div>
  );
};

// 筛选标签映射
const FILTER_TAGS = ['all', 'folder', 'document', 'image', 'video', 'audio'] as const;
type FilterTag = typeof FILTER_TAGS[number];

const FILTER_MAP: Record<FilterTag, (f: FileItemData) => boolean> = {
  'all': () => true,
  'folder': (f) => Boolean(f.is_folder),
  'document': (f) => !f.is_folder && (f.type === 'document' || f.type === 'unknown'),
  'image': (f) => !f.is_folder && f.type === 'image',
  'video': (f) => !f.is_folder && f.type === 'video',
  'audio': (f) => !f.is_folder && f.type === 'audio',
};

interface FilesPageProps {
  initialFileId?: string;
  onInitialFileIdUsed?: () => void;
}



function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:...;base64," prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const FilesPage = ({ initialFileId, onInitialFileIdUsed }: FilesPageProps) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [allFiles, setAllFiles] = useState<FileItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [folderName, setFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 文件夹导航状态
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: t('filesPage.rootFolderName') ?? 'Files' }]);
  const [folderNavDirection, setFolderNavDirection] = useState<'forward' | 'backward'>('forward');

  // 筛选状态
  const [activeFilter, setActiveFilter] = useState<FilterTag>('all');

  // 筛选标签 i18n 显示名映射
  const filterLabels = useMemo<Record<FilterTag, string>>(() => ({
    all: t('filesPage.filterAll'),
    folder: t('filesPage.filterFolder'),
    document: t('filesPage.filterDocument'),
    image: t('filesPage.filterImage'),
    video: t('filesPage.filterVideo'),
    audio: t('filesPage.filterAudio'),
  }), [t]);

  // 预览弹窗状态
  const [previewFile, setPreviewFile] = useState<FileItemData | null>(null);

  useEffect(() => {
    api.listFiles()
      .then(res => setAllFiles(res.files))
      .catch(() => Message.error(t('filesPage.loadFailed')))
      .finally(() => setLoading(false));
  }, []);

  // 当前文件夹下的文件（按 parent_id 过滤）
  const currentFiles = useMemo(() => {
    let filtered = allFiles.filter(f => f.parent_id === currentFolder);
    if (activeFilter !== 'all') {
      filtered = filtered.filter(FILTER_MAP[activeFilter]);
    }
    return filtered;
  }, [allFiles, currentFolder, activeFilter]);

  const handleNewFolder = () => {
    setFolderName('');
    setFolderModalVisible(true);
  };

  const handleCreateFolder = async () => {
    const trimmed = folderName.trim();
    if (!trimmed) {
      Message.warning(t('filesPage.folderNamePlaceholder'));
      return;
    }
    try {
      await api.createFolder(trimmed, currentFolder ?? undefined);
      const listRes = await api.listFiles();
      setAllFiles(listRes.files);
      Message.success(t('filesPage.folderCreated', { name: trimmed }));
      setFolderModalVisible(false);
    } catch {
      Message.error(t('filesPage.createFolderFailed'));
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const ALLOWED_UPLOAD_TYPES = [
    'image/', 'video/', 'audio/', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'application/x-7z-compressed', 'application/x-tar', 'application/gzip',
    'text/plain', 'text/markdown', 'application/json',
  ];
  const ALLOWED_UPLOAD_EXTENSIONS = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'md', 'json',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
    'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg',
    'zip', 'rar', '7z', 'tar', 'gz',
  ];

  const isAllowedFileType = (file: File): boolean => {
    if (file.type) {
      return ALLOWED_UPLOAD_TYPES.some(type => file.type.startsWith(type) || file.type === type);
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    return ALLOWED_UPLOAD_EXTENSIONS.includes(ext);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const uploadTasks: Array<{ name: string; content: string; mimeType: string }> = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i];
        if (f.size > MAX_FILE_SIZE) {
          throw new Error(`文件 "${f.name}" 过大（${formatSize(f.size)}），请压缩后上传（最大 ${formatSize(MAX_FILE_SIZE)}）`);
        }
        if (!isAllowedFileType(f)) {
          throw new Error(`文件 "${f.name}" 类型不支持（${f.type || '未知'}），请上传常见的文档、图片、音视频或压缩包`);
        }
        const base64 = await fileToBase64(f);
        uploadTasks.push({ name: f.name, content: base64, mimeType: f.type });
      }

      const res = await api.uploadFiles(uploadTasks, currentFolder ?? undefined);
      const listRes = await api.listFiles();
      setAllFiles(listRes.files);

      // 检查上传的文件是否出现在正确的文件夹中
      const errors: string[] = [];
      if (res.files) {
        for (const uploaded of res.files) {
          const found = listRes.files.find(f => f.id === uploaded.id);
          if (found && found.parent_id !== currentFolder) {
            errors.push(`"${uploaded.name}" 未出现在当前文件夹中`);
          }
        }
      }

      if (errors.length > 0) {
        Message.warning(`上传完成，但 ${errors.length} 个文件位置异常`);
      } else {
        Message.success(`已上传 ${uploadTasks.length} 个文件`);
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : '上传文件失败');
    }

    e.target.value = '';
  };

  const handleDeleteFile = (fileId: string) => {
    const file = allFiles.find(f => f.id === fileId);
    if (!file) return;
    Modal.confirm({
      title: t('filesPage.deleteConfirmTitle'),
      content: t('filesPage.deleteConfirmContent', { name: file.name }),
      onOk: async () => {
        try {
          await api.deleteFile(fileId);
          setAllFiles(prev => prev.filter(f => f.id !== fileId));
          Message.success(t('filesPage.deleteSuccess'));
        } catch {
          Message.error(t('filesPage.deleteFailed'));
        }
      },
    });
  };

  const handleDownloadFile = (file: FileItemData) => {
    if (file.is_folder) {
      setFolderNavDirection('forward');
      setCurrentFolder(file.id);
      setFolderStack(prev => [...prev, { id: file.id, name: file.name }]);
      setActiveFilter('all');
      return;
    }
    window.open(getFileUrl(file.id, 'download'), '_blank');
  };

  function isPreviewableFile(file: FileItemData): boolean {
    if (file.is_folder) return false;
    if (['image', 'video', 'audio'].includes(file.type)) return true;
    if (file.type === 'document') {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      return ['txt', 'md', 'json', 'pdf', 'docx'].includes(ext);
    }
    return false;
  }

  const handleFileClick = useCallback((file: FileItemData) => {
    if (file.is_folder) {
      setFolderNavDirection('forward');
      setCurrentFolder(file.id);
      setFolderStack(prev => [...prev, { id: file.id, name: file.name }]);
      setActiveFilter('all');
    } else if (isPreviewableFile(file)) {
      addRecentItem({ id: file.id, type: 'file', title: file.name });
      setPreviewFile(file);
    } else {
      addRecentItem({ id: file.id, type: 'file', title: file.name });
      window.open(getFileUrl(file.id, 'download'), '_blank');
    }
  }, []);

  const buildFolderStack = useCallback((folderId: string | null, files: FileItemData[], rootName: string) => {
    const stack: Array<{ id: string | null; name: string }> = [{ id: null, name: rootName }];
    if (!folderId) {
      return stack;
    }

    const byId = new Map(files.map(file => [file.id, file]));
    const folders: FileItemData[] = [];
    let currentId: string | null = folderId;
    while (currentId) {
      const folder = byId.get(currentId);
      if (!folder) break;
      folders.unshift(folder);
      currentId = folder.parent_id;
    }

    for (const folder of folders) {
      stack.push({ id: folder.id, name: folder.name });
    }
    return stack;
  }, []);

  useEffect(() => {
    if (!initialFileId || loading) {
      return;
    }

    const target = allFiles.find(file => file.id === initialFileId);
    if (!target) {
      onInitialFileIdUsed?.();
      return;
    }

    const rootName = t('filesPage.rootFolderName');
    if (target.is_folder) {
      setFolderNavDirection('forward');
      setCurrentFolder(target.id);
      setFolderStack(buildFolderStack(target.id, allFiles, rootName));
      setActiveFilter('all');
    } else {
      setFolderNavDirection('forward');
      setCurrentFolder(target.parent_id);
      setFolderStack(buildFolderStack(target.parent_id, allFiles, rootName));
      setActiveFilter('all');
      handleFileClick(target);
    }
    onInitialFileIdUsed?.();
  }, [allFiles, buildFolderStack, handleFileClick, initialFileId, loading, onInitialFileIdUsed]);

  const handleBreadcrumbClick = (index: number) => {
    const target = folderStack[index];
    setFolderNavDirection('backward');
    setCurrentFolder(target.id);
    setFolderStack(prev => prev.slice(0, index + 1));
    setActiveFilter('all');
  };

  const currentFolderStats = useMemo(() => {
    const filesInFolder = allFiles.filter(f => f.parent_id === currentFolder);
    const totalSizeBytes = filesInFolder.filter(f => !f.is_folder).reduce((sum, f) => sum + f.size, 0);
    return {
      totalFiles: filesInFolder.filter(f => !f.is_folder).length,
      totalFolders: filesInFolder.filter(f => f.is_folder).length,
      totalSize: totalSizeBytes > 0 ? formatSize(totalSizeBytes) : '-',
    };
  }, [allFiles, currentFolder]);

  const actions = (
    <>
      <Button
        shape='round'
        size='large'
        type='secondary'
        icon={<IconFolderAdd />}
        style={{ height: '40px', padding: '0 20px', fontSize: '14px' }}
        onClick={handleNewFolder}
      >
        {t('filesPage.newFolder')}
      </Button>
      <Button
        shape='round'
        size='large'
        type='primary'
        icon={<IconUpload />}
        style={{ height: '40px', padding: '0 20px', fontSize: '14px', backgroundColor: PRIMARY_COLOR }}
        onClick={handleUploadClick}
      >
        {t('filesPage.uploadFile')}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
        aria-label={t('filesPage.selectUploadFile')}
      />
    </>
  );

  const pageStats = [
    { label: t('filesPage.file'), value: currentFolderStats.totalFiles },
    { label: t('filesPage.folder'), value: currentFolderStats.totalFolders },
    { label: t('filesPage.size'), value: currentFolderStats.totalSize },
  ];

  const extraStatsContent = (
    <Radio.Group type='button' value={viewMode} onChange={setViewMode} options={[{ label: t('filesPage.grid'), value: 'grid' }, { label: t('filesPage.list'), value: 'list' }]} />
  );

  return (
    <PageLayout 
      title={t('filesPage.rootFolderName')}
      pageKey='files'
      actions={actions}
      stats={pageStats}
      statsLoading={loading}
      extraStatsContent={extraStatsContent}
    >
      {/* 面包屑导航 */}
      <div className="files-breadcrumb-wrapper">
        <Breadcrumb>
          {folderStack.map((item, index) => (
            <Breadcrumb.Item
              key={item.id ?? 'root'}
              style={{ cursor: index < folderStack.length - 1 ? 'pointer' : 'default' }}
              onClick={() => index < folderStack.length - 1 && handleBreadcrumbClick(index)}
            >
              {item.name}
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>
      </div>

      {/* 筛选标签 */}
      {!loading && (
        <div className="files-filter-bar">
          {FILTER_TAGS.map(tag => (
            <Tag
              key={tag}
              color={tag === activeFilter ? 'arcoblue' : 'default'}
              style={{ cursor: 'pointer' }}
              onClick={() => setActiveFilter(tag)}
            >
              {filterLabels[tag]}
            </Tag>
          ))}
        </div>
      )}

      {loading ? (
        <Empty description={t('filesPage.loading')} className="files-empty-padded" />
      ) : currentFiles.length === 0 ? (
        <div key={currentFolder ?? 'root'} className={`files-content-enter files-content-enter-${folderNavDirection}`}>
          <Empty description={activeFilter !== 'all' ? t('filesPage.noFilterResults') : currentFolder ? t('filesPage.emptyFolder') : t('filesPage.noFiles')} className="files-empty-padded" />
        </div>
      ) : viewMode === 'grid' ? (
        <div key={currentFolder ?? 'root'} className={`files-content-enter files-content-enter-${folderNavDirection}`}>
          <div className="files-grid">
            {currentFiles.map(file => <GridFileCard key={file.id} file={file} onClick={handleFileClick} formatItemCount={(count) => t('filesPage.itemCount', { count })} />)} 
          </div>
        </div>
      ) : (
        <div key={currentFolder ?? 'root'} className={`files-content-enter files-content-enter-${folderNavDirection}`}>
          <div className="files-list-table">
            <div className="files-list-header">
              <div className="files-list-header-icon" />
              <div className="files-list-header-name">{t('filesPage.name')}</div>
              <div className="files-list-header-size">{t('filesPage.size')}</div>
              <div className="files-list-header-date">{t('filesPage.modifiedAt')}</div>
              <div className="files-list-header-actions" />
            </div>
            {currentFiles.map(file => <ListFileRow key={file.id} file={file} onClick={handleFileClick} onDownload={handleDownloadFile} onDelete={handleDeleteFile} formatItemCount={(count) => t('filesPage.itemCount', { count })} />)} 
          </div>
        </div>
      )}

      <div className="files-empty-spacing" />

      <Modal
        title={t('filesPage.newFolderTitle')}
        visible={folderModalVisible}
        onOk={handleCreateFolder}
        onCancel={() => setFolderModalVisible(false)}
        autoFocus={false}
        focusLock
      >
        <Input
          placeholder={t('filesPage.folderNamePlaceholder')}
          value={folderName}
          onChange={setFolderName}
          onPressEnter={handleCreateFolder}
        />
      </Modal>

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </PageLayout>
  );
};

export default FilesPage;
