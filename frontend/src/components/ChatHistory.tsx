import { useState, useEffect } from 'react';
import { Drawer, List, Input, Tooltip, Popconfirm, Message as ArcoMessage, Empty } from '@arco-design/web-react';
import { IconPlus, IconEdit, IconDelete, IconHistory } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import type { ChatSession } from '../api';
import i18n from '../i18n';
import './ChatHistory.css';

interface ChatHistoryProps {
  visible: boolean;
  onClose: () => void;
  currentSessionId?: string;
  sessions: ChatSession[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  onSwitchSession: (sessionId: string) => void | Promise<void>;
  onCreateSession: () => void | Promise<void>;
  onClearAll: () => void | Promise<void>;
}

export const ChatHistory = ({
  visible,
  onClose,
  currentSessionId,
  sessions,
  loading,
  onRefresh,
  onSwitchSession,
  onCreateSession,
  onClearAll,
}: ChatHistoryProps) => {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [renamingTitles, setRenamingTitles] = useState<Record<string, string>>({});

  // 可见时刷新数据
  useEffect(() => {
    if (visible) {
      void onRefresh();
    }
  }, [visible, onRefresh]);

  // 切换会话
  const handleSwitchSession = async (sessionId: string) => {
    if (sessionId === currentSessionId) {
      onClose();
      return;
    }
    await onSwitchSession(sessionId);
    onClose();
  };

  // 创建新会话
  const handleCreateSession = async () => {
    await onCreateSession();
    onClose();
  };

  // 清空所有会话
  const handleClearAll = async () => {
    await onClearAll();
  };

  // 开始编辑会话标题
  const startEditing = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditingTitle(session.title);
  };

  // 保存会话标题
  const saveSessionTitle = async (sessionId: string) => {
    const trimmedTitle = editingTitle.trim();
    if (!trimmedTitle) {
      setEditingId(null);
      return;
    }
    try {
      const res = await api.renameChatSession(sessionId, trimmedTitle);
      if (res.success) {
        setRenamingTitles((prev) => ({ ...prev, [sessionId]: trimmedTitle }));
        ArcoMessage.success(i18n.t('chatHistory.renameSuccess'));
        await onRefresh();
      }
    } catch (error) {
      console.error('Failed to rename session:', error);
      ArcoMessage.error(i18n.t('chatHistory.renameFailed'));
    } finally {
      setEditingId(null);
    }
  };

  // 删除会话
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.deleteChatSession(sessionId);
      if (res.success) {
        ArcoMessage.success(i18n.t('chatHistory.deleteSuccess'));
        if (sessionId === currentSessionId && res.activeSessionId) {
          await onSwitchSession(res.activeSessionId);
        }
        await onRefresh();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      ArcoMessage.error(t('chatHistory.deleteFailed'));
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const day = 24 * 60 * 60 * 1000;
    const locale = i18n.language || 'zh-CN';

    if (diff < day && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 2 * day) {
      return t('chatHistory.yesterday');
    } else if (diff < 7 * day) {
      return date.toLocaleDateString(locale, { weekday: 'short' });
    } else {
      return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent, sessionId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void saveSessionTitle(sessionId);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  return (
    <Drawer
      title={null}
      visible={visible}
      onCancel={onClose}
      placement="right"
      width={320}
      closable={false}
      maskClosable={true}
      className="chat-history-drawer"
      footer={null}
    >
      <div className="chat-history-header">
        <div className="chat-history-title">
          <IconHistory className="chat-history-title-icon" />
          <span>会话历史</span>
        </div>
        <div className="chat-history-header-actions">
          <Tooltip content="新建会话" mini>
            <button
              type="button"
              className="chat-history-new-btn"
              onClick={handleCreateSession}
              aria-label="新建会话"
            >
              <IconPlus />
            </button>
          </Tooltip>
          <Popconfirm
            title="清空所有会话"
            content="确定清空全部会话吗？此操作不可恢复。"
            onOk={handleClearAll}
            position="bottom"
          >
            <Tooltip content="清空全部" mini>
              <button
                type="button"
                className="chat-history-new-btn chat-history-action-btn-danger"
                aria-label="清空全部会话"
                disabled={sessions.length === 0}
              >
                <IconDelete />
              </button>
            </Tooltip>
          </Popconfirm>
        </div>
      </div>

      <div className="chat-history-body">
        {sessions.length === 0 && !loading ? (
          <div className="chat-history-empty">
            <Empty description="暂无会话记录" />
          </div>
        ) : (
          <List
            dataSource={sessions}
            loading={loading}
            render={(session) => {
              const displayTitle = renamingTitles[session.id] ?? session.title;
              return (
                <div
                  className={`chat-history-item ${
                    session.id === currentSessionId ? 'chat-history-item-active' : ''
                  }`}
                  onClick={() => handleSwitchSession(session.id)}
                >
                  <div className="chat-history-item-content">
                    {editingId === session.id ? (
                      <Input
                        size="small"
                        autoFocus
                        value={editingTitle}
                        onChange={setEditingTitle}
                        onBlur={() => saveSessionTitle(session.id)}
                        onKeyDown={(e) => handleKeyDown(e, session.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="chat-history-item-input"
                        maxLength={50}
                      />
                    ) : (
                      <>
                        <div className="chat-history-item-title">{displayTitle}</div>
                        <div className="chat-history-item-meta">
                          <span>{formatTime(session.updatedAt)}</span>
                          <span className="chat-history-item-dot">·</span>
                          <span>{session.messageCount} 条消息</span>
                        </div>
                      </>
                    )}
                  </div>

                  {editingId !== session.id && (
                    <div className="chat-history-item-actions">
                      <Tooltip content="重命名" mini>
                        <button
                          type="button"
                          className="chat-history-action-btn"
                          onClick={(e) => startEditing(session, e)}
                          aria-label="重命名会话"
                        >
                          <IconEdit />
                        </button>
                      </Tooltip>
                      <Popconfirm
                        title="确认删除"
                        content="确定要删除这个会话吗？此操作不可恢复。"
                        onOk={(e) => handleDeleteSession(session.id, e as unknown as React.MouseEvent)}
                        onCancel={(e) => (e as unknown as React.MouseEvent | undefined)?.stopPropagation()}
                        position="bottom"
                      >
                        <Tooltip content="删除" mini>
                          <button
                            type="button"
                            className="chat-history-action-btn chat-history-action-btn-danger"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="删除会话"
                          >
                            <IconDelete />
                          </button>
                        </Tooltip>
                      </Popconfirm>
                    </div>
                  )}
                </div>
              );
            }}
          />
        )}
      </div>
    </Drawer>
  );
};

export default ChatHistory;
