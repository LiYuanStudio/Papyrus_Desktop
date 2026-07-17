import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Input, Popconfirm, Spin, Tooltip, Trigger } from '@arco-design/web-react';
import { IconDelete, IconEdit, IconHistory } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import type { ChatSession } from '../api';

/**
 * 描述主侧边栏历史对话模块需要的会话摘要与管理回调。
 * 原因：会话数据由 App 统一加载，侧边栏只负责展示与发出意图，避免活动会话状态分叉。
 * 未在组件内直接请求 API：删除当前会话还会影响 ChatPanel，必须由 App 协调后端结果。
 */
interface SidebarChatHistoryProps {
  collapsed: boolean;
  sessions: ChatSession[];
  loading: boolean;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => Promise<boolean>;
  onDeleteSession: (sessionId: string) => Promise<boolean>;
}

/**
 * 在展开侧边栏内常驻展示历史，在收起状态通过右侧弹出菜单提供同一套会话管理能力。
 * 原因：收起侧边栏仍需保留恢复上下文的入口，而右侧菜单不会占用主内容的固定宽度。
 * 未复用聊天面板抽屉：抽屉位于窗口最右侧且依赖 ChatPanel 状态，不符合紧邻侧边栏的操作路径。
 */
export function SidebarChatHistory({
  collapsed,
  sessions,
  loading,
  activeSessionId,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
}: SidebarChatHistoryProps) {
  const { t } = useTranslation();
  const [menuVisible, setMenuVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  /**
   * 侧边栏展开后关闭收起态弹出菜单。
   * 原因：布局切换后菜单触发按钮不再可见，继续保留浮层会造成悬空界面。
   * 未依赖 Trigger 自动销毁：受控状态可同时保证键盘和程序化切换时行为一致。
   */
  useEffect(() => {
    if (!collapsed) {
      setMenuVisible(false);
    }
  }, [collapsed]);

  /**
   * 进入会话标题编辑状态并阻止点击穿透到会话切换按钮。
   * 原因：重命名是管理动作，不应同时打开或关闭该会话。
   * 未使用浏览器 prompt：内联输入保留主题样式、键盘焦点和无障碍标签。
   */
  const startEditing = (session: ChatSession, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setEditingId(session.id);
    setEditingTitle(session.title);
  };

  /**
   * 校验并提交会话标题，成功后退出编辑状态。
   * 原因：空标题不应发送到后端，且失败时保留输入方便用户修正或重试。
   * 未进行乐观改名：以 App 接收的后端会话对象为准，避免前后端标题短暂分叉。
   */
  const saveTitle = async (sessionId: string) => {
    const title = editingTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    const renamed = await onRenameSession(sessionId, title);
    if (renamed) {
      setEditingId(null);
    }
  };

  /**
   * 支持回车保存与 Escape 取消内联重命名。
   * 原因：侧边栏面向全键盘操作，管理菜单必须无需鼠标即可完成。
   * 未在失焦时自动保存：意外点击菜单外不应提交尚未确认的标题。
   */
  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>, sessionId: string) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveTitle(sessionId);
    } else if (event.key === 'Escape') {
      setEditingId(null);
    }
  };

  /**
   * 打开选中的会话，并在收起态关闭右侧菜单。
   * 原因：选择完成后主操作焦点应回到聊天面板，避免菜单继续遮挡内容。
   * 未无条件关闭：展开态没有浮层，保持常驻列表即可继续切换。
   */
  const selectSession = (sessionId: string) => {
    onSelectSession(sessionId);
    if (collapsed) {
      setMenuVisible(false);
    }
  };

  /**
   * 渲染展开态与右侧菜单共用的会话列表。
   * 原因：两种布局应拥有相同的选择、重命名、删除和活动状态反馈。
   * 未维护两份 JSX：共享渲染可防止后续功能只更新其中一种状态。
   */
  const renderHistoryList = () => (
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
          const isEditing = session.id === editingId;
          return (
            <div
              key={session.id}
              className={`sidebar-chat-history-item${isActive ? ' sidebar-chat-history-item-active' : ''}`}
            >
              {isEditing ? (
                <Input
                  className="sidebar-chat-history-title-input"
                  size="mini"
                  autoFocus
                  value={editingTitle}
                  maxLength={50}
                  onChange={setEditingTitle}
                  onKeyDown={(event) => handleTitleKeyDown(event, session.id)}
                  onBlur={() => setEditingId(null)}
                  aria-label={t('sidebar.renameConversation')}
                />
              ) : (
                <button
                  className="sidebar-chat-history-open"
                  type="button"
                  onClick={() => selectSession(session.id)}
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={t('sidebar.openConversation', { title: session.title })}
                  title={session.title}
                >
                  <span className="sidebar-chat-history-item-title">{session.title}</span>
                  {isActive && <span className="sidebar-chat-history-active-dot" aria-hidden="true" />}
                </button>
              )}

              {!isEditing && (
                <div className="sidebar-chat-history-actions">
                  <Tooltip content={t('sidebar.renameConversation')} mini>
                    <button
                      className="sidebar-chat-history-action"
                      type="button"
                      onClick={(event) => startEditing(session, event)}
                      aria-label={t('sidebar.renameConversation')}
                    >
                      <IconEdit aria-hidden="true" />
                    </button>
                  </Tooltip>
                  <Popconfirm
                    title={t('sidebar.deleteConversation')}
                    content={t('sidebar.confirmDeleteConversation', { title: session.title })}
                    onOk={() => onDeleteSession(session.id)}
                    position="right"
                  >
                    <Tooltip content={t('sidebar.deleteConversation')} mini>
                      <button
                        className="sidebar-chat-history-action sidebar-chat-history-action-danger"
                        type="button"
                        onClick={(event) => event.stopPropagation()}
                        aria-label={t('sidebar.deleteConversation')}
                      >
                        <IconDelete aria-hidden="true" />
                      </button>
                    </Tooltip>
                  </Popconfirm>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  if (collapsed) {
    return (
      <>
        <Trigger
          trigger="click"
          position="right"
          popupVisible={menuVisible}
          onVisibleChange={setMenuVisible}
          showArrow={false}
          popup={() => (
            <section
              className="sidebar-chat-history-menu"
              aria-labelledby="sidebar-chat-history-menu-title"
            >
              <div className="sidebar-chat-history-menu-header">
                <IconHistory aria-hidden="true" />
                <span id="sidebar-chat-history-menu-title">{t('sidebar.chatHistory')}</span>
              </div>
              {renderHistoryList()}
            </section>
          )}
        >
          <button
            className="sidebar-item sidebar-chat-history-trigger"
            type="button"
            aria-label={t('sidebar.chatHistory')}
            aria-expanded={menuVisible}
            title={t('sidebar.chatHistory')}
          >
            <span className="sidebar-icon"><IconHistory /></span>
          </button>
        </Trigger>
        <div className="sidebar-chat-history-spacer" aria-hidden="true" />
      </>
    );
  }

  return (
    <section className="sidebar-chat-history" aria-labelledby="sidebar-chat-history-title">
      <div className="sidebar-chat-history-header">
        <div className="sidebar-chat-history-heading">
          <IconHistory aria-hidden="true" />
          <span id="sidebar-chat-history-title">{t('sidebar.chatHistory')}</span>
        </div>
      </div>
      {renderHistoryList()}
    </section>
  );
}
