import { useState } from 'react';
import { Modal, Form, Input, Select, Button, Typography } from '@arco-design/web-react';
import { IconPlus, IconDelete } from '@arco-design/web-react/icon';
import { ProviderLogo } from '../../../../icons/ProviderLogo';
import { PORT_OPTIONS } from '../../../../utils/modelSelector';
import { PROVIDER_PRESETS } from '../constants';
import { api } from '../../../../api';
import { notifyAIConfigChanged } from '../utils';
import type { Provider } from '../types';

const { Title } = Typography;
const FormItem = Form.Item;
const Option = Select.Option;

interface AddProviderModalProps {
  visible: boolean;
  onClose: () => void;
  onProviderAdded: () => void;
  t: (key: string) => string;
}

interface ApiKeyInput {
  id: string;
  key: string;
  name: string;
}

const AddProviderModal = ({ visible, onClose, onProviderAdded, t }: AddProviderModalProps) => {
  const [addForm] = Form.useForm();
  const [newProviderType, setNewProviderType] = useState('openai');
  const [apiKeys, setApiKeys] = useState<ApiKeyInput[]>([{ id: '1', key: '', name: '' }]);
  const [addLoading, setAddLoading] = useState(false);

  const handleAddProvider = () => {
    if (addLoading) return;
    addForm.validate().then((values: { name?: string; baseUrl?: string }) => {
      const preset = PROVIDER_PRESETS[newProviderType];

      const validApiKeys = apiKeys
        .filter(k => k.key.trim() !== '')
        .map((k, index) => ({
          id: k.id || crypto.randomUUID(),
          name: k.name.trim() || `key-${index + 1}`,
          key: k.key.trim()
        }));

      const finalApiKeys = validApiKeys.length > 0 ? validApiKeys : [{id: crypto.randomUUID(), name: 'default', key: ''}];

      const newProvider: Provider = {
        id: crypto.randomUUID(),
        type: newProviderType,
        name: values.name || preset.name,
        apiKeys: finalApiKeys,
        baseUrl: values.baseUrl || preset.baseUrl,
        models: [],
        enabled: false,
        isDefault: false,
      };

      setAddLoading(true);
      api.createProvider(newProvider)
        .then(data => {
          if (data.success) {
            window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
            onProviderAdded();
            onClose();
            addForm.resetFields();
            setApiKeys([{ id: '1', key: '', name: '' }]);
            const firstKey = validApiKeys.find(k => k.key.trim() !== '');
            if (firstKey) {
              notifyAIConfigChanged();
            }
          } else {
            window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
          }
        })
        .catch(err => {
          console.error('Failed to add provider:', err);
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('已存在')) {
            window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
          } else {
            window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
          }
        })
        .finally(() => {
          setAddLoading(false);
        });
    });
  };

  const handleCancel = () => {
    onClose();
    addForm.resetFields();
    setApiKeys([{ id: '1', key: '', name: '' }]);
  };

  return (
    <Modal
      title={t('chatView.addProviderTitle')}
      visible={visible}
      onOk={handleAddProvider}
      confirmLoading={addLoading}
      onCancel={handleCancel}
      autoFocus={false}
      focusLock
    >
      {/* 表单分组容器：fill-2 底 + hairline 边 + 大圆角,弹层内分组更克制 */}
      <div style={{ background: 'var(--color-fill-2)', borderRadius: 'var(--radius-lg)', padding: '16px', border: '1px solid var(--color-border-hairline)' }}>
        <Form form={addForm} layout="vertical">
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.port')}</Title>} field="port" initialValue="openai">
            <Select value={newProviderType} onChange={setNewProviderType} style={{ borderRadius: 'var(--radius-md)' }}>
              {PORT_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ProviderLogo type={opt.value} size={16} />
                    <span>{opt.label}</span>
                  </div>
                </Option>
              ))}
            </Select>
          </FormItem>
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.providerName')}</Title>} field="name">
            <Input placeholder={PROVIDER_PRESETS[newProviderType]?.name} style={{ borderRadius: 'var(--radius-md)' }} />
          </FormItem>
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.apiKey')}</Title>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {apiKeys.map((item, index) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Input.Password
                    placeholder={`Enter ${t('chatView.apiKey')}`}
                    style={{ borderRadius: 'var(--radius-md)', flex: 1 }}
                    value={item.key}
                    onChange={(v) => {
                      const newKeys = [...apiKeys];
                      newKeys[index].key = v;
                      setApiKeys(newKeys);
                    }}
                  />
                  <span style={{ color: 'var(--color-text-3)' }}>:</span>
                  <Input
                    placeholder={t('chatView.apiKeyName')}
                    style={{ borderRadius: 'var(--radius-md)', width: 120 }}
                    value={item.name}
                    onChange={(v) => {
                      const newKeys = [...apiKeys];
                      newKeys[index].name = v;
                      setApiKeys(newKeys);
                    }}
                  />
                  {index === 0 ? (
                    <Button
                      type="primary"
                      icon={<IconPlus />}
                      size="small"
                      onClick={() => setApiKeys([...apiKeys, { id: crypto.randomUUID(), key: '', name: '' }])}
                      style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)', padding: '0 8px' }}
                    />
                  ) : (
                    <Button
                      type="text"
                      icon={<IconDelete />}
                      size="small"
                      status="danger"
                      onClick={() => setApiKeys(apiKeys.filter((_, i) => i !== index))}
                    />
                  )}
                </div>
              ))}
            </div>
          </FormItem>
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.baseUrl')}</Title>} field="baseUrl">
            <Input placeholder={PROVIDER_PRESETS[newProviderType]?.baseUrl} style={{ borderRadius: 'var(--radius-md)' }} />
          </FormItem>
        </Form>
      </div>
    </Modal>
  );
};

export default AddProviderModal;