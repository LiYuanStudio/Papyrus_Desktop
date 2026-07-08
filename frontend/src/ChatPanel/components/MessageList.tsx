import { Empty } from '@arco-design/web-react';
import type { Message, UserProfile } from '../types';
import type { ModelOption } from '../../utils/modelSelector';
import { MessageBubble } from './MessageBubble';

export interface MessageListProps {
  messages: Message[];
  userProfile: UserProfile;
  selectedModel?: ModelOption;
  isGenerating: boolean;
  editingMessageId: string | null;
  editingDraft: string;
  onMessagesChange: React.Dispatch<React.SetStateAction<Message[]>>;
  onEditingMessageIdChange: (id: string | null) => void;
  onEditingDraftChange: (draft: string) => void;
  onStartEditing: (messageId: string, content: string) => void;
  onSendMessage: () => void;
  onTextOverride: (text: string) => void;
  onRegenerateAssistant: (assistantMessageId: string, parentUserMessageId: string) => Promise<void>;
  onRegenerateUser: (userMessageId: string, content: string, assistantMessageId?: string) => Promise<void>;
  onToolApprove: (messageId: string, toolName: string, callId?: string) => void;
  onToolReject: (messageId: string, toolName: string, callId?: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function MessageList({
  messages,
  userProfile,
  selectedModel,
  isGenerating,
  editingMessageId,
  editingDraft,
  onMessagesChange,
  onEditingMessageIdChange,
  onEditingDraftChange,
  onStartEditing,
  onSendMessage,
  onTextOverride,
  onRegenerateAssistant,
  onRegenerateUser,
  onToolApprove,
  onToolReject,
  messagesEndRef,
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="tw-flex-1 tw-flex tw-flex-col tw-items-center tw-justify-center tw-p-8">
        <Empty description="开始新的对话" />
      </div>
    );
  }

  return (
    <div className="chat-messages">
      {messages.map((msg) => (
        <div key={msg.id} className={`chat-message chat-message-${msg.role}`}>
          <MessageBubble
            message={msg}
            messages={messages}
            userProfile={userProfile}
            selectedModelName={selectedModel?.name}
            modelId={selectedModel?.modelId}
            isGenerating={isGenerating}
            editingMessageId={editingMessageId}
            editingDraft={editingDraft}
            onMessagesChange={onMessagesChange}
            onEditingMessageIdChange={onEditingMessageIdChange}
            onEditingDraftChange={onEditingDraftChange}
            onStartEditing={onStartEditing}
            onSendMessage={onSendMessage}
            onTextOverride={onTextOverride}
            onRegenerateAssistant={onRegenerateAssistant}
            onRegenerateUser={onRegenerateUser}
            onToolApprove={onToolApprove}
            onToolReject={onToolReject}
          />
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
