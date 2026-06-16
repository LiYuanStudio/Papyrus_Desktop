import { useCallback } from 'react';
import { Tag, Tooltip, Trigger } from '@arco-design/web-react';
import { IconCheck, IconDown } from '@arco-design/web-react/icon';
import type { SelectedFile } from '../types';
import { ChatToolbar } from './ChatToolbar';
import { MAX_FILES } from '../utils';

export interface ChatInputProps {
  text: string;
  setText: React.Dispatch<React.SetStateAction<string>>;
  selectedFiles: SelectedFile[];
  isGenerating: boolean;
  configChecked: boolean;
  mode: string;
  reasoning: boolean;
  agentModeEnabled: boolean;
  availableModels: { key: string; label: string }[];
  onFilesChange: React.Dispatch<React.SetStateAction<SelectedFile[]>>;
  onFileSelect: () => void;
  onSendMessage: () => void;
  onStopGeneration: () => void;
  onModeChange: (mode: string) => void;
  onReasoningChange: (reasoning: boolean) => void;
  onMentionInsert: (value: string) => void;
  selectedModelName?: string;
  selectedModelId?: string;
  onModelSelect: (modelId: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  getFileIcon: (type: 'image' | 'document' | 'unknown', name: string) => React.ReactElement;
  formatFileSize: (bytes: number) => string;
  removeFile: (fileId: string) => void;
  clearAllFiles: () => void;
}

export function ChatInput({
  text,
  setText,
  selectedFiles,
  isGenerating,
  configChecked,
  mode,
  reasoning,
  agentModeEnabled,
  availableModels,
  onFileSelect,
  onSendMessage,
  onStopGeneration,
  onModeChange,
  onReasoningChange,
  onMentionInsert,
  selectedModelName,
  selectedModelId,
  onModelSelect,
  fileInputRef,
  onFileInputChange,
  getFileIcon,
  formatFileSize,
  removeFile,
  clearAllFiles,
}: ChatInputProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSendMessage();
      }
    },
    [onSendMessage],
  );

  return (
    <div className="chat-input-area" style={{ minHeight: 118, height: 'auto' }}>
      {selectedFiles.length > 0 && (
        <div className="chat-file-list">
          <div className="chat-file-list-header">
            <span className="chat-file-list-title">
              已选择 {selectedFiles.length}/{MAX_FILES} 个文件
            </span>
            <button
              className="chat-file-list-clear"
              onClick={clearAllFiles}
              aria-label="清空所有文件"
            >
              清空
            </button>
          </div>
          <div className="chat-file-list-content">
            {selectedFiles.map((file) => (
              <Tag
                key={file.id}
                className="chat-file-tag"
                closable
                icon={getFileIcon(file.type, file.name)}
                onClose={() => removeFile(file.id)}
                aria-label={`${file.name} (${formatFileSize(file.size)})`}
              >
                <Tooltip
                  content={`${file.name} (${formatFileSize(file.size)})`}
                  mini
                >
                  <span className="chat-file-tag-text">{file.name}</span>
                </Tooltip>
              </Tag>
            ))}
          </div>
        </div>
      )}
      <textarea
        className="chat-textarea"
        placeholder={
          !configChecked
            ? '正在加载配置...'
            : selectedFiles.length > 0
            ? '添加消息描述（可选）...'
            : '发送消息...'
        }
        aria-label="消息输入框，按 Enter 发送"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isGenerating || !configChecked}
      />
      <div className="chat-input-meta">
        <Trigger
          trigger="click"
          position="top"
          disabled={availableModels.length === 0 || isGenerating}
          popup={() => (
            <div className="chat-model-popup" role="listbox" aria-label="模型列表">
              {availableModels.length === 0 ? (
                <div className="chat-model-popup-empty">
                  {configChecked ? '暂无可用模型' : '正在加载模型...'}
                </div>
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
            className="chat-model-btn chat-model-btn-inline"
            aria-label={selectedModelName ? `当前模型：${selectedModelName}` : '选择模型'}
            disabled={availableModels.length === 0 || isGenerating}
          >
            <span>{selectedModelName || '选择模型'}</span>
            <IconDown className="tw-text-xs" />
          </button>
        </Trigger>
      </div>
      <ChatToolbar
        mode={mode}
        reasoning={reasoning}
        isGenerating={isGenerating}
        agentModeEnabled={agentModeEnabled}
        selectedFiles={selectedFiles}
        onModeChange={onModeChange}
        onReasoningChange={onReasoningChange}
        onMentionInsert={onMentionInsert}
        selectedModelName={selectedModelName}
        onFileSelect={onFileSelect}
        onSendMessage={onSendMessage}
        onStopGeneration={onStopGeneration}
        text={text}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.docx"
        style={{ display: 'none' }}
        onChange={onFileInputChange}
        aria-label="文件选择输入"
      />
    </div>
  );
}
