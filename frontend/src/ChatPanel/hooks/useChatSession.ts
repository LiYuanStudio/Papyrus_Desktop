import { useState, useCallback, useEffect } from 'react';
import { Message as ArcoMessage } from '@arco-design/web-react';
import i18n from '../../i18n';
import type { ChatSession, Message } from '../types';
import { api } from '../../api';
import {
  loadStoredSessionId,
  persistSessionId,
  hydrateMessagesForSession,
} from '../utils';

export interface UseChatSessionReturn {
  sessions: ChatSession[];
  sessionsLoading: boolean;
  currentSessionId: string;
  setCurrentSessionId: React.Dispatch<React.SetStateAction<string>>;
  loadSessions: () => Promise<void>;
  createNewSession: () => Promise<string | null>;
  clearAllSessions: () => Promise<string | null>;
  switchSession: (sessionId: string) => Promise<Message[] | null>;
}

export function useChatSession(
  _open: boolean,
): UseChatSessionReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>(loadStoredSessionId());

  useEffect(() => {
    persistSessionId(currentSessionId);
  }, [currentSessionId]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const data = await api.listChatSessions();
      if (data.success) {
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const createNewSession = useCallback(async () => {
    try {
      const data = await api.createChatSession();
      if (data.success) {
        setCurrentSessionId(data.session.id);
        setSessions((prev) => {
          const nextSessions = prev.filter((session) => session.id !== data.session.id);
          return [data.session, ...nextSessions];
        });
        return data.session.id;
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      ArcoMessage.error(i18n.t('chatSession.createFailed'));
    }
    return null;
  }, []);

  const clearAllSessions = useCallback(async () => {
    try {
      const data = await api.clearAllChatSessions();
      if (data.success) {
        ArcoMessage.success(i18n.t('chatSession.cleared', { count: data.deletedCount }));
        setSessions([]);
        if (data.activeSessionId) {
          setCurrentSessionId(data.activeSessionId);
          await loadSessions();
          return data.activeSessionId;
        } else {
          const created = await api.createChatSession();
          if (created.success) {
            setCurrentSessionId(created.session.id);
            setSessions([created.session]);
            return created.session.id;
          }
        }
      }
    } catch (err) {
      console.error('Failed to clear sessions:', err);
      ArcoMessage.error(i18n.t('chatSession.clearFailed'));
    }
    return null;
  }, [loadSessions]);

  const switchSession = useCallback(async (sessionId: string) => {
    try {
      const messages = await hydrateMessagesForSession(sessionId);
      setCurrentSessionId(sessionId);
      return messages;
    } catch (err) {
      console.error('Failed to switch session:', err);
      ArcoMessage.error(i18n.t('chatSession.switchFailed'));
    }
    return null;
  }, []);

  return {
    sessions,
    sessionsLoading,
    currentSessionId,
    setCurrentSessionId,
    loadSessions,
    createNewSession,
    clearAllSessions,
    switchSession,
  };
}

export async function initializeSession(open: boolean): Promise<{
  sessionId: string;
  messages: Message[];
} | null> {
  if (!open) return null;

  let cancelled = false;
  try {
    const listRes = await api.listChatSessions();
    if (cancelled || !listRes.success) return null;

    const sessionsList = listRes.sessions;
    const stored = loadStoredSessionId();
    const storedValid = stored && sessionsList.some((s) => s.id === stored);

    if (storedValid) {
      const restored = await hydrateMessagesForSession(stored);
      if (cancelled) return null;
      return { sessionId: stored, messages: restored };
    }

    if (listRes.activeSessionId && sessionsList.some((s) => s.id === listRes.activeSessionId)) {
      const activeId = listRes.activeSessionId;
      const restored = await hydrateMessagesForSession(activeId);
      if (cancelled) return null;
      return { sessionId: activeId, messages: restored };
    }

    const createRes = await api.createChatSession();
    if (cancelled || !createRes.success) return null;
    return { sessionId: createRes.session.id, messages: [] };
  } catch (err) {
    if (!cancelled) console.error('Failed to initialize chat session:', err);
    return null;
  }
}
