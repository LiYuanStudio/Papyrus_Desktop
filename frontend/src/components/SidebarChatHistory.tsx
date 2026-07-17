import { Spin } from '@arco-design/web-react';
import { IconHistory, IconPlus } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import type { ChatSession } from '../api';

/**
 * 描述主侧边栏历史对话模块需要的会话摘要与交互回调。
 * 原因：会话数据由 App 统一加载，侧边栏只负责展示，避免出现两个互不一致的活动会话状态。
 * 未在组件内直接请求 API：父层还需要把同一次切换同步给 ChatPanel，集中协调更容易保持一致。
 */
interface SidebarChatHistoryProps {
  collapsed: boolean;
  sessions: ChatSession[];
  loading: boolean;
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
}

/**
 * 在展开的主侧边栏中展示类似 Codex App 的最近对话列表。
 * 原因：用户可以从全局导航直接恢复上下文，不必先打开聊天面板再进入抽屉。
 * 未复用 ChatHistory 抽屉：抽屉包含重命名和删除等重型操作，不适合常驻窄侧栏。
 */
export function SidebarChatHistory({
  collapsed,
  sessions,
  loading,
  activeSessionId,
  onNewChat,
  onSelectSession,
}: SidebarChatHistoryProps) {
  const { t } = useTranslation();

  if (collapsed) {
    return <div className="sidebar-chat-history-spacer" aria-hidden="true" />;
  }

  return (
    <section className="sidebar-chat-history" aria-labelledby="sidebar-chat-history-title">
      <div className="sidebar-chat-history-header">
        <div className="sidebar-chat-history-heading">
          <IconHistory aria-hidden="true" />
          <span id="sidebar-chat-history-title">{t('sidebar.chatHistory')}</span>
        </div>
        <button
          className="sidebar-chat-history-new"
          type="button"
          onClick={onNewChat}
          aria-label={t('sidebar.newChat')}
          title={t('sidebar.newChat')}
        >
          <IconPlus />
        </button>
      </div>

      <div className="sidebar-chat-history-list" aria-live="polite">
        {loading ? (
          <div className="sidebar-chat-history-state">
            <Spin size={14} />
            <span>{t('sidebar.loadingChatHistory')}</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="sidebar-chat-history-state">{t('sidebar.noChatHistory')}</div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <button
                key={session.id}
                className={`sidebar-chat-history-item${isActive ? ' sidebar-chat-history-item-active' : ''}`}
                type="button"
                onClick={() => onSelectSession(session.id)}
                aria-current={isActive ? 'true' : undefined}
                aria-label={t('sidebar.openConversation', { title: session.title })}
                title={session.title}
              >
                <span className="sidebar-chat-history-item-title">{session.title}</span>
                {isActive && <span className="sidebar-chat-history-active-dot" aria-hidden="true" />}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
