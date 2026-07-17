import { Card, Button, Space, Popconfirm, Tag, Typography } from '@arco-design/web-react';
import { IconSafe, IconEdit, IconDelete, IconRobot, IconTranslate } from '@arco-design/web-react/icon';
import { ProviderLogo } from '../../../../icons/ProviderLogo';
import { ModelLogo } from '../../../../icons/ModelLogo';
import type { Provider, Model } from '../types';

const { Text, Paragraph } = Typography;

interface ModelsSectionProps {
  providers: Provider[];
  currentModelId: string;
  translationModelId: string;
  saveDefaultModel: (id: string) => void;
  saveTranslationModel: (id: string) => void;
  deleteModel: (providerId: string, modelId: string) => void;
  openModelModal: (providerId?: string, model?: Model) => void;
  renderCapabilityIcons: (capabilities: string[], t: (key: string) => string) => React.ReactNode;
  t: (key: string) => string;
}

/**
 * 模型管理列表：展示已启用供应商下的模型，并支持设为默认聊天模型 / 翻译模型。
 * 翻译模型单独标记，避免与聊天默认模型混淆；未选翻译模型时后端回退到聊天默认。
 * 未做成独立下拉页：复用卡片操作与「设为默认」一致，降低设置路径认知成本。
 */
const ModelsSection = ({
  providers,
  currentModelId,
  translationModelId,
  saveDefaultModel,
  saveTranslationModel,
  deleteModel,
  openModelModal,
  renderCapabilityIcons,
  t,
}: ModelsSectionProps) => {
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
      <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
        {t('chatView.translationModelHint')}
      </Paragraph>
      {enabledProviders.map(provider => (
        <div key={provider.id} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ProviderLogo type={provider.type} name={provider.name} size={20} />
            <Text bold style={{ fontSize: 16 }}>{provider.name}</Text>
            {provider.isDefault && <Tag color="arcoblue" size="small">{t('chatView.default')}</Tag>}
          </div>
          {provider.models.map(model => {
            const apiKey = provider.apiKeys.find(k => k.id === model.apiKeyId);
            const isDefault = currentModelId === model.id;
            const isTranslation = translationModelId === model.id;
            return (
              <Card
                key={model.id}
                style={{
                  marginBottom: 10,
                  borderRadius: 'var(--radius-lg)',
                  // 选中(默认/翻译)卡用主色描边强调,其余统一发丝边框
                  border: isDefault || isTranslation
                    ? '1px solid var(--color-primary)'
                    : '1px solid var(--color-border-hairline)',
                }}
                bodyStyle={{ padding: 12 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <ModelLogo model={model.name} modelId={model.modelId || model.id} size={18} />
                      <Text bold style={{ fontSize: 14 }}>{model.name}</Text>
                      {isDefault && <Tag color="arcoblue" size="small">{t('chatView.default')}</Tag>}
                      {isTranslation && <Tag color="green" size="small">{t('chatView.translation')}</Tag>}
                      {renderCapabilityIcons(model.capabilities, t)}
                    </div>
                    <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0 0' }}>
                      Key: {apiKey?.name || 'default'} {(apiKey?.hasKey || apiKey?.key) ? `(${t('chatView.configured')})` : `(${t('chatView.notConfigured')})`}
                    </Paragraph>
                  </div>
                  <Space size={4}>
                    <Button
                      type="text"
                      size="mini"
                      icon={<IconSafe />}
                      onClick={() => saveDefaultModel(model.id)}
                      disabled={isDefault}
                      title={t('chatView.setAsDefault')}
                    />
                    <Button
                      type="text"
                      size="mini"
                      icon={<IconTranslate />}
                      onClick={() => saveTranslationModel(model.id)}
                      disabled={isTranslation}
                      title={t('chatView.setAsTranslationModel')}
                    />
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
