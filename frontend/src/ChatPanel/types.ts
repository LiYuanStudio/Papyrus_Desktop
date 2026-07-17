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
  toolParams?: Record<string, any>;
  toolResult?: any;
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

export interface SSEEvent {
  type: 'text' | 'reasoning' | 'tool_call' | 'tool_result' | 'error' | 'done' | 'user_saved';
  data: any;
}

export interface RestoredMessageView {
  content: string;
  blocks: MessageBlock[];
}

export { type ChatSession, type ApiChatBlock, type UserProfile };
