import { Dropdown, Menu, Tooltip, Trigger } from '@arco-design/web-react';
import {
  IconArrowUp,
  IconAt,
  IconBulb,
  IconTool,
  IconRecordStop,
  IconCheck,
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
  onModeChange: (mode: string) => void;
  onReasoningChange: (reasoning: false | 'low' | 'medium' | 'high' | 'very_high') => void;
  onMentionInsert: (value: string) => void;
  onFileSelect: () => void;
  onSendMessage: () => void;
  onStopGeneration: () => void;
  text: string;
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
  onModeChange,
  onReasoningChange,
  onMentionInsert,
  onFileSelect,
  onSendMessage,
  onStopGeneration,
  text,
}: ChatToolbarProps) {
  const { t } = useTranslation();
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
                    {m.key === 'agent' && !agentModeEnabled && (
                      <span className="chat-mode-menu-item-disabled">
                        (已禁用)
                      </span>
                    )}
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
        <Tooltip content="上传文件" mini>
          <button
            className="chat-toolbar-btn chat-toolbar-btn-dark"
            onClick={onFileSelect}
            aria-label="上传文件"
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
            <Menu className="chat-reasoning-menu">
              {[
                { key: false, label: t('chat.reasoningOff') },
                { key: 'low', label: t('chat.reasoningLow') },
                { key: 'medium', label: t('chat.reasoningMedium') },
                { key: 'high', label: t('chat.reasoningHigh') },
                { key: 'very_high', label: t('chat.reasoningVeryHigh') },
              ].map((item) => (
                <Menu.Item
                  key={String(item.key)}
                  className={reasoning === item.key ? 'chat-reasoning-item-active' : ''}
                  onClick={() => onReasoningChange(item.key as false | 'low' | 'medium' | 'high' | 'very_high')}
                >
                  <span className="chat-reasoning-item-label">{item.label}</span>
                  {reasoning === item.key && <IconCheck className="chat-reasoning-item-check" />}
                </Menu.Item>
              ))}
            </Menu>
          }
        >
          <button
            className={`chat-toolbar-btn${reasoning ? ' chat-toolbar-btn-active' : ''}`}
            title={reasoning ? `${t('chat.reasoning')}：${t('chat.reasoning' + (reasoning === 'very_high' ? 'VeryHigh' : reasoning.charAt(0).toUpperCase() + reasoning.slice(1)))}` : t('chat.reasoning')}
            aria-label={reasoning ? `${t('chat.reasoning')}：${t('chat.reasoning' + (reasoning === 'very_high' ? 'VeryHigh' : reasoning.charAt(0).toUpperCase() + reasoning.slice(1)))}` : t('chat.reasoning')}
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
