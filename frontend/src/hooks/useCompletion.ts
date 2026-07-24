import { useState, useCallback, useRef, useEffect } from 'react';

export interface CompletionConfig {
  enabled: boolean;
  require_confirm: boolean;
  trigger_delay: number;
  max_tokens: number;
}

export interface CompletionState {
  suggestion: string;
  isLoading: boolean;
  isVisible: boolean;
  backendReady: boolean | null;
}

const DEFAULT_CONFIG: CompletionConfig = {
  enabled: true,
  require_confirm: false,
  trigger_delay: 500,
  max_tokens: 50,
};

/**
 * 智能补全 Hook
 * 
 * 提供两种模式：
 * 1. 实时预览模式 (require_confirm=false): 输入时自动显示灰色补全，Tab 接受
 * 2. Tab 触发模式 (require_confirm=true): 按 Tab 触发显示补全，Enter 接受
 */
export function useCompletion() {
  const [config, setConfig] = useState<CompletionConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<CompletionState>({
    suggestion: '',
    isLoading: false,
    isVisible: false,
    backendReady: null,
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPrefixRef = useRef<string>('');
  const accumulatedTextRef = useRef<string>('');

  // 加载配置并检测后端可用性
  useEffect(() => {
    fetch('/api/completion/config')
      .then(res => {
        setState(prev => ({ ...prev, backendReady: res.ok }));
        return res.json();
      })
      .then(data => {
        if (data.success && data.config) {
          setConfig(data.config);
        }
      })
      .catch(() => {
        setState(prev => ({ ...prev, backendReady: false }));
      });
  }, []);

  // 保存配置
  const saveConfig = useCallback(async (newConfig: Partial<CompletionConfig>) => {
    const updated = { ...config, ...newConfig };
    try {
      const res = await fetch('/api/completion/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setConfig(updated);
      }
    } catch (e) {
      console.error('Failed to save completion config:', e);
    }
  }, [config]);

  // 请求补全
  const requestCompletion = useCallback(async (prefix: string, context?: string) => {
    if (!config.enabled || !prefix.trim()) {
      setState(prev => ({ ...prev, suggestion: '', isVisible: false }));
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    accumulatedTextRef.current = '';

    setState(prev => ({ ...prev, isLoading: true, isVisible: false }));

    try {
      const response = await fetch('/api/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix,
          context: context || prefix,
          max_tokens: config.max_tokens,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorMessage = response.status === 403 
          ? 'API 认证失败，请检查 API Key 配置'
          : response.status === 400
            ? '请求参数错误'
            : response.status === 500
              ? '服务器内部错误'
              : `请求失败: ${response.status}`;
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let consecutiveParseErrors = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              consecutiveParseErrors = 0;
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                accumulatedTextRef.current += data.text;
                setState(prev => ({
                  ...prev,
                  suggestion: accumulatedTextRef.current,
                  isVisible: true,
                  isLoading: false,
                }));
              }
              if (data.done) {
                setState(prev => ({ ...prev, isLoading: false }));
              }
              if (data.error) {
                console.error('Completion error:', data.error);
                setState(prev => ({ ...prev, isLoading: false, isVisible: false }));
              }
            } catch (e) {
              consecutiveParseErrors++;
              if (consecutiveParseErrors >= 5) {
                console.error('Completion: too many parse errors, resetting state');
                setState(prev => ({ ...prev, isLoading: false, isVisible: false }));
                return;
              }
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Completion error:', error);
        setState(prev => ({ ...prev, backendReady: false, isLoading: false }));
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, [config.enabled, config.max_tokens]);

  // 触发补全（带防抖）
  const triggerCompletion = useCallback((prefix: string, context?: string) => {
    currentPrefixRef.current = prefix;

    // 清除之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 如果未启用或前缀为空，隐藏补全
    if (!config.enabled || !prefix.trim()) {
      setState(prev => ({ ...prev, suggestion: '', isVisible: false }));
      return;
    }

    // 实时预览模式：自动触发
    if (!config.require_confirm) {
      debounceTimerRef.current = setTimeout(() => {
        requestCompletion(prefix, context);
      }, config.trigger_delay);
    }
  }, [config.enabled, config.require_confirm, config.trigger_delay, requestCompletion]);

  // Tab 键触发（用于 Tab 触发模式）
  const handleTabTrigger = useCallback((prefix: string, context?: string) => {
    if (!config.enabled) return false;
    
    // Tab 触发模式
    if (config.require_confirm) {
      // 如果已经显示补全，则接受它
      if (state.isVisible && state.suggestion) {
        return true; // 表示应该接受补全
      }
      // 否则触发新的补全请求
      requestCompletion(prefix, context);
      return false;
    }
    
    // 实时预览模式：接受当前显示的补全
    return state.isVisible && !!state.suggestion;
  }, [config.enabled, config.require_confirm, state.isVisible, state.suggestion, requestCompletion]);

  // 接受补全
  const acceptCompletion = useCallback(() => {
    const suggestion = state.suggestion;
    setState(prev => ({ ...prev, suggestion: '', isVisible: false }));
    return suggestion;
  }, [state.suggestion]);

  // 取消/隐藏补全
  const dismissCompletion = useCallback(() => {
    setState(prev => ({ ...prev, suggestion: '', isVisible: false }));
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    config,
    setConfig: saveConfig,
    state,
    triggerCompletion,
    handleTabTrigger,
    acceptCompletion,
    dismissCompletion,
  };
}
