import type {
  Message,
  MessageBlock,
  MessageBlockToolStatus,
  RestoredMessageView,
  SelectedFile,
} from './types';
import type { ChatBlock as ApiChatBlock } from '../api';
import { getAuthToken, BASE, api, clearAuthTokenCache } from '../api';
import React from 'react';
import { IconFilePdf, IconFile, IconImage } from '@arco-design/web-react/icon';

export const SESSION_ID_STORAGE_KEY = 'papyrus_chat_session_id';

export const ALLOWED_IMAGE_TYPES = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
export const ALLOWED_DOCUMENT_TYPES = ['.pdf', '.txt', '.md', '.docx'];
export const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 5;

export const MODES = [
  { key: 'agent', label: 'Agent 模式' },
  { key: 'chat', label: 'Chat 模式' },
] as const;

export type ModeKey = typeof MODES[number]['key'];

export function loadStoredSessionId(): string {
  try {
    return localStorage.getItem(SESSION_ID_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function persistSessionId(sessionId: string): void {
  try {
    if (sessionId) {
      localStorage.setItem(SESSION_ID_STORAGE_KEY, sessionId);
    } else {
      localStorage.removeItem(SESSION_ID_STORAGE_KEY);
    }
  } catch {
    // ignore quota / disabled storage
  }
}

import {
  loadUserProfile,
  saveUserProfile,
  loadAgentSettings,
  saveAgentSettings,
  notifyAIConfigChanged,
} from '../SettingsPage/views/ChatView/utils';

export {
  loadUserProfile,
  saveUserProfile,
  loadAgentSettings,
  saveAgentSettings,
  notifyAIConfigChanged,
};

export const loadAgentModeEnabled = (): boolean => {
  const settings = loadAgentSettings();
  return settings.agentModeEnabled;
};

export function mapApiToolStatus(
  status: ApiChatBlock['toolStatus'] | undefined,
): MessageBlockToolStatus {
  switch (status) {
    case 'success':
      return 'success';
    case 'failed':
    case 'rejected':
      return 'failed';
    case 'approved':
      return 'executing';
    case 'executing':
      return 'executing';
    case 'pending':
    default:
      return 'pending';
  }
}

export function restoreApiMessage(blocks: ApiChatBlock[], fallbackContent: string): RestoredMessageView {
  const localBlocks: MessageBlock[] = [];
  let textContent = '';
  for (const block of blocks) {
    if (block.type === 'text') {
      textContent += block.text ?? '';
    } else if (block.type === 'reasoning') {
      localBlocks.push({ type: 'reasoning', content: block.text ?? '' });
    } else if (block.type === 'tool_call') {
      localBlocks.push({
        type: 'tool_call',
        toolName: block.toolName ?? '',
        toolCallId: block.toolCallId ?? '',
        toolStatus: mapApiToolStatus(block.toolStatus),
        toolParams: (block.toolParams ?? {}) as Record<string, unknown>,
        toolResult: block.toolResult,
        toolError: block.toolError,
      });
    } else if (block.type === 'tool_result') {
      const targetIndex = [...localBlocks]
        .reverse()
        .findIndex(
          (b) =>
            b.type === 'tool_call' &&
            (b.toolCallId === block.toolCallId || (!b.toolCallId && !block.toolCallId)),
        );
      if (targetIndex !== -1) {
        const realIndex = localBlocks.length - 1 - targetIndex;
        const target = localBlocks[realIndex];
        if (target) {
          localBlocks[realIndex] = {
            ...target,
            toolStatus: mapApiToolStatus(block.toolStatus),
            toolResult: block.toolResult ?? target.toolResult,
            toolError: block.toolError ?? target.toolError,
          };
        }
      }
    }
  }
  return {
    content: textContent || fallbackContent,
    blocks: localBlocks,
  };
}

export async function hydrateMessagesForSession(sessionId: string): Promise<Message[]> {
  await api.switchChatSession(sessionId);
  const data = await api.getChatMessages(sessionId);
  if (!data.success) return [];
  return data.messages.map((m) => {
    const restored = restoreApiMessage(m.blocks ?? [], m.content);
    return {
      id: m.id,
      role: m.role === 'user' ? 'user' : 'assistant',
      content: restored.content,
      blocks: restored.blocks,
      model: m.role === 'assistant' ? m.model : undefined,
    };
  });
}

export function stripMdTitle(source: string): string {
  return source
    .replace(/^[#\>\-*\s]+/gm, '')
    .replace(/[*_`~]+/g, '')
    .split('\n')[0]
    .trim();
}

export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getAuthToken();
  const hasBody = init?.body !== undefined;
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Papyrus-Token': token } : {}),
      ...(init?.headers as Record<string, string> || {}),
    },
  });
  if (res.ok) {
    return res;
  }
  if (res.status === 401) {
    clearAuthTokenCache();
    const retryToken = await getAuthToken();
    if (retryToken) {
      const retryRes = await fetch(`${BASE}${url}`, {
        ...init,
        headers: {
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
          'X-Papyrus-Token': retryToken,
          ...(init?.headers as Record<string, string> || {}),
        },
      });
      if (retryRes.ok) {
        return retryRes;
      }
      if (retryRes.status === 401) {
        clearAuthTokenCache();
      }
    }
  }
  return res;
}

export function getFileExtension(filename: string): string {
  const ext = filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
  return ext ? `.${ext}` : '';
}

export function getFileType(filename: string): 'image' | 'document' | 'unknown' {
  const ext = getFileExtension(filename);
  if (ALLOWED_IMAGE_TYPES.includes(ext)) return 'image';
  if (ALLOWED_DOCUMENT_TYPES.includes(ext)) return 'document';
  return 'unknown';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function validateFiles(
  files: FileList | null,
  existingFiles: SelectedFile[],
): { validFiles: SelectedFile[]; errors: string[] } {
  const newFiles: SelectedFile[] = [];
  const errors: string[] = [];
  const remainingSlots = MAX_FILES - existingFiles.length;

  if (remainingSlots <= 0) {
    errors.push(`最多只能选择 ${MAX_FILES} 个文件`);
    return { validFiles: [], errors };
  }

  if (!files) return { validFiles: [], errors };

  Array.from(files).slice(0, remainingSlots).forEach((file) => {
    const ext = getFileExtension(file.name);

    if (!ALLOWED_FILE_TYPES.includes(ext)) {
      errors.push(`${file.name}: 不支持的文件类型`);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}: 超过10MB大小限制`);
      return;
    }

    const isDuplicate = existingFiles.some(
      (sf) => sf.name === file.name && sf.size === file.size,
    );
    if (isDuplicate) {
      errors.push(`${file.name}: 文件已存在`);
      return;
    }

    newFiles.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      file,
      name: file.name,
      size: file.size,
      type: getFileType(file.name),
    });
  });

  if (files.length > remainingSlots) {
    errors.push(`已达到最大文件数限制 (${MAX_FILES})，多余文件未添加`);
  }

  return { validFiles: newFiles, errors };
}

export function getFileIcon(type: 'image' | 'document' | 'unknown', name: string) {
  switch (type) {
    case 'image':
      return React.createElement(IconImage);
    case 'document':
      if (name.toLowerCase().endsWith('.pdf')) {
        return React.createElement(IconFilePdf);
      }
      return React.createElement(IconFile);
    default:
      return React.createElement(IconFile);
  }
}
