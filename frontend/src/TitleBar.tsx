import { Button, Space, Menu, Dropdown, Avatar, Modal, Message, Divider, Input } from '@arco-design/web-react';
import { IconMinus, IconExpand, IconClose, IconUpload, IconRefresh, IconUser } from '@arco-design/web-react/icon';
import './TitleBar.css';
import { api, type SearchResult } from './api';
import type { UserProfile } from './types/common';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import SearchBox from './SearchBox';
import { useShortcuts } from './hooks/useShortcuts';
import { saveUserProfile, loadUserProfile } from './SettingsPage/views/ChatView/utils';
import { getRecentItems, clearRecentItems, type RecentItem } from './utils/recentFiles';
import { appPlatform } from './utils/platform';

// 快捷键提示组件 - 使用 Tailwind
const Shortcut = ({ keys }: { keys: string }) => (
  <span className="tw-ml-auto tw-pl-4 tw-text-arco-text-3 tw-text-xs tw-font-mono">
    {keys}
  </span>
);

type PageChangeOptions = { noteId?: string; fileId?: string; cardId?: string };

interface TitleBarProps {
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
  onPageChange?: (page: string, options?: string | PageChangeOptions) => void;
  onNewNote?: () => void;
  onNewCard?: () => void;
  onSearchResult?: (result: SearchResult) => void;
}

/**
 * 用圆角窗口轮廓和左侧分栏表示主侧边栏的当前展开状态。
 * 原因：图标与用户提供的参考图一致，左栏填充可在不增加文字占用的情况下传达状态。
 * 未使用位图：内联 SVG 能随主题继承颜色，并保持不同缩放比例下的边缘清晰。
 */
const SidebarStateIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={`titlebar-sidebar-icon${expanded ? ' titlebar-sidebar-icon-expanded' : ''}`}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      className="titlebar-sidebar-icon-pane"
      d="M8.5 5.4H6.8A2.4 2.4 0 004.4 7.8v8.4a2.4 2.4 0 002.4 2.4h1.7V5.4z"
      fill="currentColor"
    />
    <rect
      x="3.6"
      y="4.6"
      width="16.8"
      height="14.8"
      rx="3"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path d="M8.5 5.4v13.2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const TitleBar = ({
  sidebarCollapsed,
  onSidebarToggle,
  onPageChange,
  onNewNote,
  onNewCard,
  onSearchResult,
}: TitleBarProps) => {
  const { t } = useTranslation();
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importContent, setImportContent] = useState('');
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(loadUserProfile());
  const [tempUserId, setTempUserId] = useState('');
  const [tempAvatarUrl, setTempAvatarUrl] = useState<string | null>(null);
  const isMacos = appPlatform === 'macos';
  const isWindows = appPlatform === 'windows';
  const [recentItems, setRecentItems] = useState<RecentItem[]>(() => getRecentItems());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getShortcutDisplay } = useShortcuts();

  const refreshRecentItems = useCallback(() => {
    setRecentItems(getRecentItems());
  }, []);

  useEffect(() => {
    const handleProfileChanged = () => {
      setUserProfile(loadUserProfile());
    };
    window.addEventListener('papyrus_user_profile_changed', handleProfileChanged);
    window.addEventListener('storage', handleProfileChanged);
    return () => {
      window.removeEventListener('papyrus_user_profile_changed', handleProfileChanged);
      window.removeEventListener('storage', handleProfileChanged);
    };
  }, []);

  useEffect(() => {
    window.addEventListener('papyrus_recent_files_changed', refreshRecentItems);
    return () => {
      window.removeEventListener('papyrus_recent_files_changed', refreshRecentItems);
    };
  }, [refreshRecentItems]);

  useEffect(() => {
    // 原生 File 菜单复用 renderer 内已有导入弹窗。
    // 原因：导入状态属于 TitleBar，事件桥接可保持只有一个 Modal 与一套校验逻辑。
    // 未在主进程读取文件内容：renderer 已有安全的文本导入流程，重复实现会产生协议分叉。
    const handleNativeImport = () => {
      setImportModalVisible(true);
    };
    window.addEventListener('papyrus_import_text', handleNativeImport);
    return () => {
      window.removeEventListener('papyrus_import_text', handleNativeImport);
    };
  }, []);

  // 打开用户设置弹窗
  const handleOpenProfileModal = () => {
    setTempUserId(userProfile.userId);
    setTempAvatarUrl(userProfile.avatarUrl);
    setProfileModalVisible(true);
  };

  // 关闭弹窗并保存
  const handleCloseProfileModal = () => {
    const newProfile: UserProfile = {
      userId: tempUserId.trim(),
      avatarUrl: tempAvatarUrl,
    };
    saveUserProfile(newProfile);
    setProfileModalVisible(false);
    Message.success(t('titleBar.profileSaved'));
  };

  // 处理头像上传
  const handleAvatarUpload = () => {
    fileInputRef.current?.click();
  };

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      Message.error(t('titleBar.pleaseSelectImage'));
      return;
    }

    // 验证文件大小（最大 2MB）
    if (file.size > 2 * 1024 * 1024) {
      Message.error(t('titleBar.imageSizeExceeds'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        setTempAvatarUrl(result);
      }
    };
    reader.readAsDataURL(file);

    // 清空 input 值，允许重复选择同一文件
    e.target.value = '';
  };

  // 恢复默认设置
  const handleResetDefault = () => {
    setTempUserId('');
    setTempAvatarUrl(null);
  };

  // 处理用户名称输入
  const handleUserIdChange = (value: string) => {
    // 最多10个字符
    if (value.length <= 10) {
      setTempUserId(value);
    }
  };

  // 处理搜索结果点击
  const handleSearchResult = (result: SearchResult) => {
    if (onSearchResult) {
      onSearchResult(result);
    } else {
      // 默认行为：跳转到对应页面
      if (result.type === 'note') {
        onPageChange?.('notes', result.id);
      } else if (result.type === 'card') {
        onPageChange?.('scroll', { cardId: result.id });
      } else if (result.type === 'file') {
        onPageChange?.('files', { fileId: result.id });
      }
    }
  };

  // 新建菜单项
  const handleNewNote = () => {
    onNewNote?.();
    Message.success(t('titleBar.createNewNote'));
  };

  const handleNewCard = () => {
    onNewCard?.();
    Message.success(t('titleBar.createNewCard'));
  };

  const handleNewWindow = () => {
    Message.info(t('titleBar.newWindowComingSoon'));
  };

  // 打开菜单项
  const handleOpenNotes = () => {
    if (onPageChange) {
      onPageChange('notes');
    }
  };

  const handleOpenFiles = () => {
    if (onPageChange) {
      onPageChange('files');
    }
  };

  const handleOpenReview = () => {
    if (onPageChange) {
      onPageChange('scroll');
    }
  };

  const handleOpenRecentItem = (item: RecentItem) => {
    if (item.type === 'note') {
      onPageChange?.('notes', item.id);
    } else if (item.type === 'card') {
      onPageChange?.('scroll', { cardId: item.id });
    } else if (item.type === 'file') {
      onPageChange?.('files', { fileId: item.id });
    }
  };

  const handleClearRecentFiles = () => {
    clearRecentItems();
  };

  // 导入功能
  const handleImportTxt = () => {
    setImportModalVisible(true);
  };

  const handleConfirmImport = async () => {
    if (!importContent.trim()) {
      Message.error(t('titleBar.pleaseEnterImportContent'));
      return;
    }
    try {
      const result = await api.importTxt(importContent);
      if (result.success) {
        Message.success(t('titleBar.importSuccess', { count: result.count }));
        setImportModalVisible(false);
        setImportContent('');
        window.dispatchEvent(new CustomEvent('papyrus_cards_changed'));
      }
    } catch (error) {
      Message.error(t('titleBar.importFailed') + ': ' + (error as Error).message);
    }
  };

  // 保存功能
  const handleSave = () => {
    Message.success(`${t('titleBar.saveSuccess')} (${getShortcutDisplay('save')})`);
  };

  const handleSaveAll = () => {
    Message.success(`${t('titleBar.saveAllSuccess')} (${getShortcutDisplay('saveAll')})`);
  };

  // 关闭功能
  const handleCloseEditor = () => {
    Message.info(t('titleBar.closeCurrentEditor'));
  };

  const handleExit = () => {
    Modal.confirm({
      title: t('titleBar.confirmExit'),
      content: t('titleBar.exitConfirmMessage'),
      onOk: () => {
        window.electronAPI?.quitApp?.();
      },
    });
  };

  // 首选项
  const handlePreferences = () => {
    onPageChange?.('settings');
  };

  // 文件菜单下拉内容
  const fileMenu = (
    <Menu style={{ width: 280, maxHeight: 'none', overflow: 'visible' }}>
      {/* 新建组 */}
      <Menu.SubMenu key="new" title={t('titleBar.new')} style={{ width: 260 }}>
        <Menu.Item key="new-note" onClick={handleNewNote} style={{ width: 260 }}>
          <span className="tw-flex tw-items-center tw-w-full">
            {t('titleBar.newNote')}
            <Shortcut keys={getShortcutDisplay('newNote')} />
          </span>
        </Menu.Item>
        <Menu.Item key="new-card" onClick={handleNewCard} style={{ width: 260 }}>
          <span className="tw-flex tw-items-center tw-w-full">
            {t('titleBar.newCard')}
            <Shortcut keys={getShortcutDisplay('newCard')} />
          </span>
        </Menu.Item>
        <Menu.Item key="new-window" onClick={handleNewWindow} style={{ width: 260 }}>
          <span className="tw-flex tw-items-center tw-w-full">
            {t('titleBar.newWindow')}
            <Shortcut keys={getShortcutDisplay('newWindow')} />
          </span>
        </Menu.Item>
      </Menu.SubMenu>

      <Divider style={{ margin: '4px 0' }} />

      {/* 打开组 */}
      <Menu.SubMenu key="open" title={t('titleBar.open')} style={{ width: 260 }}>
        <Menu.Item key="open-notes" onClick={handleOpenNotes} style={{ width: 260 }}>
          <span className="tw-flex tw-items-center tw-w-full">
            {t('titleBar.openNotes')}
            <Shortcut keys={getShortcutDisplay('openNotes')} />
          </span>
        </Menu.Item>
        <Menu.Item key="open-files" onClick={handleOpenFiles} style={{ width: 260 }}>
          <span className="tw-flex tw-items-center tw-w-full">
            {t('titleBar.openFiles')}
            <Shortcut keys={getShortcutDisplay('openFiles')} />
          </span>
        </Menu.Item>
        <Menu.Item key="open-review" onClick={handleOpenReview} style={{ width: 260 }}>
          <span className="tw-flex tw-items-center tw-w-full">
            {t('titleBar.openReview')}
            <Shortcut keys={getShortcutDisplay('openReview')} />
          </span>
        </Menu.Item>
        <Menu.SubMenu key="recent" title={t('titleBar.recentFiles')} style={{ width: 260 }}>
          {recentItems.length === 0 ? (
            <Menu.Item key="recent-empty" disabled style={{ width: 260 }}>{t('titleBar.noRecentFiles')}</Menu.Item>
          ) : (
            <>
              {recentItems.map(item => (
                <Menu.Item key={`recent-${item.type}-${item.id}`} onClick={() => handleOpenRecentItem(item)} style={{ width: 260 }}>
                  <span className="tw-flex tw-items-center tw-w-full tw-truncate" title={item.title}>
                    <span className="tw-text-xs tw-text-arco-text-3 tw-mr-2 tw-flex-shrink-0">
                      {item.type === 'note' ? t('titleBar.recentTypeNote') : item.type === 'card' ? t('titleBar.recentTypeCard') : t('titleBar.recentTypeFile')}
                    </span>
                    <span className="tw-truncate">{item.title}</span>
                  </span>
                </Menu.Item>
              ))}
              <Divider style={{ margin: '4px 0' }} />
              <Menu.Item key="recent-clear" onClick={handleClearRecentFiles} style={{ width: 260 }}>
                <span className="tw-text-xs tw-text-arco-text-3">{t('titleBar.clearRecentFiles')}</span>
              </Menu.Item>
            </>
          )}
        </Menu.SubMenu>
      </Menu.SubMenu>
      
      <Divider style={{ margin: '4px 0' }} />
      
      {/* 导入/导出组 */}
      <Menu.Item key="import" onClick={handleImportTxt}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.importFromText')}
          <Shortcut keys={getShortcutDisplay('importTxt')} />
        </span>
      </Menu.Item>
      
      <Divider style={{ margin: '4px 0' }} />
      
      {/* 保存组 */}
      <Menu.Item key="save" onClick={handleSave}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.save')}
          <Shortcut keys={getShortcutDisplay('save')} />
        </span>
      </Menu.Item>
      <Menu.Item key="save-all" onClick={handleSaveAll}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.saveAll')}
          <Shortcut keys={getShortcutDisplay('saveAll')} />
        </span>
      </Menu.Item>
      
      <Divider style={{ margin: '4px 0' }} />
      
      {/* 首选项 */}
      <Menu.Item key="preferences" onClick={handlePreferences}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.preferences')}
          <Shortcut keys={getShortcutDisplay('preferences')} />
        </span>
      </Menu.Item>
      
      <Divider style={{ margin: '4px 0' }} />
      
      {/* 关闭组 */}
      <Menu.Item key="close-editor" onClick={handleCloseEditor}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.closeEditor')}
          <Shortcut keys={getShortcutDisplay('closeEditor')} />
        </span>
      </Menu.Item>
      <Menu.Item key="exit" onClick={handleExit}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.exit')}
          <Shortcut keys={getShortcutDisplay('exit')} />
        </span>
      </Menu.Item>
    </Menu>
  );

  // 编辑菜单下拉内容
  const editMenu = (
    <Menu style={{ width: 240, maxHeight: 'none', overflow: 'visible' }}>
      <Menu.Item key="undo" onClick={() => { try { document.execCommand('undo'); } catch { /* ignore */ } }}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.undo')}
          <Shortcut keys={getShortcutDisplay('undo')} />
        </span>
      </Menu.Item>
      <Menu.Item key="redo" onClick={() => { try { document.execCommand('redo'); } catch { /* ignore */ } }}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.redo')}
          <Shortcut keys={getShortcutDisplay('redo')} />
        </span>
      </Menu.Item>
      <Divider style={{ margin: '4px 0' }} />
      <Menu.Item key="cut" onClick={() => { try { document.execCommand('cut'); } catch { /* ignore */ } }}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.cut')}
          <Shortcut keys={getShortcutDisplay('cut')} />
        </span>
      </Menu.Item>
      <Menu.Item key="copy" onClick={() => { try { document.execCommand('copy'); } catch { /* ignore */ } }}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.copy')}
          <Shortcut keys={getShortcutDisplay('copy')} />
        </span>
      </Menu.Item>
      <Menu.Item key="paste" onClick={() => { try { document.execCommand('paste'); } catch { /* ignore */ } }}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.paste')}
          <Shortcut keys={getShortcutDisplay('paste')} />
        </span>
      </Menu.Item>
      <Divider style={{ margin: '4px 0' }} />
      <Menu.Item key="select-all" onClick={() => { try { document.execCommand('selectAll'); } catch { /* ignore */ } }}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.selectAll')}
          <Shortcut keys={getShortcutDisplay('selectAll')} />
        </span>
      </Menu.Item>
      <Menu.Item key="find" onClick={() => {
        try {
          window.dispatchEvent(new CustomEvent('papyrus_focus_search'));
        } catch { /* ignore */ }
      }}>
        <span className="tw-flex tw-items-center tw-w-full">
          {t('titleBar.find')}
          <Shortcut keys={getShortcutDisplay('find')} />
        </span>
      </Menu.Item>
    </Menu>
  );

  // 渲染头像内容
  const renderAvatar = (size: number = 28, avatarUrl: string | null, userId: string) => {
    if (avatarUrl) {
      return (
        <Avatar 
          size={size} 
          className="tw-cursor-pointer"
          style={{ fontSize: size * 0.4 }}
        >
          <img src={avatarUrl} alt="" />
        </Avatar>
      );
    }
    return (
      <Avatar 
        size={size} 
        className="tw-cursor-pointer"
        style={{ backgroundColor: 'var(--color-primary)', fontSize: size * 0.4 }} 
      >
        {userId?.charAt(0)
          ? userId.charAt(0).toUpperCase()
          : <IconUser aria-hidden="true" />}
      </Avatar>
    );
  };

  return (
    <>
      <div className={`titlebar${isMacos ? ' titlebar-macos' : ''}${isWindows ? ' titlebar-windows' : ''}`}>
        <div className="titlebar-leading">
          <button
            className="titlebar-sidebar-toggle no-drag"
            type="button"
            onClick={onSidebarToggle}
            aria-label={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          >
            <SidebarStateIcon expanded={!sidebarCollapsed} />
          </button>

          {/* File/Edit menus - hidden on macOS (use system menu bar instead) */}
          {!isMacos && (
            <Space className="titlebar-menus no-drag" size={0}>
              <Dropdown trigger="click" droplist={fileMenu}>
                <Button type="text" size="small" className="titlebar-menu-item">{t('titleBar.file')}</Button>
              </Dropdown>
              <Dropdown trigger="click" droplist={editMenu}>
                <Button type="text" size="small" className="titlebar-menu-item">{t('titleBar.edit')}</Button>
              </Dropdown>
            </Space>
          )}
        </div>

        {/* center search */}
        <div className="titlebar-center">
          <SearchBox 
            onResultClick={handleSearchResult}
            onNavigateToNote={(noteId) => {
              onPageChange?.('notes', noteId);
            }}
            onNavigateToCard={() => onPageChange?.('scroll')}
            onNavigateToFile={(fileId) => onPageChange?.('files', { fileId })}
          />
        </div>

        {/* window controls - hidden on macOS to preserve native traffic lights */}
        {!isMacos && (
          <div className="titlebar-controls no-drag">
            <button
              className="titlebar-avatar no-drag"
              type="button"
              aria-label={t('titleBar.userSettings')}
              onClick={handleOpenProfileModal}
            >
              {renderAvatar(28, userProfile.avatarUrl, userProfile.userId)}
            </button>
            <button className="titlebar-btn no-drag" aria-label="最小化" onClick={() => window.electronAPI?.minimizeWindow?.()}>
              <IconMinus />
            </button>
            <button className="titlebar-btn no-drag" aria-label="最大化" onClick={() => window.electronAPI?.maximizeWindow?.()}>
              <IconExpand />
            </button>
            <button className="titlebar-btn titlebar-btn-close no-drag" aria-label="关闭" onClick={() => {
              const minimize = localStorage.getItem('papyrus_minimize_to_tray') === 'true';
              if (minimize) {
                window.electronAPI?.closeWindow?.();
              } else {
                window.electronAPI?.quitApp?.();
              }
            }}>
              <IconClose />
            </button>
          </div>
        )}
        {/* macOS: show only avatar on the right */}
        {isMacos && (
          <div className="titlebar-controls no-drag">
            <button
              className="titlebar-avatar no-drag"
              type="button"
              aria-label={t('titleBar.userSettings')}
              onClick={handleOpenProfileModal}
            >
              {renderAvatar(28, userProfile.avatarUrl, userProfile.userId)}
            </button>
          </div>
        )}
      </div>

      {/* 导入对话框 */}
      <Modal
        title={t('titleBar.importFromText')}
        visible={importModalVisible}
        onOk={handleConfirmImport}
        onCancel={() => setImportModalVisible(false)}
        okText={t('titleBar.import')}
        cancelText={t('titleBar.cancel')}
      >
        <div className="tw-mb-4">
          <p className="tw-mb-2 tw-text-arco-text-2">
            {t('titleBar.importFormat')}: <code>问题 === 答案</code>，{t('titleBar.onePerLine')}
          </p>
          <Input.TextArea
            placeholder={t('titleBar.importPlaceholder')}
            aria-label={t('titleBar.importContentAria')}
            value={importContent}
            onChange={(value: string) => setImportContent(value)}
            rows={8}
          />
        </div>
      </Modal>

      {/* 用户设置对话框 */}
      <Modal
        title={t('titleBar.userSettings')}
        visible={profileModalVisible}
        onOk={handleCloseProfileModal}
        onCancel={() => setProfileModalVisible(false)}
        okText={t('titleBar.save')}
        cancelText={t('titleBar.cancel')}
      >
        <div className="tw-flex tw-flex-col tw-gap-6">
          {/* 头像上传区域 */}
          <div className="tw-flex tw-flex-col tw-items-center tw-gap-4">
            <button
              className="titlebar-avatar-upload tw-relative tw-cursor-pointer tw-group"
              type="button"
              aria-label={t('titleBar.selectAvatarImage')}
              onClick={handleAvatarUpload}
            >
              {renderAvatar(80, tempAvatarUrl, tempUserId)}
              <div className="tw-absolute tw-inset-0 tw-bg-black/40 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-opacity-0 group-hover:tw-opacity-100 tw-transition-opacity">
                <IconUpload className="tw-text-white tw-text-xl" />
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="tw-hidden"
              onChange={handleFileChange}
              aria-label={t('titleBar.selectAvatarImage')}
            />
            <span className="tw-text-sm tw-text-arco-text-3">
              {t('titleBar.clickToUploadAvatar')}
            </span>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          {/* 用户名称输入 */}
          <div className="tw-flex tw-flex-col tw-gap-2">
            <label className="tw-text-sm tw-font-medium tw-text-arco-text-1">
              {t('titleBar.userId')}
            </label>
            <Input
              value={tempUserId}
              onChange={handleUserIdChange}
              placeholder={t('titleBar.enterUserId')}
              maxLength={10}
              showWordLimit
            />
            <span className="tw-text-xs tw-text-arco-text-3">
              {t('titleBar.userIdTip')}
            </span>
          </div>

          {/* 恢复默认按钮 */}
          <Button 
            type="secondary" 
            icon={<IconRefresh />}
            onClick={handleResetDefault}
            long
          >
            {t('titleBar.restoreDefault')}
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default TitleBar;
