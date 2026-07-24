import { Tooltip } from '@arco-design/web-react';
import { IconPlus, IconHistory, IconClose } from '@arco-design/web-react/icon';

export interface ChatHeaderProps {
  onNewChat: () => void;
  onHistoryClick: () => void;
  onClose: () => void;
}

export function ChatHeader({
  onNewChat,
  onHistoryClick,
  onClose,
}: ChatHeaderProps) {
  return (
    <div className="chat-panel-header">
      <div className="chat-panel-header-actions">
        <Tooltip content="新建对话" mini>
          <button
            className="chat-panel-header-btn"
            aria-label="新建对话"
            onClick={onNewChat}
          >
            <IconPlus />
          </button>
        </Tooltip>
        <Tooltip content="历史记录" mini>
          <button
            className="chat-panel-header-btn"
            aria-label="历史记录"
            onClick={onHistoryClick}
          >
            <IconHistory />
          </button>
        </Tooltip>
        <Tooltip content="关闭" mini>
          <button className="chat-panel-header-btn" aria-label="关闭" onClick={onClose}>
            <IconClose />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
