import { Dropdown, Menu, Tooltip, Trigger } from '@arco-design/web-react';
import {
  IconArrowUp,
  IconAt,
  IconBulb,
  IconTool,
  IconRecordStop,
  IconCheck,
  IconDown,
} from '@arco-design/web-react/icon';
import IconAgentMode from '../../icons/IconAgentMode';
import { IconMessage } from '@arco-design/web-react/icon';
import { ToolsCatalogPopover } from '../../components/ToolsCatalogPopover';
import { useTranslation } from 'react-i18next';

export interface ChatToolbarProps {
  mode: string;
  reasoning: false | 'low' | 'medium' | 'high' | 'very_high';
  isGenerating: boolean;
  agentModeEnabled: boolean;
  selectedModelName?: string;
  availableModels: { key: string; label: string }[];
  selectedModelId?: string;
  onModelSelect: (modelId: string) => void;
  onModeChange: (mode: string) => void;
  onReasoningChange: (reasoning: false | 'low' | 'medium' | 'high' | 'very_high') => void;
  onMentionInsert: (value: string) => void;
  onFileSelect: () => void;
  onSendMessage: () => void;
  onStopGeneration: () => void;
  text: string;
}

type ReasoningLevel = false | 'low' | 'medium' | 'high' | 'very_high';

const REASONING_LEVEL_LABEL_KEYS: Record<'off' | 'low' | 'medium' | 'high' | 'very_high', string> = {
  off: 'chat.reasoningNone',
  low: 'chat.reasoningLow',
  medium: 'chat.reasoningMedium',
  high: 'chat.reasoningHigh',
  very_high: 'chat.reasoningExtraHigh',
};

const REASONING_OPTIONS: { key: ReasoningLevel; labelKey: string }[] = [
  { key: false, labelKey: REASONING_LEVEL_LABEL_KEYS.off },
  { key: 'low', labelKey: REASONING_LEVEL_LABEL_KEYS.low },
  { key: 'medium', labelKey: REASONING_LEVEL_LABEL_KEYS.medium },
  { key: 'high', labelKey: REASONING_LEVEL_LABEL_KEYS.high },
  { key: 'very_high', labelKey: REASONING_LEVEL_LABEL_KEYS.very_high },
];

function getReasoningLabelKey(level: ReasoningLevel): string {
  return level === false ? REASONING_LEVEL_LABEL_KEYS.off : REASONING_LEVEL_LABEL_KEYS[level];
}

const MODES = [
  { key: 'agent', icon: <IconAgentMode />, label: 'Agent 模式' },
  { key: 'chat', icon: <IconMessage />, label: 'Chat 模式' },
];
const DEFAULT_MODE = MODES[0] ?? { key: 'chat', icon: <IconMessage />, label: 'Chat 模式' };

export function ChatToolbar({
  mode,
  reasoning,
  isGenerating,
  agentModeEnabled,
  selectedModelName,
  availableModels,
  selectedModelId,
  onModelSelect,
  onModeChange,
  onReasoningChange,
  onMentionInsert,
  onFileSelect,
  onSendMessage,
  onStopGeneration,
  text,
}: ChatToolbarProps) {
  const { t } = useTranslation();
  const reasoningTooltip = reasoning
    ? t('chat.reasoningWithLevel', { level: t(getReasoningLabelKey(reasoning)) })
    : t('chat.reasoning');
  const currentMode = MODES.find((m) => m.key === mode) ?? DEFAULT_MODE;
  const canSend = !isGenerating && text.trim().length > 0;
  const mentionItems = [
    {
      key: 'model',
      label: selectedModelName ? `当前模型：${selectedModelName}` : '当前模型（未选择）',
      value: selectedModelName ? `@当前模型(${selectedModelName})` : '@当前模型',
    },
    {
      key: 'mode',
      label: `当前模式：${currentMode.label}`,
      value: `@当前模式(${currentMode.label})`,
    },
    {
      key: 'tools',
      label: mode === 'agent' ? 'Agent 工具列表' : 'Agent 工具列表（切换到 Agent 可用）',
      value: '@工具列表',
      disabled: mode !== 'agent',
    },
  ];

  return (
    <div className="chat-toolbar">
      <div className="chat-toolbar-left">
        <Dropdown
          trigger="click"
          position="tl"
          droplist={
            <Menu onClickMenuItem={(key) => onModeChange(key)}>
              {MODES.map((m) => (
                <Menu.Item
                  key={m.key}
                  disabled={m.key === 'agent' && !agentModeEnabled}
                >
                  <span className="chat-mode-menu-item">
                    {m.icon}
                    <span>{m.label}</span>
                  </span>
                </Menu.Item>
              ))}
            </Menu>
          }
        >
          <button
            className="chat-toolbar-btn chat-mode-btn"
            disabled={!agentModeEnabled && mode === 'agent'}
            aria-label={currentMode.label}
            title={!agentModeEnabled && mode === 'agent' ? 'Agent 模式已在设置中禁用' : ''}
          >
            {currentMode.icon}
          </button>
       </Dropdown>
        <Trigger
          trigger="click"
          position="top"
          disabled={availableModels.length === 0 || isGenerating}
          popup={() => (
            <div className="chat-model-popup" role="listbox" aria-label="模型列表">
              {availableModels.length === 0 ? (
                <div className="chat-model-popup-empty">暂无可用模型</div>
              ) : (
                availableModels.map((model) => (
                  <button
                    key={model.key}
                    type="button"
                    className={`chat-model-option${
                      selectedModelId === model.key ? ' chat-model-option-active' : ''
                    }`}
                    onClick={() => onModelSelect(model.key)}
                  >
                    <span className="chat-model-option-label">{model.label}</span>
                    {selectedModelId === model.key && (
                      <IconCheck className="chat-model-option-check" />
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        >
          <button
            className="chat-toolbar-btn chat-model-btn-icon-only"
            aria-label={selectedModelName ? `当前模型：${selectedModelName}` : '选择模型'}
            title={selectedModelName ? `当前模型：${selectedModelName}` : '选择模型'}
            disabled={availableModels.length === 0 || isGenerating}
          >
            <IconDown className="chat-model-btn-arrow" aria-hidden="true" />
          </button>
        </Trigger>
        <Tooltip content={t('filesPage.uploadFile')} mini>
          <button
            className="chat-toolbar-btn chat-toolbar-btn-dark"
            onClick={onFileSelect}
            aria-label={t('filesPage.uploadFile')}
            disabled={isGenerating}
          >
            <IconAt aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      <div className="chat-toolbar-right">
        <Dropdown
          trigger="click"
          droplist={
            <Menu className="chat-reasoning-menu" aria-label={t('chat.reasoning')}>
              {REASONING_OPTIONS.map((item) => (
                <Menu.Item
                  key={String(item.key)}
                  className={reasoning === item.key ? 'chat-reasoning-item-active' : ''}
                  onClick={() => onReasoningChange(item.key)}
                >
                  <span className="chat-reasoning-item-label">{t(item.labelKey)}</span>
                  {reasoning === item.key && <IconCheck className="chat-reasoning-item-check" />}
                </Menu.Item>
              ))}
            </Menu>
          }
        >
          <button
            className={`chat-toolbar-btn${reasoning ? ' chat-toolbar-btn-active' : ''}`}
            title={reasoningTooltip}
            aria-label={reasoningTooltip}
            aria-pressed={reasoning ? 'true' : 'false'}
          >
            <IconBulb aria-hidden="true" />
          </button>
        </Dropdown>
        <Trigger
          trigger="click"
          popup={() => <ToolsCatalogPopover />}
          disabled={mode !== 'agent'}
        >
          <Tooltip
            content={mode === 'agent' ? '工具列表' : '切换到 Agent 模式以查看工具'}
            mini
          >
            <button
              className={`chat-toolbar-btn${mode !== 'agent' ? ' chat-toolbar-btn-disabled' : ''}`}
              title="工具"
              aria-label="工具"
              disabled={mode !== 'agent'}
            >
              <IconTool aria-hidden="true" />
            </button>
          </Tooltip>
        </Trigger>
        <button
          className={`chat-send-btn${
            isGenerating ? ' chat-send-btn-stop' : !canSend ? ' chat-send-btn-disabled' : ''
          }`}
          onClick={() => (isGenerating ? onStopGeneration() : onSendMessage())}
          disabled={!canSend && !isGenerating}
          title={isGenerating ? '停止生成' : '发送消息'}
          aria-label={isGenerating ? '停止生成' : '发送消息'}
        >
          {isGenerating ? <IconRecordStop /> : <IconArrowUp />}
        </button>
      </div>
    </div>
  );
}
