import { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Checkbox, Typography, Message } from '@arco-design/web-react';
import { ProviderLogo } from '../../../../icons/ProviderLogo';
import { PORT_OPTIONS } from '../../../../utils/modelSelector';
import { CAPABILITIES_MAP } from '../constants';
import { api } from '../../../../api';
import type { Provider, Model } from '../types';

const { Title, Text } = Typography;
const FormItem = Form.Item;
const Option = Select.Option;

interface ModelModalProps {
  visible: boolean;
  onClose: () => void;
  onModelSaved: () => void;
  providers: Provider[];
  editingModel: Model | null;
  selectedProviderId?: string;
  t: (key: string) => string;
}

const ModelModal = ({ visible, onClose, onModelSaved, providers, editingModel, selectedProviderId, t }: ModelModalProps) => {
  const [modelForm] = Form.useForm();
  const [modelFormProviderId, setModelFormProviderId] = useState<string>(selectedProviderId || '');
  const [saveModelLoading, setSaveModelLoading] = useState(false);

  const handleSaveModel = () => {
    if (saveModelLoading) return;
    modelForm.validate().then((values: {
      name: string;
      modelId: string;
      port: string;
      apiKeyId?: string;
      providerId?: string;
      cap_tools?: boolean;
      cap_vision?: boolean;
      cap_reasoning?: boolean;
    }) => {
      const targetProviderId = values.providerId || '';
      const trimmedModelId = values.modelId.trim();

      const targetProvider = providers.find(p => p.id === targetProviderId);
      if (!targetProvider) {
        window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
        return;
      }

      if (!trimmedModelId) {
        window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
        return;
      }

      const capabilities: string[] = [];
      if (values.cap_tools) capabilities.push('tools');
      if (values.cap_vision) capabilities.push('vision');
      if (values.cap_reasoning) capabilities.push('reasoning');

      const modelData = {
        id: editingModel ? editingModel.id : crypto.randomUUID(),
        name: values.name.trim(),
        modelId: trimmedModelId,
        port: values.port,
        capabilities,
        apiKeyId: values.apiKeyId,
        enabled: true,
      };

      const closeModal = () => {
        onClose();
        modelForm.resetFields();
        setModelFormProviderId('');
      };

      setSaveModelLoading(true);
      if (editingModel) {
        api.updateModel(targetProviderId, editingModel.id, modelData)
          .then(data => {
            if (data.success) {
              window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
              onModelSaved();
              closeModal();
            } else {
              Message.error(data.error || t('chatView.saveFailed'));
              window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
            }
          })
          .catch(err => {
            console.error('Failed to update model:', err);
            Message.error(t('chatView.saveFailed'));
            window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
          })
          .finally(() => {
            setSaveModelLoading(false);
          });
      } else {
        api.addModel(targetProviderId, modelData)
          .then(data => {
            if (data.success) {
              window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
              onModelSaved();
              closeModal();
            } else {
              Message.error(data.error || t('chatView.saveFailed'));
              window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
            }
          })
          .catch(err => {
            console.error('Failed to add model:', err);
            const msg = err instanceof Error ? err.message : String(err);
            Message.error(msg || t('chatView.saveFailed'));
            window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
          })
          .finally(() => {
            setSaveModelLoading(false);
          });
      }
    }).catch((err: unknown) => {
      console.error('Model form validation failed:', err);
      window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
    });
  };

  const handleCancel = () => {
    onClose();
    modelForm.resetFields();
    setModelFormProviderId('');
  };

  const handleProviderChange = (value: string) => {
    setModelFormProviderId(value);
    const provider = providers.find(p => p.id === value);
    if (provider && provider.apiKeys.length > 0) {
      modelForm.setFieldValue('apiKeyId', provider.apiKeys[0].id);
    }
  };

  useEffect(() => {
    if (visible && editingModel) {
      modelForm.setFieldsValue({
        apiKeyId: editingModel.apiKeyId,
      });
    }
  }, [visible, editingModel, modelForm]);

  const enabledProviders = providers.filter(p => p.enabled);

  return (
    <Modal
      title={editingModel ? t('chatView.editModel') : t('chatView.addModelTitle')}
      visible={visible}
      onOk={handleSaveModel}
      confirmLoading={saveModelLoading}
      onCancel={handleCancel}
      autoFocus={false}
      focusLock
    >
      {/* 表单分组容器：fill-2 底 + hairline 边 + 大圆角,与添加供应商弹窗一致 */}
      <div style={{ background: 'var(--color-fill-2)', borderRadius: 'var(--radius-lg)', padding: '16px', border: '1px solid var(--color-border-hairline)' }}>
        <Form form={modelForm} layout="vertical">
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.provider')}</Title>} field="providerId" initialValue={selectedProviderId || '1'}>
            <Select
              style={{ borderRadius: 'var(--radius-md)' }}
              onChange={handleProviderChange}
            >
              {enabledProviders.map(p => (
                <Option key={p.id} value={p.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ProviderLogo type={p.type} name={p.name} size={16} />
                    <span>{p.name}</span>
                  </div>
                </Option>
              ))}
            </Select>
          </FormItem>
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.modelName')}</Title>} field="name">
            <Input placeholder={t('chatView.modelNamePlaceholder')} style={{ borderRadius: 'var(--radius-md)' }} />
          </FormItem>
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.modelId')}</Title>} field="modelId">
            <Input placeholder={t('chatView.modelIdPlaceholder')} style={{ borderRadius: 'var(--radius-md)' }} />
          </FormItem>
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.port')}</Title>} field="port" initialValue={enabledProviders[0]?.type || 'openai'}>
            <Select style={{ borderRadius: 'var(--radius-md)' }}>
              {PORT_OPTIONS.map(opt => (
                <Option key={opt.value} value={opt.value}>{opt.label}</Option>
              ))}
            </Select>
          </FormItem>
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.apiKeyScheme')}</Title>} field="apiKeyId">
            <Select style={{ borderRadius: 'var(--radius-md)' }}>
              {(() => {
                const providerId = modelFormProviderId || modelForm.getFieldValue('providerId') || '1';
                const provider = providers.find(p => p.id === providerId);
                return provider?.apiKeys.map(key => (
                  <Option key={key.id} value={key.id}>{key.name || 'default'}</Option>
                ));
              })()}
            </Select>
          </FormItem>
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.modelCapabilities')}</Title>} style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(CAPABILITIES_MAP).map(([key, cap]) => {
                const IconComp = cap.icon;
                return (
                  <FormItem
                    key={key}
                    field={`cap_${key}`}
                    style={{ marginBottom: 0 }}
                    triggerPropName="checked"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <Checkbox />
                      <IconComp style={{ color: 'var(--color-primary)', fontSize: 16 }} />
                      <Text style={{ fontSize: 14 }}>{t(cap.labelKey)}</Text>
                    </div>
                  </FormItem>
                );
              })}
            </div>
          </FormItem>
        </Form>
      </div>
    </Modal>
  );
};

export default ModelModal;
