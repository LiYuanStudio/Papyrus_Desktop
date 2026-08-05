import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import { IconPlus, IconFolder, IconMindMapping, IconSettings, IconLock, IconUnlock, IconMoon, IconSun, IconRobot, IconCalendarClock } from '@arco-design/web-react/icon';
import IconPapyrus from './icons/IconPapyrus';
import IconScroll from './icons/IconScroll';
import { SidebarChatHistory } from './components/SidebarChatHistory';
import type { ChatPanelSide, ChatSession } from './api';
import './Sidebar.css';

/**
 * 描述全局导航、聊天面板与历史会话之间的受控交互。
 * 原因：App 同时协调主内容与聊天面板，Sidebar 保持为纯导航组件可避免状态分叉。
 * 未在此处加载会话：直接请求会让侧边栏和 ChatPanel 各自维护活动会话，切换时容易不同步。
 */
interface SidebarProps {
  collapsed: boolean;
  chatOpen: boolean;
  onChatToggle: () => void;
  chatSide: ChatPanelSide;
  onChatSideToggle: () => void;
  activePage: string;
  onPageChange: (key: string) => void;
  chatSessions: ChatSession[];
  chatSessionsLoading: boolean;
  activeChatSessionId: string | null;
  onNewChat: () => void;
  onChatSessionSelect: (sessionId: string) => void;
  onChatSessionRename: (sessionId: string, title: string) => Promise<boolean>;
  onChatSessionGenerateTitle: (sessionId: string) => Promise<boolean>;
  onChatSessionDelete: (sessionId: string) => Promise<boolean>;
}

const ChatSideIcon = ({ side }: { side: ChatPanelSide }) => (
  <svg
    className={`sidebar-chat-side-icon sidebar-chat-side-icon-${side}`}
    width="24"
    height="24"
    viewBox="0 0 48 48"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M42 10a2 2 0 00-2-2H8a2 2 0 00-2 2v28a2 2 0 002 2h32a2 2 0 002-2V10z"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      className="sidebar-chat-side-icon-divider"
      d="M19 40V8"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);

const Sidebar = ({
  collapsed,
  chatOpen,
  onChatToggle,
  chatSide,
  onChatSideToggle,
  activePage,
  onPageChange,
  chatSessions,
  chatSessionsLoading,
  activeChatSessionId,
  onNewChat,
  onChatSessionSelect,
  onChatSessionRename,
  onChatSessionGenerateTitle,
  onChatSessionDelete,
}: SidebarProps) => {
  const { t } = useTranslation();

  const items = [
    { key: 'scroll', icon: IconScroll, label: t('sidebar.scroll') },
    { key: 'notes', icon: IconMindMapping, label: t('sidebar.notes') },
    { key: 'files', icon: IconFolder, label: t('sidebar.files') },
    { key: 'automations', icon: IconCalendarClock, label: t('sidebar.automations') },
  ];

  const [locked, setLocked] = useState(false);
  const [dark, setDark] = useState(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (dark) {
      document.body.setAttribute('arco-theme', 'dark');
      // body 保持透明，让 Windows DWM 材质能从标题栏的透明像素透出；正文由 App 主体容器单独铺底。
      // 未继续在 body 使用画布色：body 覆盖整个窗口，会在合成阶段完全遮住原生 Acrylic。
      document.body.style.backgroundColor = 'transparent';
      document.body.style.color = 'var(--color-text-1)';
      document.body.style.colorScheme = 'dark';
    } else {
      document.body.removeAttribute('arco-theme');
      document.body.style.backgroundColor = 'transparent';
      document.body.style.color = '';
      document.body.style.colorScheme = '';
    }
  }, [dark]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleDark = () => setDark(!dark);

  // 锁定/解锁编辑状态变更时触发事件
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('papyrus_edit_lock_changed', {
      detail: { locked }
    }));
  }, [locked]);

  return (
    <nav className={`sidebar${collapsed ? '' : ' sidebar-expanded'}`} aria-label="主导航">
      <Tooltip content={t('sidebar.start')} position="right" mini disabled={!collapsed}>
        <button
          className={`sidebar-item${activePage === 'start' ? ' sidebar-item-active' : ''}`}
          onClick={() => onPageChange('start')}
          aria-current={activePage === 'start' ? 'page' : undefined}
          aria-label={t('sidebar.start')}
          type="button"
        >
          <span className="sidebar-icon"><IconPapyrus /></span>
          <span className="sidebar-label">{t('sidebar.start')}</span>
        </button>
      </Tooltip>
      <Tooltip content={t('sidebar.newChat')} position="right" mini disabled={!collapsed}>
        <button
          className="sidebar-item"
          onClick={onNewChat}
          aria-label={t('sidebar.newChat')}
          type="button"
        >
          <span className="sidebar-icon"><IconPlus /></span>
          <span className="sidebar-label">{t('sidebar.newChat')}</span>
        </button>
      </Tooltip>
      {items.map((item) => {
        const IconComponent = item.icon;
        return (
          <Tooltip key={item.key} content={item.label} position="right" mini disabled={!collapsed}>
            <button
              className={`sidebar-item${activePage === item.key ? ' sidebar-item-active' : ''}`}
              onClick={() => onPageChange(item.key)}
              aria-current={activePage === item.key ? 'page' : undefined}
              aria-label={item.label}
              type="button"
            >
              <span className="sidebar-icon"><IconComponent /></span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          </Tooltip>
        );
      })}
      <SidebarChatHistory
        collapsed={collapsed}
        sessions={chatSessions}
        loading={chatSessionsLoading}
        activeSessionId={activeChatSessionId}
        onSelectSession={onChatSessionSelect}
        onRenameSession={onChatSessionRename}
        onGenerateTitle={onChatSessionGenerateTitle}
        onDeleteSession={onChatSessionDelete}
      />
      <Tooltip
        content={chatSide === 'left' ? t('sidebar.switchChatPanelRight') : t('sidebar.switchChatPanelLeft')}
        position="right"
        mini
        disabled={!collapsed}
      >
        <button
          className="sidebar-item"
          onClick={onChatSideToggle}
          aria-label={chatSide === 'left' ? t('sidebar.switchChatPanelRight') : t('sidebar.switchChatPanelLeft')}
          aria-pressed={chatSide === 'left'}
          type="button"
        >
          <span className="sidebar-icon"><ChatSideIcon side={chatSide} /></span>
          <span className="sidebar-label">{chatSide === 'left' ? t('sidebar.chatPanelLeft') : t('sidebar.chatPanelRight')}</span>
        </button>
      </Tooltip>
      <Tooltip content={t('sidebar.chat')} position="right" mini disabled={!collapsed}>
        <button 
          className={`sidebar-item${chatOpen ? ' sidebar-item-active' : ''}`} 
          onClick={onChatToggle}
          aria-label={chatOpen ? t('sidebar.closeChat') : t('sidebar.openChat')}
          aria-pressed={chatOpen}
          type="button"
        >
          <span className="sidebar-icon"><IconRobot /></span>
          <span className="sidebar-label">{t('sidebar.chat')}</span>
        </button>
      </Tooltip>
      <Tooltip content={dark ? t('sidebar.switchToLight') : t('sidebar.switchToDark')} position="right" mini disabled={!collapsed}>
        <button 
          className="sidebar-item" 
          onClick={toggleDark}
          aria-label={dark ? t('sidebar.switchToLight') : t('sidebar.switchToDark')}
          aria-pressed={dark}
          type="button"
        >
          <span className="sidebar-icon">{dark ? <IconMoon /> : <IconSun />}</span>
          <span className="sidebar-label">{dark ? t('sidebar.darkMode') : t('sidebar.lightMode')}</span>
        </button>
      </Tooltip>
      <Tooltip content={locked ? t('sidebar.unlockEdit') : t('sidebar.lockEdit')} position="right" mini disabled={!collapsed}>
        <button
          className="sidebar-item"
          onClick={() => setLocked(!locked)}
          aria-label={locked ? t('sidebar.unlockEdit') : t('sidebar.lockEdit')}
          aria-pressed={locked}
          type="button"
        >
          <span className="sidebar-icon">{locked ? <IconLock /> : <IconUnlock />}</span>
          <span className="sidebar-label">{locked ? t('sidebar.lockEdit') : t('sidebar.unlockEdit')}</span>
        </button>
      </Tooltip>
      <Tooltip content={t('sidebar.settings')} position="right" mini disabled={!collapsed}>
        <button
          className={`sidebar-item${activePage === 'settings' ? ' sidebar-item-active' : ''}`}
          onClick={() => onPageChange('settings')}
          aria-current={activePage === 'settings' ? 'page' : undefined}
          aria-label={t('sidebar.settings')}
          type="button"
        >
          <span className="sidebar-icon"><IconSettings /></span>
          <span className="sidebar-label">{t('sidebar.settings')}</span>
        </button>
      </Tooltip>
    </nav>
  );
};

export default Sidebar;
