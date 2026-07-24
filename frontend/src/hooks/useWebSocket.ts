import { useEffect, useRef, useState, useCallback } from 'react';
import { Message } from '@arco-design/web-react';
import i18n from '../i18n';

export interface FileChangeEvent {
  type: 'file_change';
  event: 'modified' | 'created' | 'deleted';
  path: string;
  timestamp: number;
}

interface PongMessage {
  type: 'pong';
  timestamp: number;
}

type WebSocketMessage = FileChangeEvent | PongMessage | Record<string, unknown>;

type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketOptions {
  /** WebSocket 地址 */
  url?: string;
  /** 连接成功后回调 */
  onConnect?: () => void;
  /** 断开连接后回调 */
  onDisconnect?: () => void;
  /** 收到消息回调 */
  onMessage?: (data: WebSocketMessage) => void;
  /** 文件变更回调 */
  onFileChange?: (event: FileChangeEvent) => void;
  /** 是否自动重连 */
  autoReconnect?: boolean;
  /** 重连间隔(ms) */
  reconnectInterval?: number;
  /** 最大重连次数 */
  maxReconnectAttempts?: number;
  /** 是否显示连接状态提示 */
  showToast?: boolean;
}

interface UseWebSocketReturn {
  /** 连接状态 */
  status: WebSocketStatus;
  /** 是否已连接 */
  isConnected: boolean;
  /** 手动连接 */
  connect: () => void;
  /** 手动断开 */
  disconnect: () => void;
  /** 发送消息 */
  send: (data: unknown) => void;
  /** 最后收到的文件变更事件 */
  lastFileChange: FileChangeEvent | null;
}

/**
 * WebSocket Hook - 实时接收后端文件变更通知
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = `ws://127.0.0.1:8000/ws`,
    onConnect,
    onDisconnect,
    onMessage,
    onFileChange,
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 3,
    showToast = false,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastFileChange, setLastFileChange] = useState<FileChangeEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearReconnectTimer();
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setStatus('disconnected');
    if (showToast) {
      Message.info(i18n.t('webSocket.disconnected'));
    }
    onDisconnect?.();
  }, [clearReconnectTimer, onDisconnect, showToast]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setStatus('disconnected');
      console.warn(`[WebSocket] 已达到最大重连次数 (${maxReconnectAttempts})，停止重连`);
      return;
    }

    shouldReconnectRef.current = true;
    setStatus('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setStatus('connected');
        if (showToast) {
          Message.success(i18n.t('webSocket.connected'));
        }
        onConnect?.();
        
        // 发送心跳
        const pingInterval = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
        
        // 清理函数
        ws.addEventListener('close', () => {
          window.clearInterval(pingInterval);
        });
      };

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          
          // 处理文件变更消息
          if (raw.type === 'file_change' && typeof raw.path === 'string') {
            const fileEvent: FileChangeEvent = {
              type: 'file_change',
              event: raw.event,
              path: raw.path,
              timestamp: raw.timestamp,
            };
            setLastFileChange(fileEvent);
            onFileChange?.(fileEvent);
          }
          
          onMessage?.(raw as unknown as WebSocketMessage);
        } catch (e) {
          console.error('WebSocket 消息解析失败:', e);
        }
      };

      ws.onerror = () => {
        setStatus('error');
        if (showToast) {
          Message.error(i18n.t('webSocket.connectionFailed'));
        }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        wsRef.current = null;

        // 自动重连
        if (shouldReconnectRef.current && autoReconnect) {
          reconnectAttemptsRef.current += 1;
          if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            console.warn(`[WebSocket] 已达到最大重连次数 (${maxReconnectAttempts})，停止重连`);
            onDisconnect?.();
            return;
          }
          clearReconnectTimer();
          reconnectTimerRef.current = window.setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else {
          onDisconnect?.();
        }
      };
    } catch (e) {
      setStatus('error');
      console.error('WebSocket 连接失败:', e);
    }
  }, [url, autoReconnect, reconnectInterval, showToast, onConnect, onDisconnect, onMessage, onFileChange, clearReconnectTimer]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket 未连接，无法发送消息');
    }
  }, []);

  // 组件挂载时自动连接
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    isConnected: status === 'connected',
    connect,
    disconnect,
    send,
    lastFileChange,
  };
}

export default useWebSocket;
