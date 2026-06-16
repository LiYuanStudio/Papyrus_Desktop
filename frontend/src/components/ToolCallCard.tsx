import React, { useState } from 'react';
import { Collapse, Tag, Button, Spin, Descriptions } from '@arco-design/web-react';
import { IconRight, IconDown, IconTool, IconCheck, IconClose, IconLoading } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import './ToolCallCard.css';

const CollapseItem = Collapse.Item;

export type ToolCallStatus = 'pending' | 'executing' | 'success' | 'failed';

export interface ToolCallCardProps {
  toolName: string;
  icon?: React.ReactNode;
  status: ToolCallStatus;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  onApprove?: () => void;
  onReject?: () => void;
  defaultExpanded?: boolean;
  expanded?: boolean;
  serverName?: string;
}

function pickParamPreview(params: Record<string, unknown> | undefined): string | null {
  if (!params || Object.keys(params).length === 0) return null;
  for (const key of ['url', 'title', 'name', 'query', 'keyword', 'note_id', 'topic']) {
    const val = params[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      const s = val.trim();
      return s.length > 60 ? s.slice(0, 60) + '...' : s;
    }
  }
  const firstStr = Object.values(params).find(v => typeof v === 'string' && v.trim().length > 0);
  if (typeof firstStr === 'string') {
    const s = firstStr.trim();
    return s.length > 60 ? s.slice(0, 60) + '...' : s;
  }
  return null;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  toolName,
  icon,
  status,
  params,
  result,
  error,
  onApprove,
  onReject,
  defaultExpanded = false,
  expanded,
  serverName,
}) => {
  const { t } = useTranslation();
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = expanded !== undefined ? expanded : internalExpanded;

  const handleCollapseChange = (_key: string, keys: string[]) => {
    if (expanded === undefined) {
      setInternalExpanded(keys.includes('1'));
    }
  };

  const statusConfig = {
    pending: {
      label: t('toolCallCard.pending'),
      color: 'orange' as const,
      className: 'tool-call-pending',
      icon: <IconTool />,
    },
    executing: {
      label: t('toolCallCard.executing'),
      color: 'blue' as const,
      className: 'tool-call-executing',
      icon: <IconLoading className="tool-call-spin" />,
    },
    success: {
      label: t('toolCallCard.success'),
      color: 'green' as const,
      className: 'tool-call-success',
      icon: <IconCheck />,
    },
    failed: {
      label: t('toolCallCard.failed'),
      color: 'red' as const,
      className: 'tool-call-failed',
      icon: <IconClose />,
    },
  };

  const config = statusConfig[status];
  const paramPreview = pickParamPreview(params);

  const formatJSON = (data: unknown): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const toolLabel = serverName ? `${serverName} : ${toolName}` : toolName;

  return (
    <div className={`tool-call-card ${config.className}`}>
      <Collapse
        bordered={false}
        activeKey={isExpanded ? ['1'] : []}
        onChange={handleCollapseChange}
        className="tool-call-collapse"
      >
        <CollapseItem
          name="1"
          header={(
            <div className="tool-call-header">
              <span className="tool-call-icon">{icon || config.icon}</span>
              <span className="tool-call-name">{toolLabel}</span>
              {paramPreview && (
                <span className="tool-call-param-preview">{paramPreview}</span>
              )}
              <Tag
                color={config.color}
                size="small"
                className="tool-call-status-tag"
              >
                {status === 'executing' ? (
                  <span className="tool-call-status-with-spin">
                    <Spin size={12} />
                    {config.label}
                  </span>
                ) : (
                  config.label
                )}
              </Tag>
              {status === 'pending' && (
                <div className="tool-call-actions" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="primary"
                    size="mini"
                    status="success"
                    onClick={onApprove}
                    className="tool-call-btn"
                  >
                    {t('toolCallCard.approve')}
                  </Button>
                  <Button
                    type="secondary"
                    size="mini"
                    status="danger"
                    onClick={onReject}
                    className="tool-call-btn"
                  >
                    {t('toolCallCard.reject')}
                  </Button>
                </div>
              )}
            </div>
          )}
          expandIcon={
            <div className="tool-call-expand-icon">
              {isExpanded ? <IconDown /> : <IconRight />}
            </div>
          }
          className="tool-call-collapse-item"
        >
          <div className="tool-call-content">
            <div className="tool-call-section">
              <div className="tool-call-section-title">{t('toolCallCard.parameters')}</div>
              <div className="tool-call-section-body">
                {(params && Object.keys(params).length > 0) ? (
                  <Descriptions
                    data={Object.entries(params).map(([key, value]) => ({
                      label: key,
                      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                    }))}
                    layout="inline-vertical"
                    column={1}
                    size="small"
                    className="tool-call-params"
                  />
                ) : (
                  <div className="tool-call-empty">{t('toolCallCard.noParameters')}</div>
                )}
              </div>
            </div>
            {(status === 'success' || status === 'failed') && (
              <div className="tool-call-section">
                <div className="tool-call-section-title">
                  {status === 'failed' ? t('toolCallCard.errorInfo') : t('toolCallCard.result')}
                </div>
                <div className="tool-call-section-body">
                  {status === 'failed' ? (
                    <div className="tool-call-error">
                      <div className="tool-call-error-message">
                        {error || t('toolCallCard.unknownError')}
                      </div>
                    </div>
                  ) : (
                    <pre className="tool-call-result">
                      <code>{result !== undefined && result !== null ? formatJSON(result) : t('toolCallCard.noResult')}</code>
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        </CollapseItem>
      </Collapse>
    </div>
  );
};

export default ToolCallCard;
