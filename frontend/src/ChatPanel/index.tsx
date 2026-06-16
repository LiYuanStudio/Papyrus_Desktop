import { useState, useRef, useCallback, useEffect } from 'react';
import { Message as ArcoMessage } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ChatHistory } from '../components/ChatHistory';
import { useModelSelector } from '../hooks/useModelSelector';
import type { ChatPanelProps, Message, UserProfile } from './types';
import {
  loadAgentModeEnabled,
  loadUserProfile,
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

const ChatPanel = ({ open, width = 320, side = 'right', onClose }: ChatPanelProps) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState('agent');
  const [reasoning, setReasoning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(loadUserProfile());
  const [agentModeEnabled, setAgentModeEnabled] = useState<boolean>(loadAgentModeEnabled());
  const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [inputHeight, setInputHeight] = useState(118);
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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
    const handleStorageChange = () => {
      setUserProfile(loadUserProfile());
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('papyrus_user_profile_changed', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('papyrus_user_profile_changed', handleStorageChange);
    };
  }, []);

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
    if (!open) return;
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
          return;
        }
        if (listRes.activeSessionId && sessionsList.some((s: { id: string }) => s.id === listRes.activeSessionId)) {
          const activeId = listRes.activeSessionId;
          const restored = await hydrateMessagesForSession(activeId);
          if (cancelled) return;
          setMessages(restored);
          setCurrentSessionId(activeId);
          return;
        }
        const createRes = await import('../api').then(m => m.api.createChatSession());
        if (cancelled || !createRes.success) return;
        setMessages([]);
        setCurrentSessionId(createRes.session.id);
      } catch (err) {
        if (!cancelled) console.error('Failed to initialize chat session:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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
    }
  }, [createNewSession]);

  const handleSwitchSession = useCallback(async (sessionId: string) => {
    const restoredMessages = await switchSession(sessionId);
    if (restoredMessages) {
      setMessages(restoredMessages);
      setEditingMessageId(null);
      setEditingDraft('');
    }
  }, [switchSession]);

  const handleClearAllSessions = useCallback(async () => {
    const nextSessionId = await clearAllSessions();
    if (nextSessionId) {
      setMessages([]);
      setEditingMessageId(null);
      setEditingDraft('');
    }
  }, [clearAllSessions]);

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
  }, [fileHandler, selectedModel, sendMessage, text, textOverrideRef]);

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
        onRefresh={loadSessions}
        onSwitchSession={handleSwitchSession}
        onCreateSession={handleCreateNewSession}
        onClearAll={handleClearAllSessions}
      />
      <div className="chat-panel-body" ref={messagesContainerRef}>
        <MessageList
          messages={messages}
          userProfile={userProfile}
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
