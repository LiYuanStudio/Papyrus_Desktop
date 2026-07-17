import { useState, useRef, useCallback, useEffect } from 'react';
import { Message as ArcoMessage } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ChatHistory } from '../components/ChatHistory';
import { useModelSelector } from '../hooks/useModelSelector';
import type { ChatPanelProps, Message } from './types';
import {
  loadAgentModeEnabled,
  loadStoredSessionId,
  persistSessionId,
  hydrateMessagesForSession,
} from './utils';
import { useFileHandler } from './hooks/useFileHandler';
import { useChatSession } from './hooks/useChatSession';
import { useChatActions } from './hooks/useChatActions';
import {
  ChatHeader,
  MessageList,
  ChatInput,
} from './components';
import '../ChatPanel.css';

const ChatPanel = ({
  open,
  width = 320,
  side = 'right',
  onClose,
  requestedSessionId,
  onSessionActivated,
  onSessionsChange,
}: ChatPanelProps) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState('agent');
  const [reasoning, setReasoning] = useState<false | 'low' | 'medium' | 'high' | 'very_high'>(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentModeEnabled, setAgentModeEnabled] = useState<boolean>(loadAgentModeEnabled());
  const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [inputHeight, setInputHeight] = useState(118);
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const sessionInitializedRef = useRef(false);

  const {
    models,
    selectedModel,
    loading: modelLoading,
    configChecked,
    selectModel,
    refreshModels,
  } = useModelSelector();

  const availableModels = models.map((m) => ({
    key: m.id,
    label: m.name,
  }));

  const {
    sessions,
    sessionsLoading,
    currentSessionId,
    setCurrentSessionId,
    loadSessions,
    createNewSession,
    clearAllSessions,
    switchSession,
  } = useChatSession(open);

  const fileHandler = useFileHandler();

  const {
    sendMessage,
    stopGeneration,
    handleToolApprove,
    handleToolReject,
    regenerateAssistantMessage,
    regenerateUserMessage,
    textOverrideRef,
  } = useChatActions({
    selectedModel,
    mode,
    reasoning,
    currentSessionId,
    text,
    selectedFiles: fileHandler.selectedFiles,
    isGenerating,
    setText,
    setMessages,
    setIsGenerating,
    messages,
  });

  useEffect(() => {
    persistSessionId(currentSessionId);
  }, [currentSessionId]);

  useEffect(() => {
    if (!agentModeEnabled && mode === 'agent') {
      setMode('chat');
    }
  }, []);

  useEffect(() => {
    const handleAgentModeChange = (e?: CustomEvent) => {
      let enabled: boolean;
      if (e?.detail && typeof e.detail.agentModeEnabled === 'boolean') {
        enabled = e.detail.agentModeEnabled;
      } else {
        enabled = loadAgentModeEnabled();
      }
      setAgentModeEnabled(enabled);
      if (!enabled && mode === 'agent') {
        setMode('chat');
      }
    };

    window.addEventListener('papyrus_agent_settings_changed', handleAgentModeChange as EventListener);
    const storageHandler = () => handleAgentModeChange();
    window.addEventListener('storage', storageHandler);

    return () => {
      window.removeEventListener('papyrus_agent_settings_changed', handleAgentModeChange as EventListener);
      window.removeEventListener('storage', storageHandler);
    };
  }, [mode]);

  useEffect(() => {
    if (!open || requestedSessionId || sessionInitializedRef.current) return;
    sessionInitializedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const listRes = await import('../api').then(m => m.api.listChatSessions());
        if (cancelled || !listRes.success) return;
        const sessionsList = listRes.sessions;
        const stored = loadStoredSessionId();
        const storedValid = stored && sessionsList.some((s: { id: string }) => s.id === stored);
        if (storedValid) {
          const restored = await hydrateMessagesForSession(stored);
          if (cancelled) return;
          setMessages(restored);
          setCurrentSessionId(stored);
          onSessionActivated?.(stored);
          return;
        }
        if (listRes.activeSessionId && sessionsList.some((s: { id: string }) => s.id === listRes.activeSessionId)) {
          const activeId = listRes.activeSessionId;
          const restored = await hydrateMessagesForSession(activeId);
          if (cancelled) return;
          setMessages(restored);
          setCurrentSessionId(activeId);
          onSessionActivated?.(activeId);
          return;
        }
        const createRes = await import('../api').then(m => m.api.createChatSession());
        if (cancelled || !createRes.success) return;
        setMessages([]);
        setCurrentSessionId(createRes.session.id);
        onSessionActivated?.(createRes.session.id);
        void onSessionsChange?.();
      } catch (err) {
        if (!cancelled) console.error('Failed to initialize chat session:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onSessionActivated, onSessionsChange, open, requestedSessionId, setCurrentSessionId]);

  useEffect(() => {
    const handleConfigChange = () => {
      refreshModels();
    };
    window.addEventListener('papyrus_ai_config_changed', handleConfigChange);
    return () => window.removeEventListener('papyrus_ai_config_changed', handleConfigChange);
  }, [refreshModels]);

  const handleCreateNewSession = useCallback(async () => {
    const createdSessionId = await createNewSession();
    if (createdSessionId) {
      setMessages([]);
      setEditingMessageId(null);
      setEditingDraft('');
      setHistoryDrawerVisible(false);
      onSessionActivated?.(createdSessionId);
      void onSessionsChange?.();
    }
  }, [createNewSession, onSessionActivated, onSessionsChange]);

  const handleSwitchSession = useCallback(async (sessionId: string) => {
    const restoredMessages = await switchSession(sessionId);
    if (restoredMessages) {
      setMessages(restoredMessages);
      setEditingMessageId(null);
      setEditingDraft('');
      onSessionActivated?.(sessionId);
    }
  }, [onSessionActivated, switchSession]);

  const handleClearAllSessions = useCallback(async () => {
    const nextSessionId = await clearAllSessions();
    if (nextSessionId) {
      setMessages([]);
      setEditingMessageId(null);
      setEditingDraft('');
      onSessionActivated?.(nextSessionId);
      void onSessionsChange?.();
    }
  }, [clearAllSessions, onSessionActivated, onSessionsChange]);

  /**
   * 响应主侧边栏发出的受控会话切换请求。
   * 原因：消息水合与编辑状态属于 ChatPanel，在这里执行可复用既有切换流程。
   * 未监听全局自定义事件：显式 props 能保留类型检查，也便于 React 生命周期清理。
   */
  useEffect(() => {
    if (!open || !requestedSessionId) return;
    sessionInitializedRef.current = true;
    void handleSwitchSession(requestedSessionId);
  }, [handleSwitchSession, open, requestedSessionId]);

  /**
   * 同步刷新抽屉列表与 App 中的主侧边栏摘要。
   * 原因：重命名、删除等操作发生在历史抽屉内部，两处列表需要在同一动作后更新。
   * 未共享可变数组引用：两层都从后端重新读取，避免局部乐观更新遗漏服务端字段。
   */
  const handleRefreshSessions = useCallback(async () => {
    await loadSessions();
    await onSessionsChange?.();
  }, [loadSessions, onSessionsChange]);

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleModeChange = (newMode: string) => {
    if (newMode === 'agent' && !agentModeEnabled) {
      ArcoMessage.warning(t('chatPanel.enableAgentMode'));
      return;
    }
    setMode(newMode);
  };

  const handleModelSelect = async (modelId: string) => {
    await selectModel(modelId);
  };

  const handleTextOverride = (text: string) => {
    textOverrideRef.current = text;
  };

  const handleStartEditing = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingDraft(content);
  }, []);

  const handleInsertMention = useCallback((value: string) => {
    setText((prev) => {
      const nextValue = prev.trim().length === 0 ? value : `${prev.trimEnd()} ${value}`;
      return `${nextValue} `;
    });
  }, []);

  const handleSendMessage = useCallback(async () => {
    const hasInput = text.trim().length > 0 || fileHandler.selectedFiles.length > 0 || textOverrideRef.current !== null;
    await sendMessage();
    if (hasInput && selectedModel) {
      fileHandler.clearAllFiles();
    }
    if (hasInput) {
      void onSessionsChange?.();
    }
  }, [fileHandler, onSessionsChange, selectedModel, sendMessage, text, textOverrideRef]);

  const dragActiveRef = useRef(false);
  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragStartY.current = e.clientY;
    dragStartHeight.current = inputHeight;
    dragActiveRef.current = true;
    const cleanup = () => {
      dragActiveRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
    const onMove = (ev: MouseEvent) => {
      const delta = dragStartY.current - ev.clientY;
      setInputHeight(Math.min(400, Math.max(118, dragStartHeight.current + delta)));
    };
    const onUp = () => cleanup();
    const onLeave = () => cleanup();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.documentElement.addEventListener('mouseleave', onLeave);
  }, [inputHeight]);

  useEffect(() => {
    return () => {
      if (dragActiveRef.current) {
        dragActiveRef.current = false;
      }
    };
  }, []);

  return (
    <div className={`chat-panel chat-panel-${side}`} style={{ width }}>
      <ChatHeader
        onNewChat={handleCreateNewSession}
        onHistoryClick={() => setHistoryDrawerVisible(true)}
        onClose={onClose || (() => {})}
      />
      <ChatHistory
        visible={historyDrawerVisible}
        onClose={() => setHistoryDrawerVisible(false)}
        currentSessionId={currentSessionId}
        sessions={sessions}
        loading={sessionsLoading}
        onRefresh={handleRefreshSessions}
        onSwitchSession={handleSwitchSession}
        onCreateSession={handleCreateNewSession}
        onClearAll={handleClearAllSessions}
      />
      <div className="chat-panel-body" ref={messagesContainerRef}>
        <MessageList
          messages={messages}
          selectedModel={selectedModel}
          isGenerating={isGenerating}
          editingMessageId={editingMessageId}
          editingDraft={editingDraft}
          onMessagesChange={setMessages}
          onEditingMessageIdChange={setEditingMessageId}
          onEditingDraftChange={setEditingDraft}
          onStartEditing={handleStartEditing}
          onSendMessage={handleSendMessage}
          onTextOverride={handleTextOverride}
          onRegenerateAssistant={regenerateAssistantMessage}
          onRegenerateUser={regenerateUserMessage}
          onToolApprove={handleToolApprove}
          onToolReject={handleToolReject}
          messagesEndRef={messagesEndRef}
        />
      </div>
      <div className="chat-input-resize-handle" onMouseDown={onDragStart} />
      <ChatInput
        text={text}
        setText={setText}
        selectedFiles={fileHandler.selectedFiles}
        isGenerating={isGenerating}
        configChecked={configChecked}
        mode={mode}
        reasoning={reasoning}
        agentModeEnabled={agentModeEnabled}
        availableModels={availableModels}
        onFilesChange={fileHandler.setSelectedFiles}
        onFileSelect={fileHandler.handleFileSelect}
        onSendMessage={handleSendMessage}
        onStopGeneration={stopGeneration}
        onModeChange={handleModeChange}
        onReasoningChange={setReasoning}
        onMentionInsert={handleInsertMention}
        selectedModelName={selectedModel?.name}
        selectedModelId={selectedModel?.id}
        onModelSelect={handleModelSelect}
        fileInputRef={fileHandler.fileInputRef}
        onFileInputChange={fileHandler.handleFileInputChange}
        getFileIcon={fileHandler.getFileIcon}
        formatFileSize={fileHandler.formatFileSize}
        removeFile={fileHandler.removeFile}
        clearAllFiles={fileHandler.clearAllFiles}
      />
    </div>
  );
};

export default ChatPanel;
