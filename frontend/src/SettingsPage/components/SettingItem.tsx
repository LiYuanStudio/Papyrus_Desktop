import { Typography, Tag, Tooltip } from '@arco-design/web-react';
import { IconQuestionCircle } from '@arco-design/web-react/icon';

const { Text, Paragraph } = Typography;

export interface SettingItemProps {
  title: string;
  desc?: string;
  children: React.ReactNode;
  divider?: boolean;
  badge?: 'AA' | 'AAA';
  tooltip?: string;
}

const SettingItem = ({ 
  title, 
  desc, 
  children,
  divider = true,
  badge,
  tooltip,
}: SettingItemProps) => (
  <div className="settings-item">
    <div className="settings-item-content">
      <div className="settings-item-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text bold className="settings-item-title">{title}</Text>
          {badge && (
            <Tag 
              size="small" 
              color={badge === 'AAA' ? 'orange' : 'green'}
              style={{ fontSize: 11 }}
            >
              {badge}
            </Tag>
          )}
          {tooltip && (
            <Tooltip content={tooltip}>
              <IconQuestionCircle style={{ fontSize: 14, color: 'var(--color-text-3)' }} />
            </Tooltip>
          )}
        </div>
        {desc && <Paragraph type="secondary" className="settings-item-desc">{desc}</Paragraph>}
      </div>
      <div className="settings-item-control">
        {children}
      </div>
    </div>
    {divider && <div className="settings-item-divider" />}
  </div>
);

export default SettingItem;
