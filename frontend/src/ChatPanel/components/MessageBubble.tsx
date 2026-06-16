import { Avatar, Button } from '@arco-design/web-react';
import type { Message, MessageBlock, UserProfile } from '../types';
import { MarkdownView } from '../../components/MarkdownView';
import { ReasoningChain } from '../../components/ReasoningChain';
import { ToolCallCard } from '../../components/ToolCallCard';
import { MessageActions } from './MessageActions';

export interface MessageBubbleProps {
  message: Message;
  messages: Message[];
  userProfile: UserProfile;
  selectedModelName?: string;
  modelId?: string;
  isGenerating: boolean;
  editingMessageId: string | null;
  editingDraft: string;
  onMessagesChange: React.Dispatch<React.SetStateAction<Message[]>>;
  onEditingMessageIdChange: (id: string | null) => void;
  onEditingDraftChange: (draft: string) => void;
  onStartEditing: (messageId: string, content: string) => void;
  onSendMessage: () => void;
  onTextOverride: (text: string) => void;
  onToolApprove: (messageId: string, toolName: string, callId?: string) => void;
  onToolReject: (messageId: string, toolName: string, callId?: string) => void;
}

export function MessageBubble({
  message,
  messages,
  userProfile,
  selectedModelName,
  modelId,
  isGenerating,
  editingMessageId,
  editingDraft,
  onMessagesChange,
  onEditingMessageIdChange,
  onEditingDraftChange,
  onStartEditing,
  onSendMessage,
  onTextOverride,
  onToolApprove,
  onToolReject,
}: MessageBubbleProps) {
  const renderMessageBlock = (block: MessageBlock, blockKey: string) => {
    switch (block.type) {
      case 'reasoning':
        return (
          <ReasoningChain
            key={`reasoning-${blockKey}`}
            content={block.content || ''}
            defaultExpanded={false}
          />
        );

      case 'tool_call':
        return (
          <ToolCallCard
            key={`tool-${blockKey}-${block.toolName}`}
            toolName={block.toolName || '未知工具'}
            status={block.toolStatus || 'pending'}
            params={block.toolParams}
            result={block.toolResult}
            error={block.toolError}
            onApprove={() => onToolApprove(message.id, block.toolName || '', block.toolCallId)}
            onReject={() => onToolReject(message.id, block.toolName || '', block.toolCallId)}
            expanded={block.toolStatus === 'pending' || block.toolStatus === 'executing' || block.toolStatus === 'failed'}
          />
        );

      default:
        return null;
    }
  };

  if (message.role === 'user') {
    return (
      <div className="chat-message-with-avatar">
        <Avatar
          size={28}
          className="tw-flex-shrink-0 chat-user-avatar"
          style={{
            backgroundColor: userProfile.avatarUrl ? 'transparent' : '#206CCF',
          }}
        >
          {userProfile.avatarUrl ? (
            <img
              src={userProfile.avatarUrl}
              alt="avatar"
              className="chat-user-avatar-img"
            />
          ) : (
            userProfile.userId?.charAt(0)?.toUpperCase() || '?'
          )}
        </Avatar>
        {editingMessageId === message.id ? (
          <div className="chat-message-bubble chat-edit-bubble">
            <textarea
              className="chat-textarea chat-edit-textarea-user"
              value={editingDraft}
              onChange={(e) => onEditingDraftChange(e.target.value)}
              autoFocus
              rows={3}
              aria-label="编辑消息"
            />
            <div className="chat-edit-actions">
              <Button size="mini" onClick={() => onEditingMessageIdChange(null)}>
                取消
              </Button>
              <Button
                size="mini"
                type="primary"
                onClick={() => {
                  const msgIndex = messages.findIndex((m) => m.id === message.id);
                  onMessagesChange((prev) => prev.slice(0, msgIndex));
                  onTextOverride(editingDraft);
                  onEditingMessageIdChange(null);
                  onSendMessage();
                }}
              >
                保存
              </Button>
            </div>
          </div>
        ) : (
          <div className="chat-message-bubble">
            <MarkdownView source={message.content} compact />
          </div>
        )}
        <MessageActions
          message={message}
          isGenerating={isGenerating}
          messages={messages}
          editingMessageId={editingMessageId}
          onStartEditing={onStartEditing}
          onMessagesChange={onMessagesChange}
          onSendMessage={onSendMessage}
          onTextOverride={onTextOverride}
        />
      </div>
    );
  }

  const displayModelName =
    selectedModelName ??
    (message.model?.includes(':')
      ? message.model.split(':').slice(1).join(':')
      : message.model) ??
    (modelId?.includes(':')
      ? modelId.split(':').slice(1).join(':')
      : modelId);

  return (
    <div className="chat-message-with-avatar tw-items-start">
      <span className="chat-message-model-label">{displayModelName}</span>
      <div className="chat-message-blocks">
        {message.blocks?.map((block, idx) =>
          renderMessageBlock(block, `${message.id}-${idx}`),
        )}
      </div>
      {editingMessageId === message.id ? (
        <div className="chat-message-bubble chat-edit-bubble">
          <textarea
            className="chat-textarea chat-edit-textarea-assistant"
            value={editingDraft}
            onChange={(e) => onEditingDraftChange(e.target.value)}
            autoFocus
            rows={5}
            aria-label="编辑消息"
          />
          <div className="chat-edit-actions">
            <Button size="mini" onClick={() => onEditingMessageIdChange(null)}>
              取消
            </Button>
            <Button
              size="mini"
              type="primary"
              onClick={() => {
                onMessagesChange((prev) =>
                  prev.map((m) =>
                    m.id === message.id ? { ...m, content: editingDraft } : m,
                  ),
                );
                onEditingMessageIdChange(null);
              }}
            >
              保存
            </Button>
          </div>
        </div>
      ) : (
        message.content && (
          <div className="chat-message-bubble">
            <MarkdownView source={message.content} compact />
          </div>
        )
      )}
      <MessageActions
        message={message}
        isGenerating={isGenerating}
        messages={messages}
        editingMessageId={editingMessageId}
        onStartEditing={onStartEditing}
        onMessagesChange={onMessagesChange}
        onSendMessage={onSendMessage}
        onTextOverride={onTextOverride}
      />
    </div>
  );
}
