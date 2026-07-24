/**
 * 屏幕阅读器通知组件
 * 
 * 为动态内容更新提供 ARIA live region 支持
 * 符合 WCAG 4.1.3 Status Messages (AA 级)
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';

// ============================================
// 类型定义
// ============================================

export type AnnouncePriority = 'polite' | 'assertive' | 'off';

export interface Announcement {
  id: string;
  message: string;
  priority: AnnouncePriority;
  timestamp: number;
}

// ============================================
// Context 用于跨组件广播通知
// ============================================

interface AnnouncerContextType {
  announce: (message: string, priority?: AnnouncePriority) => void;
  clear: () => void;
}

const AnnouncerContext = React.createContext<AnnouncerContextType | null>(null);

// ============================================
// Provider 组件
// ============================================

interface ScreenReaderAnnouncerProviderProps {
  children: React.ReactNode;
  /**  politeness timeout in ms */
  timeout?: number;
}

export const ScreenReaderAnnouncerProvider: React.FC<ScreenReaderAnnouncerProviderProps> = ({
  children,
  timeout = 1000,
}) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const idCounter = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // 清理所有定时器
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const announce = useCallback((message: string, priority: AnnouncePriority = 'polite') => {
    const id = `announce-${++idCounter.current}-${Date.now()}`;
    const announcement: Announcement = {
      id,
      message,
      priority,
      timestamp: Date.now(),
    };
    
    setAnnouncements(prev => [...prev, announcement]);
    
    // 自动清理
    const timer = setTimeout(() => {
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      timersRef.current.delete(timer);
    }, timeout + 100);
    
    timersRef.current.add(timer);
  }, [timeout]);

  const clear = useCallback(() => {
    setAnnouncements([]);
  }, []);

  // 分离不同优先级的消息
  const politeMessages = announcements.filter(a => a.priority === 'polite');
  const assertiveMessages = announcements.filter(a => a.priority === 'assertive');

  return (
    <AnnouncerContext.Provider value={{ announce, clear }}>
      {children}
      
      {/* ARIA Live Regions - 屏幕阅读器专用 */}
      {/* polite: 不中断用户，等待空闲时朗读 */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {politeMessages.map(a => (
          <div key={a.id}>{a.message}</div>
        ))}
      </div>
      
      {/* assertive: 立即中断当前朗读 */}
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        role="alert"
      >
        {assertiveMessages.map(a => (
          <div key={a.id}>{a.message}</div>
        ))}
      </div>
    </AnnouncerContext.Provider>
  );
};

// ============================================
// Hook
// ============================================

export const useAnnouncer = (): AnnouncerContextType => {
  const context = React.useContext(AnnouncerContext);
  if (!context) {
    throw new Error('useAnnouncer must be used within ScreenReaderAnnouncerProvider');
  }
  return context;
};

// ============================================
// 便捷 Hook
// ============================================

/** 发送 polite 通知 */
export const useAnnouncePolite = (): (message: string) => void => {
  const { announce } = useAnnouncer();
  return useCallback(
    (message: string) => announce(message, 'polite'),
    [announce]
  );
};

/** 发送 assertive 通知 */
export const useAnnounceAssertive = (): (message: string) => void => {
  const { announce } = useAnnouncer();
  return useCallback(
    (message: string) => announce(message, 'assertive'),
    [announce]
  );
};

// ============================================
// 独立组件（如果不想使用 Provider）
// ============================================

interface ScreenReaderAnnouncerProps {
  /** 当前要朗读的消息 */
  message?: string;
  /** 优先级 */
  priority?: AnnouncePriority;
  /** 消息变化时触发 */
  onAnnounce?: () => void;
}

/**
 * 独立通知组件
 * 用于简单场景，直接通过 props 控制
 */
export const ScreenReaderAnnouncer: React.FC<ScreenReaderAnnouncerProps> = ({
  message,
  priority = 'polite',
  onAnnounce,
}) => {
  const [currentMessage, setCurrentMessage] = useState('');
  const prevMessageRef = useRef('');

  useEffect(() => {
    if (message && message !== prevMessageRef.current) {
      setCurrentMessage(message);
      prevMessageRef.current = message;
      onAnnounce?.();
      
      // 清空消息以确保重复内容也能被朗读
      const timer = setTimeout(() => {
        setCurrentMessage('');
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [message, onAnnounce]);

  if (!currentMessage) return null;

  return (
    <div
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
      role={priority === 'assertive' ? 'alert' : 'status'}
    >
      {currentMessage}
    </div>
  );
};

export default ScreenReaderAnnouncer;
