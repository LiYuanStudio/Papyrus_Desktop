import { Card, Button, Space, Popconfirm, Tag, Typography } from '@arco-design/web-react';
import { IconSafe, IconEdit, IconDelete, IconRobot } from '@arco-design/web-react/icon';
import { ProviderLogo } from '../../../../icons/ProviderLogo';
import { ModelLogo } from '../../../../icons/ModelLogo';
import type { Provider, Model } from '../types';

const { Text, Paragraph } = Typography;

interface ModelsSectionProps {
  providers: Provider[];
  currentModelId: string;
  saveDefaultModel: (id: string) => void;
  deleteModel: (providerId: string, modelId: string) => void;
  openModelModal: (providerId?: string, model?: Model) => void;
  renderCapabilityIcons: (capabilities: string[], t: (key: string) => string) => React.ReactNode;
  t: (key: string) => string;
}

const ModelsSection = ({ providers, currentModelId, saveDefaultModel, deleteModel, openModelModal, renderCapabilityIcons, t }: ModelsSectionProps) => {
  const enabledProviders = providers.filter(p => p.enabled && p.models.length > 0);

  if (enabledProviders.length === 0) {
    const hasEnabledProviders = providers.some(p => p.enabled);
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <IconRobot style={{ fontSize: 48, color: 'var(--color-text-4)', marginBottom: 16 }} />
        <Paragraph type="secondary" style={{ fontSize: 14 }}>
          {hasEnabledProviders
            ? t('chatView.noModelsYet')
            : t('chatView.noEnabledProviders')}
        </Paragraph>
      </div>
    );
  }
  
  return (
    <>
      {enabledProviders.map(provider => (
        <div key={provider.id} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ProviderLogo type={provider.type} name={provider.name} size={20} />
            <Text bold style={{ fontSize: 16 }}>{provider.name}</Text>
            {provider.isDefault && <Tag color="arcoblue" size="small">{t('chatView.default')}</Tag>}
          </div>
          {provider.models.map(model => {
            const apiKey = provider.apiKeys.find(k => k.id === model.apiKeyId);
            return (
              <Card key={model.id} style={{ marginBottom: 10, borderRadius: 12, border: currentModelId === model.id ? '1px solid var(--color-primary)' : '1px solid var(--color-border-2)' }} bodyStyle={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ModelLogo model={model.name} modelId={model.modelId || model.id} size={18} />
                      <Text bold style={{ fontSize: 14 }}>{model.name}</Text>
                      {renderCapabilityIcons(model.capabilities, t)}
                    </div>
                    <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0 0' }}>
                      Key: {apiKey?.name || 'default'} {(apiKey?.hasKey || apiKey?.key) ? `(${t('chatView.configured')})` : `(${t('chatView.notConfigured')})`}
                    </Paragraph>
                  </div>
                  <Space size={4}>
                    <Button type="text" size="mini" icon={<IconSafe />} onClick={() => saveDefaultModel(model.id)} disabled={currentModelId === model.id} title={t('chatView.setAsDefault')} />
                    <Button type="text" size="mini" icon={<IconEdit />} onClick={() => openModelModal(provider.id, model)} title={t('chatView.edit')} />
                    <Popconfirm title={t('chatView.confirmDeleteModel')} onOk={() => deleteModel(provider.id, model.id)}>
                      <Button type="text" size="mini" icon={<IconDelete />} status="danger" />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            );
          })}
        </div>
      ))}
    </>
  );
};

export default ModelsSection;