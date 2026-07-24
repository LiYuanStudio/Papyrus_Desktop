import React, { useState } from 'react';
import { Collapse } from '@arco-design/web-react';
import { IconBulb, IconRight, IconDown } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import { MarkdownView } from './MarkdownView';
import './ReasoningChain.css';

const CollapseItem = Collapse.Item;

export interface ReasoningChainProps {
  content: string;
  defaultExpanded?: boolean;
}

export const ReasoningChain: React.FC<ReasoningChainProps> = ({
  content,
  defaultExpanded = false,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const headerLabel = isExpanded
    ? t('reasoningChain.process')
    : t('reasoningChain.completed');

  return (
    <div className="reasoning-chain">
      <Collapse
        bordered={false}
        activeKey={isExpanded ? ['1'] : []}
        onChange={(_key, keys) => setIsExpanded(keys.includes('1'))}
        className="reasoning-collapse"
      >
        <CollapseItem
          name="1"
          header={(
            <div className="reasoning-header">
              <div className="reasoning-title-left">
                <IconBulb className="reasoning-icon" aria-hidden="true" />
                <span className="reasoning-title">{headerLabel}</span>
              </div>
              <span className="reasoning-expand-indicator" aria-hidden="true">
                {isExpanded ? <IconDown /> : <IconRight />}
              </span>
            </div>
          )}
          className="reasoning-collapse-item"
        >
          <div className="reasoning-content">
            <MarkdownView source={content} compact />
          </div>
        </CollapseItem>
      </Collapse>
    </div>
  );
};

export default ReasoningChain;
