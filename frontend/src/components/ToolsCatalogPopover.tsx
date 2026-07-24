import React, { useEffect, useState } from 'react';
import { Tag, Typography, Space, Spin } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';

interface ToolInfo {
  name: string;
  category: string;
  side_effect: 'read' | 'write';
  description: string;
}

const useCategoryLabels = (t: (key: string) => string): Record<string, string> => ({
  cards: t('toolsCatalog.categories.cards'),
  notes: t('toolsCatalog.categories.notes'),
  relations: t('toolsCatalog.categories.relations'),
  files: t('toolsCatalog.categories.files'),
  data: t('toolsCatalog.categories.data'),
  extensions: t('toolsCatalog.categories.extensions'),
  settings: t('toolsCatalog.categories.settings'),
});

export const ToolsCatalogPopover: React.FC = () => {
  const { t } = useTranslation();
  const CATEGORY_LABELS = useCategoryLabels(t);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getToolsCatalog().then(res => {
      if (!cancelled && res.success) {
        setTools(res.tools);
      }
      if (!cancelled) setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const grouped = new Map<string, ToolInfo[]>();
  for (const t of tools) {
    const list = grouped.get(t.category) || [];
    list.push(t);
    grouped.set(t.category, list);
  }

  if (loading) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <Spin size={16} />
      </div>
    );
  }

  return (
    <div style={{ padding: 12, maxWidth: 380, maxHeight: 400, overflow: 'auto', backgroundColor: 'var(--color-bg-1)', borderRadius: 4 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        {t('toolsCatalog.title')}
      </Typography.Text>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {Array.from(grouped.entries()).map(([category, items]) => (
          <div key={category}>
            <Typography.Text
              bold
              style={{ fontSize: 12, color: 'var(--color-text-2)', display: 'block', margin: '8px 0 4px' }}
            >
              {CATEGORY_LABELS[category] || category}
            </Typography.Text>
            {items.map(tool => (
              <div key={tool.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '2px 0' }}>
                <Tag size="small" color={tool.side_effect === 'write' ? 'orangered' : 'green'}>
                  {tool.side_effect === 'write' ? t('toolsCatalog.write') : t('toolsCatalog.read')}
                </Tag>
                <Tag size="small" color="arcoblue">{tool.name}</Tag>
                <Typography.Text style={{ fontSize: 12, flex: 1, minWidth: 0 }} type="secondary">
                  {tool.description}
                </Typography.Text>
              </div>
            ))}
          </div>
        ))}
      </Space>
    </div>
  );
};
