/**
 * Papyrus 主应用组件
 *
 * 无障碍特性：
 * - Skip Link 跳转到主内容
 * - ARIA 地标角色
 * - 键盘导航支持
 * - 语义化 HTML 结构
 */
import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { BackTop, Message } from '@arco-design/web-react';
import { IconLeft } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';
import StatusBar from './StatusBar';
import StartPage from './StartPage/StartPage';
import ScrollPage from './ScrollPage/ScrollPage';
import NotesPage from './NotesPage/NotesPage';
import FilesPage from './FilesPage/FilesPage';
import SettingsPage from './SettingsPage/SettingsPage';
import SectionNavigation from './components/SectionNavigation';
import { api, getAuthToken, type ChatPanelSide, type ChatSession, type SearchResult } from './api';
import { addRecentItem } from './utils/recentFiles';
import { clampChatWidth } from './utils/appLayout';
import { appPlatform } from './utils/platform';
import type { NativeMenuAction } from './types/electron';

const PAGE_ORDER = ['start', 'scroll', 'notes', 'files', 'settings'];

const CHAT_WIDTH_STORAGE_KEY = 'papyrus_chat_width';
const CHAT_DEFAULT_WIDTH = appPlatform === 'macos' ? 420 : 500;
const SIDEBAR_COLLAPSED_WIDTH = 48;
const SIDEBAR_EXPANDED_WIDTH = 240;

const loadChatWidth = (): number => {
  try {
    const saved = localStorage.getItem(CHAT_WIDTH_STORAGE_KEY);
    if (saved) {
      const width = parseInt(saved, 10);
      if (width >= 280 && width <= 600) {
        return width;
      }
    }
  } catch {
    // ignore
  }
  return CHAT_DEFAULT_WIDTH;
};

const saveChatWidth = (width: number): void => {
  try {
    localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // ignore
  }
};

const App = () => {
  const { t } = useTranslation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [, setTodayDone] = useState(false);
  const [activePage, setActivePage] = useState('start');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(loadChatWidth);
  const [chatSide, setChatSide] = useState<ChatPanelSide>('right');
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [chatSessionsLoading, setChatSessionsLoading] = useState(true);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [requestedChatSessionId, setRequestedChatSessionId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef<number>(0);
  const dragStartWidth = useRef<number>(0);
  const [initialNoteId, setInitialNoteId] = useState<string | undefined>(undefined);
  const [initialScrollTag, setInitialScrollTag] = useState<string | undefined>(undefined);
  const [initialCardId, setInitialCardId] = useState<string | undefined>(undefined);
  const [initialFileId, setInitialFileId] = useState<string | undefined>(undefined);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const prevPageIndexRef = useRef<number>(0);
  const [animationDirection, setAnimationDirection] = useState<'up' | 'down' | null>(null);
  const [prevPage, setPrevPage] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const pendingActionRef = useRef<'newNote' | 'newCard' | 'startStudy' | null>(null);
  const studyTagRef = useRef<string | undefined>(undefined);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compactLayoutRef = useRef(false);

  useEffect(() => {
    void getAuthToken();
    let cancelled = false;
    api.getSidebarSettings()
      .then((res) => {
        if (!cancelled && res.success) {
          setChatSide(res.settings.chatPanelSide);
        }
      })
      .catch((err) => {
        console.warn('Failed to load sidebar settings:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 从后端刷新供全局侧边栏展示的轻量会话摘要。
   * 原因：App 同时知道 Sidebar 和 ChatPanel 的状态，可作为两者之间唯一的协调层。
   * 未把完整消息提升到 App：消息仅由 ChatPanel 消费，提升会扩大根组件的重渲染范围。
   */
  const refreshChatSessions = useCallback(async () => {
    setChatSessionsLoading(true);
    try {
      const result = await api.listChatSessions();
      if (result.success) {
        setChatSessions(result.sessions);
        setActiveChatSessionId(result.activeSessionId);
      }
    } catch (error) {
      console.error('Failed to load sidebar chat sessions:', error);
    } finally {
      setChatSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshChatSessions();
  }, [refreshChatSessions]);

  /**
   * 请求 ChatPanel 打开并恢复指定历史会话。
   * 原因：侧边栏只传递会话 ID，ChatPanel 继续拥有消息水合与编辑状态清理逻辑。
   * 未直接在侧边栏切换 API：那会绕过 ChatPanel 的消息恢复流程，导致标题高亮与正文不一致。
   */
  const handleChatSessionSelect = useCallback((sessionId: string) => {
    setActiveChatSessionId(sessionId);
    setRequestedChatSessionId(sessionId);
    setChatOpen(true);
  }, []);

  /**
   * 从常驻历史模块创建空会话并交给 ChatPanel 激活。
   * 原因：即使聊天面板尚未挂载，App 也能先完成创建，再以明确 ID 初始化面板。
   * 未模拟点击 ChatHeader：直接调用现有会话 API 不依赖组件挂载时序，行为更稳定。
   */
  const handleNewChat = useCallback(async () => {
    setChatSessionsLoading(true);
    try {
      const result = await api.createChatSession();
      if (result.success) {
        setChatSessions((currentSessions) => [
          result.session,
          ...currentSessions.filter((session) => session.id !== result.session.id),
        ]);
        setActiveChatSessionId(result.session.id);
        setRequestedChatSessionId(result.session.id);
        setChatOpen(true);
      }
    } catch (error) {
      console.error('Failed to create sidebar chat session:', error);
      Message.error(t('chatSession.createFailed'));
    } finally {
      setChatSessionsLoading(false);
    }
  }, [t]);

  /**
   * 接收 ChatPanel 已完成消息水合的确认，并刷新可能变化的标题与计数。
   * 原因：只有面板确认后才清除请求 ID，可防止挂载或网络延迟期间丢失切换意图。
   * 未根据乐观状态长期保留会话摘要：标题和消息数由后端生成，完成后重新读取才可靠。
   */
  const handleChatSessionActivated = useCallback((sessionId: string) => {
    setActiveChatSessionId(sessionId);
    setRequestedChatSessionId((requestedId) => requestedId === sessionId ? null : requestedId);
    void refreshChatSessions();
  }, [refreshChatSessions]);

  /**
   * 重命名侧边栏中的会话并同步全局摘要。
   * 原因：App 持有唯一的会话列表，成功后在这里更新可让展开态、收起菜单和聊天面板保持一致。
   * 未让侧边栏直接长期维护副本：局部副本会在聊天自动改名后与后端状态分叉。
   */
  const handleChatSessionRename = useCallback(async (sessionId: string, title: string): Promise<boolean> => {
    try {
      const result = await api.renameChatSession(sessionId, title);
      if (!result.success) {
        return false;
      }
      setChatSessions((sessions) => sessions.map((session) => (
        session.id === sessionId ? result.session : session
      )));
      Message.success(t('chatHistory.renameSuccess'));
      return true;
    } catch (error) {
      console.error('Failed to rename sidebar chat session:', error);
      Message.error(t('chatHistory.renameFailed'));
      return false;
    }
  }, [t]);

  /**
   * 请求 AI 重新生成指定会话标题，并同步 App 持有的唯一会话摘要。
   * 原因：主侧边栏不直接持有服务器状态，成功结果必须由协调层合并后再向下传递。
   * 未进行乐观改名：标题内容完全由模型决定，失败时应原样保留当前标题。
   */
  const handleChatSessionGenerateTitle = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const result = await api.generateChatSessionTitle(sessionId);
      if (!result.success) {
        return false;
      }
      setChatSessions((sessions) => sessions.map((session) => (
        session.id === sessionId ? result.session : session
      )));
      Message.success(t('chatHistory.aiRenameSuccess'));
      return true;
    } catch (error) {
      console.error('Failed to generate chat session title:', error);
      Message.error(t('chatHistory.aiRenameFailed'));
      return false;
    }
  }, [t]);

  /**
   * 删除侧边栏中的会话，并在删除当前会话时请求 ChatPanel 切换到后端选出的下一项。
   * 原因：删除结果会改变活动会话，必须由同时掌握列表与面板请求状态的 App 统一协调。
   * 未只从数组中过滤：仅做乐观删除会留下已失效的活动会话和消息正文。
   */
  const handleChatSessionDelete = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const result = await api.deleteChatSession(sessionId);
      if (!result.success) {
        return false;
      }
      setChatSessions((sessions) => sessions.filter((session) => session.id !== sessionId));
      if (sessionId === activeChatSessionId) {
        setActiveChatSessionId(result.activeSessionId);
        setRequestedChatSessionId(result.activeSessionId);
      }
      Message.success(t('chatHistory.deleteSuccess'));
      await refreshChatSessions();
      return true;
    } catch (error) {
      console.error('Failed to delete sidebar chat session:', error);
      Message.error(t('chatHistory.deleteFailed'));
      return false;
    }
  }, [activeChatSessionId, refreshChatSessions, t]);

  const handleChatSideToggle = useCallback(() => {
    const previousSide = chatSide;
    const nextSide: ChatPanelSide = chatSide === 'left' ? 'right' : 'left';
    setChatSide(nextSide);
    api.saveSidebarSettings({ chatPanelSide: nextSide })
      .catch((err) => {
        setChatSide(previousSide);
        Message.error(err instanceof Error ? err.message : t('app.saveSidebarSettingsFailed'));
      });
  }, [chatSide, t]);

  // 处理页面切换动画 - 串行执行，先退出再进入（新页面预加载但不显示）
  const handlePageChange = useCallback((newPage: string, options?: string | { noteId?: string; fileId?: string; cardId?: string }) => {
    if (isTransitioning) return;

    // 兼容旧版 noteId 字符串参数和新版 params 对象参数
    const noteId = typeof options === 'string' ? options : options?.noteId;
    const fileId = typeof options === 'object' && options ? options.fileId : undefined;
    const cardId = typeof options === 'object' && options ? options.cardId : undefined;

    if (noteId && newPage === 'notes') {
      setInitialNoteId(noteId);
    }
    if (fileId && newPage === 'files') {
      setInitialFileId(fileId);
    }
    if (cardId && newPage === 'scroll') {
      setInitialCardId(cardId);
    }

    const newIndex = PAGE_ORDER.indexOf(newPage);
    if (newIndex === -1) {
      console.warn(t('app.pageNotFound', { page: newPage }));
      setActivePage(newPage);
      return;
    }

    const currentIndex = PAGE_ORDER.indexOf(activePage);
    if (newPage === activePage || currentIndex === -1) {
      setActivePage(newPage);
      prevPageIndexRef.current = newIndex;
      return;
    }

    const direction = newIndex > currentIndex ? 'up' : 'down';
    setPrevPage(activePage);
    setNextPage(newPage);
    setAnimationDirection(direction);
    setIsTransitioning(true);
    prevPageIndexRef.current = newIndex;

    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }
    transitionTimeoutRef.current = setTimeout(() => {
      setPrevPage(null);
      setActivePage(newPage);
      setNextPage(null);
      setIsTransitioning(false);
      setAnimationDirection(null);
      transitionTimeoutRef.current = null;
    }, 500);
  }, [activePage, isTransitioning, t]);

  // 处理搜索结果点击
  const handleSearchResult = useCallback((result: SearchResult) => {
    if (result.type === 'note') {
      addRecentItem({ id: result.id, type: 'note', title: result.title });
      handlePageChange('notes');
      setInitialNoteId(result.id);
      Message.success(t('app.openNote', { title: result.title }));
    } else if (result.type === 'card') {
      addRecentItem({ id: result.id, type: 'card', title: result.title });
      setInitialCardId(result.id);
      handlePageChange('scroll');
      setInitialScrollTag(result.tags?.[0]);
      Message.success(t('app.navigateToReview'));
    } else if (result.type === 'file') {
      addRecentItem({ id: result.id, type: 'file', title: result.title });
      setInitialFileId(result.id);
      handlePageChange('files');
      Message.success(t('app.openFile', { title: result.title }));
    }
  }, [handlePageChange, t]);

  // 监听来自 ChatPanel 的设置页面跳转事件
  useEffect(() => {
    const handleOpenSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      handlePageChange('settings');
      console.log('Opening settings section:', detail?.section);
    };
    window.addEventListener('papyrus_open_settings', handleOpenSettings);
    return () => window.removeEventListener('papyrus_open_settings', handleOpenSettings);
  }, [handlePageChange]);

  // 处理新建笔记/卡片操作
  const handleNewAction = useCallback((action: 'newNote' | 'newCard') => {
    const targetPage = action === 'newNote' ? 'notes' : 'scroll';

    if (activePage === targetPage) {
      // 直接在对应界面时，确保正确的事件名
      if (action === 'newNote') {
        window.dispatchEvent(new CustomEvent('papyrus_new_note'));
      } else if (action === 'newCard') {
        window.dispatchEvent(new CustomEvent('papyrus_new_card'));
      }
    } else {
      pendingActionRef.current = action;
      handlePageChange(targetPage);
    }
  }, [activePage, handlePageChange]);

  useEffect(() => {
    // 原生菜单只发送稳定动作名，这里复用现有页面路由和新建逻辑。
    // 原因：App 同时持有侧栏、聊天面板与页面状态，是菜单动作的唯一协调层。
    // 未在 preload 直接派发 DOM 事件：contextBridge 只暴露 IPC 白名单，保持进程边界清晰。
    const electronAPI = window.electronAPI;
    const unsubscribe = electronAPI?.onMenuAction((action: NativeMenuAction) => {
      switch (action) {
        case 'new-note':
          handleNewAction('newNote');
          break;
        case 'new-card':
          handleNewAction('newCard');
          break;
        case 'preferences':
          handlePageChange('settings');
          break;
        case 'find':
          window.dispatchEvent(new CustomEvent('papyrus_focus_search'));
          break;
        case 'toggle-sidebar':
          setSidebarCollapsed((collapsed) => !collapsed);
          break;
        case 'toggle-chat':
          setChatOpen((open) => !open);
          break;
        case 'import-text':
          window.dispatchEvent(new CustomEvent('papyrus_import_text'));
          break;
        case 'help':
          void electronAPI?.openExternal('https://github.com/PapyrusOR/Papyrus_Desktop');
          break;
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [handleNewAction, handlePageChange]);

  useEffect(() => {
    // 在窗口首次进入紧凑宽度时自动收起侧栏，同时允许用户之后手动重新展开。
    // 原因：小尺寸 MacBook 窗口应优先保证正文与聊天面板的最小可读宽度。
    // 未只依赖 CSS 隐藏标签：React 仍会按展开宽度计算聊天拖拽边界，可能把正文挤出视口。
    const handleWindowResize = () => {
      const compactLayout = window.innerWidth < 1040;
      const shouldAutoCollapse = compactLayout && !compactLayoutRef.current;
      if (shouldAutoCollapse) {
        setSidebarCollapsed(true);
      }
      compactLayoutRef.current = compactLayout;
      const effectiveSidebarWidth = shouldAutoCollapse || sidebarCollapsed
        ? SIDEBAR_COLLAPSED_WIDTH
        : SIDEBAR_EXPANDED_WIDTH;
      setChatWidth((currentWidth) => {
        const nextWidth = clampChatWidth(
          currentWidth,
          window.innerWidth,
          effectiveSidebarWidth,
        );
        if (nextWidth !== currentWidth) {
          saveChatWidth(nextWidth);
        }
        return nextWidth;
      });
    };

    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [sidebarCollapsed]);

  // 处理开始学习操作
  const handleStartStudy = useCallback((tag?: string) => {
    studyTagRef.current = tag;
    if (activePage === 'scroll') {
      // 已经在 scroll 页面，直接触发学习
      window.dispatchEvent(new CustomEvent('papyrus_start_study', { detail: { tag } }));
    } else {
      // 不在 scroll 页面，先切换页面
      pendingActionRef.current = 'startStudy';
      handlePageChange('scroll');
    }
  }, [activePage, handlePageChange]);

  const chatDragActiveRef = useRef(false);
  const onChatDragStart = useCallback((e: React.MouseEvent) => {
    dragStartX.current = e.clientX;
    dragStartWidth.current = chatWidth;
    chatDragActiveRef.current = true;
    setIsDragging(true);
    const cleanup = () => {
      chatDragActiveRef.current = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
    const onMove = (ev: MouseEvent) => {
      const delta = chatSide === 'left'
        ? ev.clientX - dragStartX.current
        : dragStartX.current - ev.clientX;
      const newWidth = clampChatWidth(
        dragStartWidth.current + delta,
        window.innerWidth,
        sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
      );
      setChatWidth(newWidth);
      saveChatWidth(newWidth);
    };
    const onUp = () => cleanup();
    const onLeave = () => cleanup();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.documentElement.addEventListener('mouseleave', onLeave);
  }, [chatSide, chatWidth, sidebarCollapsed]);

  // 页面标题映射
  const pageTitles: Record<string, string> = {
    start: t('app.pageTitles.start'),
    scroll: t('app.pageTitles.scroll'),
    notes: t('app.pageTitles.notes'),
    files: t('app.pageTitles.files'),
    settings: t('app.pageTitles.settings'),
  };

  // 更新文档标题
  useEffect(() => {
    document.title = 'Papyrus Desktop';
  }, [activePage]);

  // 渲染当前页面
  const renderPage = () => {
    const pages: Record<string, ReactNode> = {
      start: <StartPage onDoneChange={setTodayDone} onNavigate={handlePageChange} onStartStudy={handleStartStudy} onNewCard={() => handleNewAction('newCard')} />,
      scroll: (
        <ScrollPage
          initialTag={initialScrollTag}
          initialCardId={initialCardId}
          onInitialTagUsed={() => setInitialScrollTag(undefined)}
          onInitialCardIdUsed={() => setInitialCardId(undefined)}
        />
      ),
      notes: <NotesPage initialNoteId={initialNoteId} onInitialNoteIdUsed={() => setInitialNoteId(undefined)} />,
      files: <FilesPage initialFileId={initialFileId} onInitialFileIdUsed={() => setInitialFileId(undefined)} />,
      settings: <SettingsPage />,
    };

    const exitAnimationClass =
      animationDirection === 'up' ? 'motion-safe:tw-animate-page-exit-up' :
      animationDirection === 'down' ? 'motion-safe:tw-animate-page-exit-down' : '';

    const enterAnimationClass =
      animationDirection === 'up' ? 'motion-safe:tw-animate-page-up' :
      animationDirection === 'down' ? 'motion-safe:tw-animate-page-down' : '';

    const handleExitAnimationEnd = (e: React.AnimationEvent) => {
      if (e.animationName.includes('pageExitUp') || e.animationName.includes('pageExitDown')) {
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
          transitionTimeoutRef.current = null;
        }
        setPrevPage(null);
        if (nextPage) {
          setActivePage(nextPage);
          setNextPage(null);
        }
        setTimeout(() => {
          setIsTransitioning(false);
        }, 50);
      }
    };

    const handleEnterAnimationEnd = (e: React.AnimationEvent) => {
      if (!e.animationName.includes('pageSlideUp') && !e.animationName.includes('pageSlideDown')) {
        return;
      }
      setAnimationDirection(null);

      if (pendingActionRef.current) {
        const action = pendingActionRef.current;
        const tag = studyTagRef.current;
        if (action === 'newNote') {
          window.dispatchEvent(new CustomEvent('papyrus_new_note'));
        } else if (action === 'newCard') {
          window.dispatchEvent(new CustomEvent('papyrus_new_card'));
        } else if (action === 'startStudy') {
          window.dispatchEvent(new CustomEvent('papyrus_start_study', { detail: { tag } }));
        }
        pendingActionRef.current = null;
        studyTagRef.current = undefined;
      }
    };

    return (
      <>
        <div
          key={`page-${activePage}`}
          className={`tw-absolute tw-inset-0 tw-flex tw-flex-col ${isTransitioning && prevPage ? exitAnimationClass : (animationDirection ? enterAnimationClass : '')}`}
          onAnimationEnd={isTransitioning && prevPage ? handleExitAnimationEnd : (animationDirection ? handleEnterAnimationEnd : undefined)}
        >
          {pages[activePage]}
        </div>
        {isTransitioning && nextPage && (
          <div
            key={`next-${nextPage}`}
            className="tw-absolute tw-inset-0 tw-flex tw-flex-col"
            style={{
              opacity: 0,
              animation: animationDirection ? (animationDirection === 'up' ? 'pageSlideUp 0.25s ease-out forwards' : 'pageSlideDown 0.25s ease-out forwards') : 'none',
              animationDelay: '0.05s',
            }}
          >
            {pages[nextPage]}
          </div>
        )}
      </>
    );
  };

  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  const chatDockWidth = chatOpen ? chatWidth + 4 : 0;
  const chatHandleOffset = chatSide === 'left'
    ? sidebarWidth + (chatOpen ? chatWidth : 0)
    : (chatOpen ? chatWidth : 0);

  const renderChatPanel = () => (
    <div
      className="tw-relative tw-flex tw-flex-shrink-0 tw-overflow-hidden"
      style={{
        width: chatDockWidth,
        transition: isDragging ? 'none' : 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}
      role="complementary"
      aria-label={t('app.chatPanel')}
    >
      {chatSide === 'right' && (
        <div
          className="tw-flex-shrink-0 tw-w-1 tw-cursor-ew-resize hover:tw-bg-arco-border-2 tw-transition-colors tw-duration-200"
          onMouseDown={onChatDragStart}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('app.resizeChatPanel')}
          tabIndex={0}
        />
      )}
      {chatOpen && (
        <ChatPanel
          open={chatOpen}
          width={chatWidth}
          side={chatSide}
          onClose={() => setChatOpen(false)}
          requestedSessionId={requestedChatSessionId}
          onSessionActivated={handleChatSessionActivated}
          onSessionsChange={refreshChatSessions}
        />
      )}
      {chatSide === 'left' && (
        <div
          className="tw-flex-shrink-0 tw-w-1 tw-cursor-ew-resize hover:tw-bg-arco-border-2 tw-transition-colors tw-duration-200"
          onMouseDown={onChatDragStart}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('app.resizeChatPanel')}
          tabIndex={0}
        />
      )}
    </div>
  );

  return (
    <div className="app-shell tw-relative tw-flex tw-flex-col tw-mx-auto tw-w-full tw-h-screen tw-overflow-hidden tw-bg-transparent">
      {/* Skip Link - 无障碍导航（AA 级） */}
      <a
        href="#main-content"
        className="skip-link"
        aria-label={t('app.skipToMainContent')}
      >
        {t('app.skipToMainContent')}
      </a>

      {/* 返回顶部按钮 */}
      {activePage === 'start' && (
        <BackTop
          className="tw-absolute tw-bottom-12 tw-transition-[right] tw-duration-300 tw-ease-[ease]"
          visibleHeight={200}
          style={{ right: chatOpen && chatSide === 'right' ? chatWidth + 48 : 48 }}
          target={() => document.getElementById('start-page-scroll') ?? window as unknown as HTMLElement}
          aria-label={t('app.backToTop')}
        />
      )}

      {/* 标题栏 */}
      <TitleBar
        sidebarCollapsed={sidebarCollapsed}
        onSidebarToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onPageChange={handlePageChange}
        onSearchResult={handleSearchResult}
        onNewNote={() => handleNewAction('newNote')}
        onNewCard={() => handleNewAction('newCard')}
      />

      {/* 主体布局 */}
      {/* 主体单独铺不透明画布色，只让上方标题栏的透明像素显示系统 Acrylic。 */}
      <div className="app-workspace tw-flex tw-flex-1 tw-overflow-hidden tw-bg-arco-bg-canvas">
        {/* 侧边栏导航 */}
        <Sidebar
          collapsed={sidebarCollapsed}
          chatOpen={chatOpen}
          onChatToggle={() => setChatOpen(!chatOpen)}
          chatSide={chatSide}
          onChatSideToggle={handleChatSideToggle}
          activePage={activePage}
          onPageChange={handlePageChange}
          chatSessions={chatSessions}
          chatSessionsLoading={chatSessionsLoading}
          activeChatSessionId={activeChatSessionId}
          onNewChat={() => {
            void handleNewChat();
          }}
          onChatSessionSelect={handleChatSessionSelect}
          onChatSessionRename={handleChatSessionRename}
          onChatSessionGenerateTitle={handleChatSessionGenerateTitle}
          onChatSessionDelete={handleChatSessionDelete}
        />

        {chatSide === 'left' && renderChatPanel()}

        {/* 主内容区域 */}
        <main
          id="main-content"
          ref={mainContentRef}
          tabIndex={-1}
          className="tw-relative tw-flex-1 tw-flex tw-overflow-hidden tw-outline-none"
          role="main"
          aria-label={t('app.mainContentPage', { title: pageTitles[activePage] || t('app.mainContent') })}
        >
          {/* 页面内容 */}
          {renderPage()}
        </main>

        {/* 节标题导航（AAA 级） */}
        <SectionNavigation
          containerSelector="#main-content"
          minLevel={2}
          maxLevel={3}
        />

        {chatSide === 'right' && renderChatPanel()}
        <button
          className="tw-flex-shrink-0 tw-w-5 tw-h-16 tw-flex tw-items-center tw-justify-center tw-bg-arco-bg-1 tw-cursor-pointer tw-text-arco-text-3 hover:tw-bg-arco-fill-2 hover:tw-text-arco-text-1 tw-outline-none"
          style={{
            borderRadius: chatSide === 'left' ? '0 8px 8px 0' : '8px 0 0 8px',
            position: 'fixed',
            left: chatSide === 'left' ? chatHandleOffset : undefined,
            right: chatSide === 'right' ? chatHandleOffset : undefined,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            transition: isDragging ? 'none' : `${chatSide === 'left' ? 'left' : 'right'} 0.3s cubic-bezier(0.4,0,0.2,1)`,
            margin: 0,
            padding: 0,
            border: '1px solid var(--color-border-hairline)',
            boxShadow: 'var(--shadow-1)',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
          }}
          onClick={() => setChatOpen(!chatOpen)}
          aria-label={chatOpen ? t('app.collapseChatPanel') : t('app.expandChatPanel')}
        >
          <IconLeft
            style={{
              transform: chatSide === 'left'
                ? (chatOpen ? 'rotate(0deg)' : 'rotate(180deg)')
                : (chatOpen ? 'rotate(180deg)' : 'rotate(0deg)'),
              transition: 'transform 0.2s',
            }}
          />
        </button>
      </div>

      {/* 状态栏 */}
      <StatusBar />
    </div>
  );
};

export default App;
