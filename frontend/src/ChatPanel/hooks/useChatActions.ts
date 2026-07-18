import { useRef, useCallback } from 'react';
import { Message as ArcoMessage } from '@arco-design/web-react';
import i18n from '../../i18n';
import type { Message, MessageBlock, MessageBlockToolStatus, SSEEvent, SelectedFile } from '../types';
import type { ModelOption } from '../../utils/modelSelector';
import { authFetch } from '../utils';
import { api } from '../../api';

export interface UseChatActionsProps {
  selectedModel: ModelOption | undefined;
  mode: string;
  reasoning: false | 'low' | 'medium' | 'high' | 'very_high';
  currentSessionId: string;
  text: string;
  selectedFiles: SelectedFile[];
  isGenerating: boolean;
  setText: React.Dispatch<React.SetStateAction<string>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  messages: Message[];
  onTitleUpdated?: () => void;
}

export interface UseChatActionsReturn {
  isGenerating: boolean;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  sendMessage: () => Promise<void>;
  stopGeneration: () => void;
  regenerateAssistantMessage: (assistantMessageId: string, parentUserMessageId: string) => Promise<void>;
  regenerateUserMessage: (userMessageId: string, content: string, assistantMessageId?: string) => Promise<void>;
  handleToolApprove: (messageId: string, toolName: string, callId?: string) => void;
  handleToolReject: (messageId: string, toolName: string, callId?: string) => void;
  textOverrideRef: React.MutableRefObject<string | null>;
}

// 按 toolCallId 精确定位工具卡片，避免同名工具或状态同步延迟时更新到错误的卡片。
// 原因：审批、拒绝和结果回填都来自后端生成的 callId，它比 toolName 更稳定，适合作为唯一锚点。
// 未只用 toolName：同一条消息里可能出现多个同名工具调用，单靠名称和状态会把 UI 与后端记录串位。
function findToolCallBlockIndex(
  blocks: MessageBlock[],
  toolName: string,
  callId: string | undefined,
  fallbackStatuses: readonly MessageBlockToolStatus[],
): number {
  if (callId) {
    const exactIndex = blocks.findIndex(
      (block) => block.type === 'tool_call' && block.toolCallId === callId,
    );
    if (exactIndex !== -1) {
      return exactIndex;
    }
  }

  return blocks.findIndex(
    (block) =>
      block.type === 'tool_call' &&
      block.toolName === toolName &&
      block.toolStatus !== undefined &&
      fallbackStatuses.includes(block.toolStatus),
  );
}

export function useChatActions({
  selectedModel,
  mode,
  reasoning,
  currentSessionId,
  text,
  selectedFiles,
  isGenerating,
  setText,
  setMessages,
  setIsGenerating,
  onTitleUpdated,
}: UseChatActionsProps): UseChatActionsReturn {
  const abortControllerRef = useRef<AbortController | null>(null);
  const textOverrideRef = useRef<string | null>(null);

  const handleSSEStream = useCallback(async (
    response: Response,
    optimisticAssistantId: string,
    optimisticUserId: string,
  ) => {
    const reader = response.body?.getReader();
    if (!reader) return;

    let assistantId = optimisticAssistantId;
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const jsonStr = line.trim().slice(6);
              if (jsonStr === '[DONE]') continue;

              const event: SSEEvent = JSON.parse(jsonStr);

              if (event.type === 'user_saved') {
                const realUserId = event.data?.messageId;
                if (typeof realUserId === 'string' && realUserId) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === optimisticUserId ? { ...m, id: realUserId } : m,
                    ),
                  );
                }
                continue;
              }

              if (event.type === 'title_updated') {
                onTitleUpdated?.();
                continue;
              }

              setMessages((prev) => {
                const msgIndex = prev.findIndex((m) => m.id === assistantId);
                if (msgIndex === -1) return prev;

                const lastMsg = prev[msgIndex]!;
                let newBlocks = lastMsg.blocks ? [...lastMsg.blocks] : [];
                let newContent = lastMsg.content;
                let newId = lastMsg.id;

                switch (event.type) {
                  case 'text':
                    newContent += event.data;
                    break;

                  case 'reasoning': {
                    const reasoningIndex = newBlocks.findIndex(
                      (b) => b.type === 'reasoning',
                    );
                    if (reasoningIndex !== -1) {
                      newBlocks = newBlocks.map((b, idx) =>
                        idx === reasoningIndex
                          ? { ...b, content: (b.content || '') + event.data }
                          : b,
                      );
                    } else {
                      newBlocks = [
                        ...newBlocks,
                        { type: 'reasoning' as const, content: event.data },
                      ];
                    }
                    break;
                  }

                  case 'tool_call':
                    newBlocks = [
                      ...newBlocks,
                      {
                        type: 'tool_call' as const,
                        toolCallId: event.data.callId || event.data.id || '',
                        toolName: event.data.function?.name || event.data.name || '',
                        toolStatus: 'pending' as const,
                        toolParams: event.data.function?.arguments
                          ? (() => { try { return JSON.parse(event.data.function.arguments); } catch { return {}; } })()
                          : (event.data.params || {}),
                      },
                    ];
                    break;

                  case 'tool_result': {
                    const callId = event.data?.callId;
                    const toolIndex = callId
                      ? newBlocks.findIndex(
                          (b) => b.type === 'tool_call' && b.toolCallId === callId,
                        )
                      : newBlocks.findIndex(
                          (b) =>
                            b.type === 'tool_call' &&
                            b.toolName === event.data.name &&
                            b.toolStatus === 'pending',
                        );
                    if (toolIndex !== -1) {
                      newBlocks = newBlocks.map((b, idx) =>
                        idx === toolIndex
                          ? {
                              ...b,
                              toolStatus: event.data.success
                                ? ('success' as const)
                                : ('failed' as const),
                              toolResult: event.data.result,
                              toolError: event.data.error,
                            }
                          : b,
                      );
                    }
                    break;
                  }

                  case 'done': {
                    const realAssistantId = event.data?.messageId;
                    if (typeof realAssistantId === 'string' && realAssistantId) {
                      newId = realAssistantId;
                      assistantId = realAssistantId;
                    }
                    const toolPattern = /```json\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/g;
                    let match = toolPattern.exec(newContent);
                    while (match !== null) {
                      try {
                        const parsed = JSON.parse(match[1]) as unknown;
                        if (parsed !== null && typeof parsed === 'object') {
                          const obj = parsed as Record<string, unknown>;
                          if (typeof obj.tool === 'string' && typeof obj.params === 'object' && obj.params !== null) {
                            newBlocks = [
                              ...newBlocks,
                              {
                                type: 'tool_call' as const,
                                toolCallId: '',
                                toolName: obj.tool,
                                toolStatus: 'pending' as const,
                                toolParams: obj.params as Record<string, unknown>,
                              },
                            ];
                            newContent = newContent.replace(match[0], '');
                          }
                        }
                      } catch {
                        // ignore malformed JSON
                      }
                      match = toolPattern.exec(newContent);
                    }
                    break;
                  }

                  case 'error': {
                    const errorData = event.data;
                    const errorMsg =
                      typeof errorData === 'string'
                        ? errorData
                        : errorData?.message || '发生错误';
                    ArcoMessage.error(errorMsg);
                    newContent = '❌ ' + errorMsg;
                    break;
                  }
                }

                const newMessages = [...prev];
                newMessages[msgIndex] = {
                  ...lastMsg,
                  id: newId,
                  content: newContent,
                  blocks: newBlocks,
                };
                return newMessages;
              });
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }, [onTitleUpdated, setMessages]);

  const sendMessage = useCallback(async () => {
    const messageFromOverride = textOverrideRef.current;
    if (messageFromOverride !== null) {
      textOverrideRef.current = null;
    }
    const effectiveText = messageFromOverride ?? text;
    const trimmedText = effectiveText.trim();
    if (!trimmedText && selectedFiles.length === 0) return;

    if (!selectedModel) {
      ArcoMessage.error(i18n.t('chatActions.selectModelFirst'));
      return;
    }

    const filesToUpload = [...selectedFiles];

    let messageText = trimmedText;
    const attachments: Array<{ path?: string } | string> = [];

    if (filesToUpload.length > 0) {
      const fileNames = filesToUpload.map((f) => `[附件: ${f.name}]`).join(' ');
      messageText = messageText ? `${messageText}\n${fileNames}` : fileNames;

      try {
        const uploadFiles: Array<{ name: string; content: string; mimeType?: string }> = [];
        for (const sf of filesToUpload) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const idx = result.indexOf('base64,');
              resolve(idx >= 0 ? result.slice(idx + 7) : result);
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(sf.file);
          });
          uploadFiles.push({ name: sf.name, content: base64, mimeType: sf.file.type });
        }

        const uploadRes = await authFetch('/files/upload', {
          method: 'POST',
          body: JSON.stringify({ files: uploadFiles }),
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          if (uploadData.success && uploadData.files) {
            for (const f of uploadData.files) {
              attachments.push({ path: f.id });
            }
          }
        }
      } catch (uploadErr) {
        console.error('File upload failed:', uploadErr);
        const uploadErrorMessage = uploadErr instanceof Error
          ? uploadErr.message
          : i18n.t('filesPage.uploadFailed');
        ArcoMessage.error(uploadErrorMessage);
      }
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      blocks: [],
      model: selectedModel.modelId,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setText('');
    setIsGenerating(true);

    abortControllerRef.current = new AbortController();

    try {
      const chatBody: Record<string, unknown> = {
        message: messageText,
        model: selectedModel.modelId,
        mode,
        reasoning,
      };
      if (currentSessionId) {
        chatBody.session_id = currentSessionId;
      }
      if (attachments.length > 0) {
        chatBody.attachments = attachments;
      }

      const response = await authFetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        let errMsg = `HTTP error! status: ${response.status}`;
        try {
          const errBody = await response.json();
          if (errBody.error) errMsg = errBody.error;
        } catch { /* ignore parse errors */ }
        throw new Error(errMsg);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        await handleSSEStream(response, assistantMessage.id, userMessage.id);
      } else {
        const data = await response.json();
        setMessages((prev) => {
          const msgIndex = prev.findIndex((m) => m.id === assistantMessage.id);
          if (msgIndex === -1) return prev;
          return prev.map((msg, idx) =>
            idx === msgIndex
              ? {
                  ...msg,
                  content: data.content,
                  blocks: data.reasoning
                    ? [
                        ...(msg.blocks || []),
                        { type: 'reasoning' as const, content: data.reasoning },
                      ]
                    : msg.blocks,
                }
              : msg,
          );
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Failed to send message:', error);
        let errorMessage = '发送消息失败，请重试';
        if (error instanceof Error) {
          if (error.message.includes('Failed to fetch')) {
            errorMessage = '无法连接到服务器，请检查后端是否已启动';
          } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            errorMessage = 'API Key 无效或已过期，请前往设置页面检查配置';
          } else if (error.message.includes('429')) {
            errorMessage = '请求过于频繁，请稍后再试';
          } else if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
            errorMessage = 'AI 服务暂时不可用，请稍后再试';
          } else if (error.message.includes('API key') || error.message.includes('api key')) {
            errorMessage = 'API Key 配置错误，请前往设置页面检查';
          }
        }
        ArcoMessage.error(errorMessage);

        const errorContent = '❌ ' + errorMessage;

        setMessages((prev) => {
          const lastIndex = prev.length - 1;
          const lastMsg = prev[lastIndex];
          if (lastMsg && lastMsg.role === 'assistant') {
            const updatedMsg = { ...lastMsg, content: errorContent };

            if (currentSessionId) {
              const userMsgIndex = prev.length - 2;
              const userMsgId = userMsgIndex >= 0 ? prev[userMsgIndex]?.id : null;
              authFetch('/messages', {
                method: 'POST',
                body: JSON.stringify({
                  sessionId: currentSessionId,
                  role: 'assistant' as const,
                  content: errorContent,
                  model: selectedModel.modelId,
                  parentMessageId: userMsgId ?? null,
                }),
              }).catch((e) => {
                console.error('Failed to save error message:', e);
              });
            }

            return prev.map((msg, idx) =>
              idx === lastIndex ? updatedMsg : msg,
            );
          }
          return prev;
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [text, selectedModel, mode, reasoning, selectedFiles, currentSessionId, handleSSEStream, setMessages, setText, setIsGenerating]);

  const regenerateAssistantMessage = useCallback(async (
    assistantMessageId: string,
    parentUserMessageId: string,
  ) => {
    if (!selectedModel) {
      ArcoMessage.error(i18n.t('chatActions.selectModelFirst'));
      return;
    }

    const placeholderId = crypto.randomUUID();
    const placeholder: Message = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      blocks: [],
      model: selectedModel.modelId,
    };

    setMessages((prev) => {
      const msgIndex = prev.findIndex((m) => m.id === assistantMessageId);
      if (msgIndex === -1) return prev;
      return [...prev.slice(0, msgIndex), placeholder];
    });

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    try {
      const response = await authFetch(
        `/messages/${encodeURIComponent(assistantMessageId)}/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel.modelId,
            mode,
            reasoning,
          }),
          signal: abortControllerRef.current.signal,
        },
      );

      if (!response.ok) {
        let errMsg = `HTTP error! status: ${response.status}`;
        try {
          const errBody = await response.json();
          if (errBody.error) errMsg = errBody.error;
        } catch { /* ignore parse errors */ }
        throw new Error(errMsg);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        await handleSSEStream(response, placeholderId, parentUserMessageId);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('Regenerate aborted');
      } else {
        console.error('Failed to regenerate message:', error);
        const errorMessage = error instanceof Error ? error.message : '重新生成失败，请重试';
        ArcoMessage.error(errorMessage);
        setMessages((prev) => {
          const msgIndex = prev.findIndex((m) => m.id === placeholderId);
          if (msgIndex === -1) return prev;
          return prev.map((msg, idx) =>
            idx === msgIndex ? { ...msg, content: '❌ ' + errorMessage } : msg,
          );
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [selectedModel, mode, reasoning, handleSSEStream, setMessages, setIsGenerating]);

  const regenerateUserMessage = useCallback(async (
    userMessageId: string,
    content: string,
    assistantMessageId?: string,
  ) => {
    const idsToDelete = [userMessageId];
    if (assistantMessageId) {
      idsToDelete.push(assistantMessageId);
    }
    await Promise.all(
      idsToDelete.map((id) =>
        api.deleteChatMessage(id).catch(() => undefined),
      ),
    );

    setMessages((prev) => {
      const msgIndex = prev.findIndex((m) => m.id === userMessageId);
      if (msgIndex === -1) return prev;
      return prev.slice(0, msgIndex);
    });

    textOverrideRef.current = content;
    await sendMessage();
  }, [sendMessage, setMessages]);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
  }, [setIsGenerating]);

  const handleToolApprove = useCallback((messageId: string, toolName: string, callId?: string) => {
    const cid = callId || `${messageId}-${toolName}`;

    setMessages((prev) => {
      const msgIndex = prev.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return prev;
      const msg = prev[msgIndex];
      if (!msg || !msg.blocks) return prev;
      const blockIndex = findToolCallBlockIndex(
        msg.blocks,
        toolName,
        callId,
        ['pending'],
      );
      if (blockIndex === -1) return prev;
      const newBlocks = msg.blocks.map((b, idx) =>
        idx === blockIndex ? { ...b, toolStatus: 'executing' as const } : b,
      );
      const newMessages = [...prev];
      newMessages[msgIndex] = { ...msg, blocks: newBlocks };
      return newMessages;
    });

    authFetch(`/tools/approve/${encodeURIComponent(cid)}`, {
      method: 'POST',
    })
      .then(async (response) => {
        if (!response.ok) {
          let errMsg = `HTTP ${response.status}`;
          try {
            const errBody = await response.json();
            if (errBody.error) errMsg = errBody.error;
          } catch { /* ignore parse errors */ }
          throw new Error(errMsg);
        }
        const data = await response.json();
        const toolResult = data.result as Record<string, unknown> | undefined;
        if (!data.success || (toolResult && toolResult.success === false)) {
          throw new Error(
            (toolResult?.error as string) || data.message || '工具执行失败',
          );
        }
        setMessages((prev) => {
          const msgIndex = prev.findIndex((m) => m.id === messageId);
          if (msgIndex === -1) return prev;
          const msg = prev[msgIndex];
          if (!msg || !msg.blocks) return prev;
          const blockIndex = findToolCallBlockIndex(
            msg.blocks,
            toolName,
            callId,
            ['executing', 'pending'],
          );
          if (blockIndex === -1) return prev;
          const newBlocks = msg.blocks.map((b, idx) =>
            idx === blockIndex
              ? {
                  ...b,
                  toolStatus: 'success' as const,
                  toolResult: data.result,
                  toolError: undefined,
                }
              : b,
          );
          const newMessages = [...prev];
          newMessages[msgIndex] = { ...msg, blocks: newBlocks };
          return newMessages;
        });
      })
      .catch((error) => {
        console.error('Tool approve failed:', error);
        ArcoMessage.error(`工具批准请求失败: ${error instanceof Error ? error.message : String(error)}`);
        setMessages((prev) => {
          const msgIndex = prev.findIndex((m) => m.id === messageId);
          if (msgIndex === -1) return prev;
          const msg = prev[msgIndex];
          if (!msg || !msg.blocks) return prev;
          const blockIndex = findToolCallBlockIndex(
            msg.blocks,
            toolName,
            callId,
            ['executing', 'pending'],
          );
          if (blockIndex === -1) return prev;
          const newBlocks = msg.blocks.map((b, idx) =>
            idx === blockIndex ? { ...b, toolStatus: 'pending' as const, toolError: undefined } : b,
          );
          const newMessages = [...prev];
          newMessages[msgIndex] = { ...msg, blocks: newBlocks };
          return newMessages;
        });
      });
  }, [setMessages]);

  const handleToolReject = useCallback((messageId: string, toolName: string, callId?: string) => {
    const cid = callId || `${messageId}-${toolName}`;

    setMessages((prev) => {
      const msgIndex = prev.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return prev;
      const msg = prev[msgIndex];
      if (!msg || !msg.blocks) return prev;
      const blockIndex = findToolCallBlockIndex(
        msg.blocks,
        toolName,
        callId,
        ['pending'],
      );
      if (blockIndex === -1) return prev;
      const newBlocks = msg.blocks.map((b, idx) =>
        idx === blockIndex
          ? { ...b, toolStatus: 'failed' as const, toolError: '用户拒绝了工具调用' }
          : b,
      );
      const newMessages = [...prev];
      newMessages[msgIndex] = { ...msg, blocks: newBlocks };
      return newMessages;
    });

    authFetch(`/tools/reject/${encodeURIComponent(cid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: '用户拒绝执行' }),
    })
      .then(async (response) => {
        if (!response.ok) {
          let errMsg = `HTTP ${response.status}`;
          try {
            const errBody = await response.json();
            if (errBody.error) errMsg = errBody.error;
          } catch { /* ignore parse errors */ }
          throw new Error(errMsg);
        }
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || '工具拒绝失败');
        }
      })
      .catch((error) => {
        console.error('Tool reject failed:', error);
        ArcoMessage.error(`工具拒绝请求失败: ${error instanceof Error ? error.message : String(error)}`);
        setMessages((prev) => {
          const msgIndex = prev.findIndex((m) => m.id === messageId);
          if (msgIndex === -1) return prev;
          const msg = prev[msgIndex];
          if (!msg || !msg.blocks) return prev;
          const blockIndex = findToolCallBlockIndex(
            msg.blocks,
            toolName,
            callId,
            ['failed'],
          );
          if (blockIndex === -1) return prev;
          const newBlocks = msg.blocks.map((b, idx) =>
            idx === blockIndex ? { ...b, toolStatus: 'pending' as const, toolError: undefined } : b,
          );
          const newMessages = [...prev];
          newMessages[msgIndex] = { ...msg, blocks: newBlocks };
          return newMessages;
        });
      });
  }, [setMessages]);

  return {
    isGenerating,
    abortControllerRef,
    sendMessage,
    stopGeneration,
    regenerateAssistantMessage,
    regenerateUserMessage,
    handleToolApprove,
    handleToolReject,
    textOverrideRef,
  };
}
