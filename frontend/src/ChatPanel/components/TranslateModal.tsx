import { useEffect, useRef, useState } from 'react';
import { Modal, Button, Message as ArcoMessage, Spin } from '@arco-design/web-react';
import { IconCopy } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import { MarkdownView } from '../../components/MarkdownView';
import { authFetch } from '../utils';
import { copyToClipboard } from '../utils/clipboard';

export interface TranslateModalProps {
  visible: boolean;
  sourceText: string;
  /**
   * 聊天面板当前选中模型 API ID。
   * 仅在未配置完整 translation_* 时由后端作为 fallback；已配置翻译模型时会被忽略。
   */
  fallbackModelId?: string;
  onClose: () => void;
}

/**
 * 聊天消息翻译弹窗。
 * 始终把聊天当前模型作为 fallback 传给后端，保证 fresh-provider（current_model 为空）时仍可翻译；
 * 后端在已配置 translation_* 时优先使用设置页选择，不会被聊天工具栏覆盖。
 * 未在弹窗内再拉配置：避免与后端解析逻辑分叉。
 */
export function TranslateModal({ visible, sourceText, fallbackModelId, onClose }: TranslateModalProps) {
  const { t } = useTranslation();
  const [translatedText, setTranslatedText] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible || !sourceText.trim()) {
      return undefined;
    }

    setTranslatedText('');
    setLoading(true);
    abortRef.current = new AbortController();

    const run = async () => {
      try {
        const body: { text: string; model?: string } = { text: sourceText };
        if (fallbackModelId?.trim()) {
          body.model = fallbackModelId.trim();
        }

        const response = await authFetch('/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortRef.current?.signal,
        });

        if (!response.ok) {
          let errMsg = t('chatMessageActions.translateFailed');
          try {
            const errBody = await response.json();
            if (typeof errBody.error === 'string') errMsg = errBody.error;
          } catch { /* ignore */ }
          throw new Error(errMsg);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error(t('chatMessageActions.translateFailed'));
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim().startsWith('data: ')) continue;
            try {
              const jsonStr = line.trim().slice(6);
              const event = JSON.parse(jsonStr) as { type?: string; data?: string };
              if (event.type === 'text' && typeof event.data === 'string') {
                setTranslatedText((prev) => prev + event.data);
              } else if (event.type === 'error') {
                throw new Error(
                  typeof event.data === 'string' ? event.data : t('chatMessageActions.translateFailed'),
                );
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== t('chatMessageActions.translateFailed')) {
                throw parseErr;
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        const msg = error instanceof Error ? error.message : t('chatMessageActions.translateFailed');
        ArcoMessage.error(msg);
        setTranslatedText(`❌ ${msg}`);
      } finally {
        setLoading(false);
      }
    };

    void run();

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [visible, sourceText, fallbackModelId, t]);

  const handleCopy = () => {
    if (!translatedText) return;
    void copyToClipboard(
      translatedText,
      () => ArcoMessage.success(t('chatMessageActions.copied')),
      () => ArcoMessage.error(t('chatMessageActions.copyFailed')),
    );
  };

  return (
    <Modal
      title={t('chatMessageActions.translateTitle')}
      visible={visible}
      onCancel={onClose}
      footer={(
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<IconCopy />} disabled={!translatedText || loading} onClick={handleCopy}>
            {t('chatMessageActions.copyTranslation')}
          </Button>
        </>
      )}
      style={{ width: 640 }}
      unmountOnExit
    >
      <div className="tw-min-h-[120px] tw-max-h-[60vh] tw-overflow-y-auto">
        {loading && translatedText.length === 0 ? (
          <div className="tw-flex tw-items-center tw-justify-center tw-py-8 tw-gap-2">
            <Spin />
            <span>{t('chatMessageActions.translating')}</span>
          </div>
        ) : (
          <MarkdownView source={translatedText || t('chatMessageActions.translating')} compact />
        )}
      </div>
    </Modal>
  );
}
