import { useState, useEffect } from 'react';
import { Card, Switch, Button, Input, Divider, Tag, Popconfirm, Message, Typography } from '@arco-design/web-react';
import { IconDown, IconLeft, IconSafe, IconPlus, IconDelete } from '@arco-design/web-react/icon';
import { ProviderLogo } from '../../../../icons/ProviderLogo';
import { api } from '../../../../api';
import { notifyAIConfigChanged } from '../utils';
import type { Provider, ApiKeyItem } from '../types';

const { Text, Paragraph } = Typography;

interface ProvidersSectionProps {
  providers: Provider[];
  loadProviders: () => void;
  deleteProvider: (id: string) => void;
  setDefault: (id: string) => void;
  syncKeyToAIConfig: (providerType: string, apiKey: string) => void;
  t: (key: string) => string;
}

const ProvidersSection = ({ providers, loadProviders, deleteProvider, setDefault, syncKeyToAIConfig, t }: ProvidersSectionProps) => {
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [editingProviders, setEditingProviders] = useState<Provider[]>(providers);
  const [saveProviderLoading, setSaveProviderLoading] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    setEditingProviders(providers);
  }, [providers]);
  
  const toggleExpand = (providerId: string) => {
    const newExpanded = new Set(expandedProviders);
    if (newExpanded.has(providerId)) {
      newExpanded.delete(providerId);
    } else {
      newExpanded.add(providerId);
    }
    setExpandedProviders(newExpanded);
  };
  
  const updateEditingProvider = (id: string, updates: Partial<Provider>) => {
    setEditingProviders(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };
  
  const addApiKey = (providerId: string) => {
    const provider = editingProviders.find(p => p.id === providerId);
    if (!provider) return;
    const newKey: ApiKeyItem = {
      id: crypto.randomUUID(),
      name: `key-${provider.apiKeys.length + 1}`,
      key: ''
    };
    updateEditingProvider(providerId, {
      apiKeys: [...provider.apiKeys, newKey]
    });
  };
  
  const removeApiKey = (providerId: string, keyId: string) => {
    const provider = editingProviders.find(p => p.id === providerId);
    if (!provider) return;
    updateEditingProvider(providerId, {
      apiKeys: provider.apiKeys.filter(k => k.id !== keyId)
    });
  };
  
  const updateApiKey = (providerId: string, keyId: string, updates: Partial<ApiKeyItem>) => {
    const provider = editingProviders.find(p => p.id === providerId);
    if (!provider) return;
    updateEditingProvider(providerId, {
      apiKeys: provider.apiKeys.map(k => k.id === keyId ? { ...k, ...updates } : k)
    });
  };
  
  const saveProviderChanges = (providerId: string) => {
    if (saveProviderLoading.has(providerId)) return;
    const provider = editingProviders.find(p => p.id === providerId);
    if (!provider) return;

    setSaveProviderLoading(prev => new Set(prev).add(providerId));
    api.updateProvider(providerId, {
      name: provider.name,
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
      apiKeys: provider.apiKeys,
    })
      .then(data => {
        if (data.success) {
          Message.success(t('chatView.supplierConfigSaved'));
          loadProviders();
          notifyAIConfigChanged();
          const firstKey = provider.apiKeys.find(k => k.key.trim() !== '' && !/^\*+/.test(k.key.trim()));
          if (firstKey) {
            syncKeyToAIConfig(provider.type, firstKey.key);
          }
        } else {
          Message.error(data.error || t('chatView.saveFailed'));
        }
      })
      .catch(err => {
        console.error('Failed to save provider config:', err);
        Message.error(t('chatView.saveFailed'));
      })
      .finally(() => {
        setSaveProviderLoading(prev => {
          const next = new Set(prev);
          next.delete(providerId);
          return next;
        });
      });
  };
  
  return (
    <>
      {editingProviders.map(provider => {
        const isExpanded = expandedProviders.has(provider.id);
        return (
          <Card key={provider.id} style={{ marginBottom: 12, borderRadius: 12, border: '1px solid var(--color-border-2)' }} bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div 
                style={{ flex: 1, cursor: 'pointer' }} 
                onClick={() => toggleExpand(provider.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <ProviderLogo type={provider.type} name={provider.name} size={20} />
                  <Text bold>{provider.name}</Text>
                  {provider.isDefault && <Tag color="arcoblue" size="small">{t('chatView.default')}</Tag>}
                  {!provider.enabled && <Tag color="gray" size="small">{t('chatView.disabled')}</Tag>}
                </div>
                <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
                  {provider.baseUrl || t('chatView.notConfigured')}
                </Paragraph>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <Button 
                  type="text" 
                  size="mini" 
                  icon={isExpanded ? <IconDown /> : <IconLeft />}
                  onClick={() => toggleExpand(provider.id)}
                />
                <Switch size="small" checked={provider.enabled} onChange={(checked) => {
                  updateEditingProvider(provider.id, { enabled: checked });
                  api.updateProviderEnabled(provider.id, checked)
                    .then(data => {
                      if (data.success) {
                        loadProviders();
                        notifyAIConfigChanged();
                      } else {
                        Message.error(data.error || t('chatView.updateFailed'));
                        loadProviders();
                      }
                    })
                    .catch(err => {
                      console.error('Failed to update provider status:', err);
                      Message.error(t('chatView.updateFailed'));
                      loadProviders();
                    });
                }} />
                <Button type="text" size="mini" icon={<IconSafe />} onClick={() => setDefault(provider.id)} disabled={provider.isDefault} />
                <Popconfirm title={t('chatView.confirmDeleteProvider')} onOk={() => deleteProvider(provider.id)} disabled={provider.isDefault}>
                  <Button type="text" size="mini" icon={<IconDelete />} status="danger" disabled={provider.isDefault} />
                </Popconfirm>
              </div>
            </div>

            {isExpanded && (
              <>
                <Divider style={{ margin: '16px 0' }} />
                <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontSize: 12 }}>API Key</Text>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {provider.apiKeys.map((apiKey, index) => (
                        <div key={apiKey.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <Input
                            value={apiKey.name}
                            onChange={(v) => updateApiKey(provider.id, apiKey.id, { name: v })}
                            style={{ width: 100, border: '1px solid var(--color-border-2)', borderRadius: '6px', background: 'var(--color-bg-2)', fontSize: 12, textAlign: 'center' }}
                          />
                          <Input.Password 
                            value={apiKey.key}
                            onChange={(v) => updateApiKey(provider.id, apiKey.id, { key: v })}
                            placeholder={apiKey.hasKey && !apiKey.key ? t('chatView.configured') : `Enter ${t('chatView.apiKey')}`}
                            style={{ flex: 1, border: '1px solid var(--color-border-2)', borderRadius: '6px', background: 'var(--color-bg-2)' }}
                          />
                          {index === 0 ? (
                            <Button 
                              type="primary" 
                              icon={<IconPlus />} 
                              size="mini"
                              onClick={() => addApiKey(provider.id)}
                              style={{ background: 'var(--color-primary)', borderRadius: '4px' }}
                            />
                          ) : (
                            <Button 
                              type="text" 
                              icon={<IconDelete />} 
                              size="mini"
                              status="danger"
                              onClick={() => removeApiKey(provider.id, apiKey.id)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Text style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>Base URL</Text>
                    <Input 
                      value={provider.baseUrl}
                      onChange={(v) => updateEditingProvider(provider.id, { baseUrl: v })}
                      placeholder="https://api.example.com/v1" 
                      style={{ width: '100%' }} 
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <Button 
                      type="primary" 
                      size="small"
                      onClick={() => saveProviderChanges(provider.id)}
                      loading={saveProviderLoading.has(provider.id)}
                    >
                      {t('chatView.save')}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        );
      })}
    </>
  );
};

export default ProvidersSection;