import { useState } from 'react';
import { Tooltip, Modal, Message as ArcoMessage } from '@arco-design/web-react';
import {
  IconRefresh,
  IconEdit,
  IconCopy,
  IconDelete,
  IconTranslate,
  IconSave,
} from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import type { Message } from '../types';
import { api } from '../../api';
import { stripMdTitle } from '../utils';
import { authFetch } from '../utils';
import { copyToClipboard } from '../utils/clipboard';
import { TranslateModal } from './TranslateModal';

export interface MessageActionsProps {
  message: Message;
  isGenerating: boolean;
  messages: Message[];
  editingMessageId: string | null;
  modelId?: string;
  onStartEditing: (messageId: string, content: string) => void;
  onMessagesChange: React.Dispatch<React.SetStateAction<Message[]>>;
  onRegenerateAssistant: (assistantMessageId: string, parentUserMessageId: string) => Promise<void>;
  onRegenerateUser: (userMessageId: string, content: string, assistantMessageId?: string) => Promise<void>;
}

export function MessageActions({
  message,
  isGenerating,
  messages,
  editingMessageId,
  modelId,
  onStartEditing,
  onMessagesChange,
  onRegenerateAssistant,
  onRegenerateUser,
}: MessageActionsProps) {
  const { t } = useTranslation();
  const [translateVisible, setTranslateVisible] = useState(false);
  const isEditingCurrentMessage = editingMessageId === message.id;

  const handleRegenerate = () => {
    Modal.confirm({
      title: t('chatMessageActions.regenerateTitle'),
      content: t('chatMessageActions.regenerateConfirm'),
      onOk: async () => {
        const msgIndex = messages.findIndex((m) => m.id === message.id);
        if (msgIndex === -1) return;

        if (message.role === 'assistant') {
          const parentUser = msgIndex > 0 ? messages[msgIndex - 1] : null;
          if (!parentUser || parentUser.role !== 'user') {
            ArcoMessage.error(t('chatMessageActions.regenerateFailed'));
            return;
          }
          await onRegenerateAssistant(message.id, parentUser.id);
          return;
        }

        const followingAssistant = messages[msgIndex + 1]?.role === 'assistant'
          ? messages[msgIndex + 1]
          : undefined;
        await onRegenerateUser(
          message.id,
          message.content,
          followingAssistant?.id,
        );
      },
    });
  };

  const handleCopy = () => {
    void copyToClipboard(
      message.content,
      () => ArcoMessage.success(t('chatMessageActions.copied')),
      () => ArcoMessage.error(t('chatMessageActions.copyFailed')),
    );
  };

  const handleTranslate = () => {
    setTranslateVisible(true);
  };

  const handleSaveToNote = async () => {
    const msgIndex = messages.findIndex((m) => m.id === message.id);
    const userMsg = msgIndex > 0 && messages[msgIndex - 1]?.role === 'user' ? messages[msgIndex - 1] : null;
    const noteContent = userMsg
      ? `> **${t('chatMessageActions.userLabel')}：** ${userMsg.content}\n\n${message.content}`
      : message.content;
    const title = stripMdTitle(message.content).slice(0, 30) || t('chatMessageActions.untitledReply');

    try {
      const res = await api.createNote(title, t('chatMessageActions.noteFolder'), noteContent, ['ai-chat']);
      if (res.success) {
        ArcoMessage.success(t('chatMessageActions.savedToNotes'));
      } else {
        ArcoMessage.error(t('chatMessageActions.saveFailed'));
      }
    } catch {
      ArcoMessage.error(t('chatMessageActions.saveFailed'));
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: t('chatMessageActions.deleteTitle'),
      content: t('chatMessageActions.deleteConfirm'),
      onOk: async () => {
        const msgIndex = messages.findIndex((m) => m.id === message.id);
        if (msgIndex === -1) return;

        const idsToDelete = [message.id];
        if (message.role === 'user' && messages[msgIndex + 1]?.role === 'assistant') {
          idsToDelete.push(messages[msgIndex + 1].id);
        }

        await Promise.all(
          idsToDelete.map(async (id) => {
            try {
              await authFetch(`/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
            } catch {
              // ignore: message may not be persisted yet
            }
          }),
        );

        onMessagesChange((prev) => {
          const index = prev.findIndex((m) => m.id === message.id);
          if (index === -1) return prev;
          if (message.role === 'user' && prev[index + 1]?.role === 'assistant') {
            return prev.filter((_, idx) => idx !== index && idx !== index + 1);
          }
          return prev.filter((m) => m.id !== message.id);
        });
        ArcoMessage.success(t('chatMessageActions.deleteSuccess'));
      },
    });
  };

  if (message.role === 'user') {
    return (
      <div className="chat-message-actions">
        <Tooltip content={t('chatMessageActions.regenerate')} mini>
          <button
            className="chat-message-action-btn"
            aria-label={t('chatMessageActions.regenerate')}
            disabled={isGenerating}
            onClick={handleRegenerate}
          >
            <IconRefresh />
          </button>
        </Tooltip>
        <Tooltip content={t('chatMessageActions.edit')} mini>
          <button
            className="chat-message-action-btn"
            aria-label={t('chatMessageActions.edit')}
            disabled={isGenerating}
            onClick={() => onStartEditing(message.id, message.content)}
          >
            <IconEdit />
          </button>
        </Tooltip>
        <Tooltip content={t('chatMessageActions.copy')} mini>
          <button
            className="chat-message-action-btn"
            aria-label={t('chatMessageActions.copy')}
            disabled={isGenerating}
            onClick={handleCopy}
          >
            <IconCopy />
          </button>
        </Tooltip>
        <Tooltip content={t('chatMessageActions.delete')} mini>
          <button
            className="chat-message-action-btn"
            aria-label={t('chatMessageActions.delete')}
            disabled={isGenerating || isEditingCurrentMessage}
            onClick={handleDelete}
          >
            <IconDelete />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <>
      <div className="chat-message-actions">
        <Tooltip content={t('chatMessageActions.regenerate')} mini>
          <button
            className="chat-message-action-btn"
            aria-label={t('chatMessageActions.regenerate')}
            disabled={isGenerating}
            onClick={handleRegenerate}
          >
            <IconRefresh />
          </button>
        </Tooltip>
        <Tooltip content={t('chatMessageActions.edit')} mini>
          <button
            className="chat-message-action-btn"
            aria-label={t('chatMessageActions.edit')}
            disabled={isGenerating}
            onClick={() => onStartEditing(message.id, message.content)}
          >
            <IconEdit />
          </button>
        </Tooltip>
        <Tooltip content={t('chatMessageActions.copy')} mini>
          <button
            className="chat-message-action-btn"
            aria-label={t('chatMessageActions.copy')}
            disabled={isGenerating}
            onClick={handleCopy}
          >
            <IconCopy />
          </button>
        </Tooltip>
        <Tooltip content={t('chatMessageActions.translate')} mini>
          <button
            className="chat-message-action-btn"
            aria-label={t('chatMessageActions.translate')}
            disabled={isGenerating}
            onClick={handleTranslate}
          >
            <IconTranslate />
          </button>
        </Tooltip>
        <Tooltip content={t('chatMessageActions.saveToNotes')} mini>
          <button
            className="chat-message-action-btn"
            aria-label={t('chatMessageActions.saveToNotes')}
            disabled={isGenerating}
            onClick={() => { void handleSaveToNote(); }}
          >
            <IconSave />
          </button>
        </Tooltip>
        <Tooltip content={t('chatMessageActions.delete')} mini>
          <button
            className="chat-message-action-btn"
            aria-label={t('chatMessageActions.delete')}
            disabled={isGenerating || isEditingCurrentMessage}
            onClick={handleDelete}
          >
            <IconDelete />
          </button>
        </Tooltip>
      </div>
      <TranslateModal
        visible={translateVisible}
        sourceText={message.content}
        modelId={modelId}
        onClose={() => setTranslateVisible(false)}
      />
    </>
  );
}
