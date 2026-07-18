import type { ChatSession, ChatBlock as ApiChatBlock } from '../api';
import type { UserProfile } from '../types/common';

/**
 * 描述 ChatPanel 的停靠布局、关闭动作与外部会话协调接口。
 * 原因：主侧边栏需要请求切换会话并接收水合完成通知，同时消息正文仍由面板内部管理。
 * 未暴露消息状态 setter：完整消息不被其他页面消费，保持封装可减少根组件重渲染。
 */
export interface ChatPanelProps {
  open: boolean;
  width?: number;
  side?: 'left' | 'right';
  onClose?: () => void;
  requestedSessionId?: string | null;
  onSessionActivated?: (sessionId: string) => void;
  onSessionsChange?: () => void | Promise<void>;
}

export type MessageBlockType = 'text' | 'reasoning' | 'tool_call';

export type MessageBlockToolStatus = 'pending' | 'executing' | 'success' | 'failed';

export interface MessageBlock {
  type: MessageBlockType;
  content?: string;
  toolName?: string;
  toolCallId?: string;
  toolStatus?: MessageBlockToolStatus;
  toolParams?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  blocks?: MessageBlock[];
  model?: string;
}

export interface SelectedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: 'image' | 'document' | 'unknown';
}

// 聊天流事件使用 type 判别联合描述每类载荷。
// 原因：解析后的网络数据仍需在消费处分支收窄，避免 `any` 让损坏载荷穿透到消息状态。
// 未使用统一 Record：文本、错误和工具事件的结构不同，统一对象会丢失判别联合的类型保护。
export type SSEEvent =
  | { type: 'text' | 'reasoning'; data: string }
  | {
      type: 'tool_call';
      data: {
        callId?: string;
        id?: string;
        function?: { name?: string; arguments?: string };
        name?: string;
        params?: Record<string, unknown>;
      };
    }
  | {
      type: 'tool_result';
      data: {
        callId?: string;
        name?: string;
        success?: boolean;
        result?: unknown;
        error?: string;
      };
    }
  | { type: 'done' | 'user_saved'; data: { messageId?: string } }
  | { type: 'title_updated'; data: { sessionId?: string; title?: string } }
  | { type: 'error'; data: string | { message?: string } };

export interface RestoredMessageView {
  content: string;
  blocks: MessageBlock[];
}

export { type ChatSession, type ApiChatBlock, type UserProfile };
