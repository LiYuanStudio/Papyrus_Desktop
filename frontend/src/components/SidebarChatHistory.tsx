import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Input, Spin, Tooltip, Trigger } from '@arco-design/web-react';
import { IconDelete, IconEdit, IconHistory, IconRobot } from '@arco-design/web-react/icon';
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
  onGenerateTitle: (sessionId: string) => Promise<boolean>;
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
  onGenerateTitle,
  onDeleteSession,
}: SidebarChatHistoryProps) {
  const { t } = useTranslation();
  const [menuVisible, setMenuVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingTitleIds, setGeneratingTitleIds] = useState<Set<string>>(() => new Set());

  /**
   * 侧边栏布局切换后关闭收起态弹出菜单，并撤销尚未执行的删除确认。
   * 原因：布局切换后原触发按钮可能消失，保留浮层或已武装的删除态都会造成悬空界面。
   * 未依赖 Trigger 自动销毁：受控状态可同时保证键盘和程序化切换时行为一致。
   */
  useEffect(() => {
    if (!collapsed) {
      setMenuVisible(false);
    }
    setDeleteConfirmationId(null);
  }, [collapsed]);

  /**
   * 在确认胶囊之外发生指针或焦点移动时撤销危险操作，并让 Escape 在焦点意外丢失时仍然有效。
   * 原因：Tooltip 和条件渲染可能调整触发节点，单靠按钮 blur 会把首次点击本身误判为离开。
   * 未监听普通 click：pointerdown 更早识别外部目标，不会与随后发生的第二次确认 click 竞争。
   */
  useEffect(() => {
    if (deleteConfirmationId === null || deletingId !== null) {
      return undefined;
    }

    const isInsideConfirmation = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        return false;
      }
      const confirmation = target.closest('[data-delete-confirmation-session-id]');
      return confirmation?.getAttribute('data-delete-confirmation-session-id')
        === deleteConfirmationId;
    };
    const cancelFromOutside = (event: PointerEvent | FocusEvent) => {
      if (!isInsideConfirmation(event.target)) {
        setDeleteConfirmationId(null);
      }
    };
    const cancelFromEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDeleteConfirmationId(null);
      }
    };

    document.addEventListener('pointerdown', cancelFromOutside, true);
    document.addEventListener('focusin', cancelFromOutside, true);
    document.addEventListener('keydown', cancelFromEscape);
    return () => {
      document.removeEventListener('pointerdown', cancelFromOutside, true);
      document.removeEventListener('focusin', cancelFromOutside, true);
      document.removeEventListener('keydown', cancelFromEscape);
    };
  }, [deleteConfirmationId, deletingId]);

  /**
   * 进入会话标题编辑状态并阻止点击穿透到会话切换按钮。
   * 原因：重命名是管理动作，不应同时打开或关闭该会话。
   * 未使用浏览器 prompt：内联输入保留主题样式、键盘焦点和无障碍标签。
   */
  const startEditing = (session: ChatSession, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDeleteConfirmationId(null);
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
    setDeleteConfirmationId(null);
    onSelectSession(sessionId);
    if (collapsed) {
      setMenuVisible(false);
    }
  };

  /**
   * 将删除图标切换为原位确认胶囊，第二次点击才调用真正的删除回调。
   * 原因：把二次确认放在原操作区可避免弹窗打断，同时必须用 deletingId 阻止快速连点重复提交。
   * 未进行乐观删除：父组件需要根据后端结果协调活动会话，失败时应保留当前会话并允许重试。
   */
  const handleDeleteAction = async (
    session: ChatSession,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    if (deletingId !== null) {
      return;
    }
    if (deleteConfirmationId !== session.id) {
      setDeleteConfirmationId(session.id);
      return;
    }

    setDeletingId(session.id);
    try {
      const deleted = await onDeleteSession(session.id);
      if (deleted) {
        setDeleteConfirmationId(null);
      }
    } catch {
      // 父回调按约定负责展示错误；此处保留确认态，方便用户直接重试。
      // 未再次显示消息：避免与 App 层的统一错误提示重复。
    } finally {
      setDeletingId((currentId) => (currentId === session.id ? null : currentId));
    }
  };

  /**
   * 为单个会话触发 AI 重新命名，并仅锁定该行的 AI 操作。
   * 原因：不同会话的标题生成彼此独立，不应因一个慢请求冻结全部历史管理。
   * 未直接调用 API：App 需要合并服务端会话对象，保证展开与收起视图共享同一状态。
   */
  const handleGenerateTitle = async (
    sessionId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    if (generatingTitleIds.has(sessionId)) {
      return;
    }
    setGeneratingTitleIds((current) => new Set(current).add(sessionId));
    try {
      await onGenerateTitle(sessionId);
    } finally {
      setGeneratingTitleIds((current) => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
    }
  };

  /**
   * 允许键盘用户用 Escape 撤销已经展开的删除胶囊。
   * 原因：确认态没有自动超时，必须提供无需移动焦点的明确退出路径。
   * 未让 Escape 关闭整个历史菜单：该按键只撤销当前危险操作，避免丢失浏览上下文。
   */
  const handleDeleteKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    sessionId: string,
  ) => {
    if (event.key === 'Escape' && deleteConfirmationId === sessionId && deletingId === null) {
      event.preventDefault();
      event.stopPropagation();
      setDeleteConfirmationId(null);
    }
  };

  /**
   * 同步收起态历史菜单的可见性，并在菜单关闭时撤销删除确认。
   * 原因：再次打开菜单不应保留上一次未完成的危险操作。
   * 未通过定时器复原：用户选择以失焦或 Escape 取消，不引入不可预期的确认时限。
   */
  const handleMenuVisibleChange = (visible: boolean) => {
    setMenuVisible(visible);
    if (!visible) {
      setDeleteConfirmationId(null);
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
          const isDeleteConfirming = session.id === deleteConfirmationId;
          const isDeleting = session.id === deletingId;
          const isGeneratingTitle = generatingTitleIds.has(session.id);
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
                </button>
              )}

              {!isEditing && (
                <div
                  className={`sidebar-chat-history-actions${
                    isDeleteConfirming ? ' sidebar-chat-history-actions-confirming' : ''
                  }`}
                  data-delete-confirmation-session-id={
                    isDeleteConfirming ? session.id : undefined
                  }
                >
                  {!isDeleteConfirming && (
                    <>
                      <Tooltip key="ai-rename" content={t('sidebar.aiRenameConversation')} mini>
                        <button
                          className="sidebar-chat-history-action"
                          type="button"
                          onClick={(event) => {
                            void handleGenerateTitle(session.id, event);
                          }}
                          aria-label={t('sidebar.aiRenameConversation')}
                          aria-busy={isGeneratingTitle || undefined}
                          disabled={isGeneratingTitle}
                        >
                          {isGeneratingTitle ? <Spin size={12} /> : <IconRobot aria-hidden="true" />}
                        </button>
                      </Tooltip>
                      <Tooltip key="rename" content={t('sidebar.renameConversation')} mini>
                        <button
                          className="sidebar-chat-history-action"
                          type="button"
                          onClick={(event) => startEditing(session, event)}
                          aria-label={t('sidebar.renameConversation')}
                        >
                          <IconEdit aria-hidden="true" />
                        </button>
                      </Tooltip>
                    </>
                  )}
                  <Tooltip key="delete" content={t('sidebar.deleteConversation')} mini>
                    <button
                      className={`sidebar-chat-history-action sidebar-chat-history-action-danger${
                        isDeleteConfirming
                          ? ' sidebar-chat-history-action-danger-confirming danger-confirm-pill'
                          : ''
                      }`}
                      type="button"
                      onClick={(event) => {
                        void handleDeleteAction(session, event);
                      }}
                      onKeyDown={(event) => handleDeleteKeyDown(event, session.id)}
                      aria-label={
                        isDeleteConfirming
                          ? t('sidebar.confirmDeleteConversation', { title: session.title })
                          : t('sidebar.deleteConversation')
                      }
                      aria-busy={isDeleting || undefined}
                      disabled={isDeleting}
                    >
                      {isDeleteConfirming ? (
                        <span className="sidebar-chat-history-delete-label">
                          {t('common.delete')}
                        </span>
                      ) : (
                        <IconDelete aria-hidden="true" />
                      )}
                    </button>
                  </Tooltip>
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
          onVisibleChange={handleMenuVisibleChange}
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
