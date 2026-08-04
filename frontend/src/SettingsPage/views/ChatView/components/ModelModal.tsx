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

// 定义模型弹窗在编辑过程中的可选表单字段及能力开关。
// 原因：字段在用户输入和校验前可能为 undefined，类型必须反映真实运行时状态。
// 未把字段声明为全部必填：API Key 对 Ollama 等本地供应商是可选的，必填约束由表单规则处理。
interface ModelFormValues {
  providerId?: string;
  name?: string;
  modelId?: string;
  port?: string;
  apiKeyId?: string;
  cap_tools?: boolean;
  cap_vision?: boolean;
  cap_reasoning?: boolean;
}

interface ModelModalProps {
  visible: boolean;
  onClose: () => void;
  onModelSaved: () => void;
  providers: Provider[];
  editingModel: Model | null;
  selectedProviderId?: string;
  t: (key: string) => string;
}

// 根据供应商类型选择模型请求协议的初始值。
// 原因：供应商类型通常与协议一致，但自定义或旧数据可能不在当前选项中。
// 未直接返回 provider.type：Select 无法展示未知值，因此未知类型安全回退到 OpenAI 协议。
function getProviderPort(provider: Provider): string {
  return PORT_OPTIONS.some(option => option.value === provider.type)
    ? provider.type
    : 'openai';
}

const ModelModal = ({ visible, onClose, onModelSaved, providers, editingModel, selectedProviderId, t }: ModelModalProps) => {
  const [modelForm] = Form.useForm<ModelFormValues>();
  const [saveModelLoading, setSaveModelLoading] = useState(false);
  const watchedProviderId = Form.useWatch<
    ModelFormValues,
    ModelFormValues[keyof ModelFormValues],
    keyof ModelFormValues,
    'providerId'
  >('providerId', modelForm);
  const enabledProviders = providers.filter(provider => provider.enabled);
  const apiKeyProvider = enabledProviders.find(provider => provider.id === watchedProviderId);

  // 关闭弹窗并清空字段、校验错误和 touched 状态。
  // 原因：同一弹窗实例会被重复使用，每次打开都必须从显式初始化值开始。
  // 未依赖 Modal 卸载重建：父组件始终挂载弹窗，单纯 unmountOnExit 无法重置外部 form 实例。
  const closeAndReset = () => {
    onClose();
    modelForm.resetFields();
  };

  // 校验并保存新增或编辑后的模型配置。
  // 原因：先完成同步校验，再进入请求 loading，确保无效字段得到可见反馈且不会静默抛错。
  // 未继续使用 Promise 链：分离校验和请求错误后，用户输入错误不会被误报为网络保存失败。
  const handleSaveModel = async (): Promise<void> => {
    if (saveModelLoading) return;

    let values: ModelFormValues;
    try {
      values = await modelForm.validate();
    } catch {
      return;
    }

    const targetProviderId = values.providerId ?? '';
    const targetProvider = enabledProviders.find(provider => provider.id === targetProviderId);
    if (!targetProvider) {
      Message.error(t('chatView.providerNotFound'));
      return;
    }

    const trimmedName = (values.name ?? '').trim();
    if (!trimmedName) {
      Message.error(t('chatView.modelNameEmpty'));
      return;
    }

    const trimmedModelId = (values.modelId ?? '').trim();
    if (!trimmedModelId) {
      Message.error(t('chatView.modelIdEmpty'));
      return;
    }

    const capabilities: string[] = [];
    if (values.cap_tools) capabilities.push('tools');
    if (values.cap_vision) capabilities.push('vision');
    if (values.cap_reasoning) capabilities.push('reasoning');

    const modelData = {
      id: editingModel ? editingModel.id : crypto.randomUUID(),
      name: trimmedName,
      modelId: trimmedModelId,
      port: values.port ?? getProviderPort(targetProvider),
      capabilities,
      apiKeyId: values.apiKeyId,
      enabled: true,
    };

    setSaveModelLoading(true);
    try {
      const data = editingModel
        ? await api.updateModel(targetProviderId, editingModel.id, modelData)
        : await api.addModel(targetProviderId, modelData);

      if (!data.success) {
        Message.error(data.error || t('chatView.saveFailed'));
        return;
      }

      Message.success(t(editingModel ? 'chatView.modelUpdated' : 'chatView.modelAdded'));
      window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
      onModelSaved();
      closeAndReset();
    } catch (error: unknown) {
      console.error(editingModel ? 'Failed to update model:' : 'Failed to add model:', error);
      const message = error instanceof Error && error.message
        ? error.message
        : t('chatView.saveFailed');
      Message.error(message);
    } finally {
      setSaveModelLoading(false);
    }
  };

  // 取消编辑并复用统一的关闭重置流程。
  // 原因：取消和保存成功后的清理行为必须一致，避免下次打开残留 touched 或错误状态。
  // 未在父组件单独清理字段：表单实例属于弹窗，清理职责留在组件内部更可靠。
  const handleCancel = () => {
    closeAndReset();
  };

  // 切换供应商时同步协议并选择该供应商的第一个密钥。
  // 原因：API Key 外键属于供应商，保留上一个供应商的密钥会导致后端外键校验失败。
  // 未强制要求密钥存在：无密钥供应商应把 apiKeyId 清空后继续允许保存。
  const handleProviderChange = (value: string) => {
    const provider = enabledProviders.find(item => item.id === value);
    modelForm.setFieldsValue({
      port: provider ? getProviderPort(provider) : 'openai',
      apiKeyId: provider?.apiKeys[0]?.id,
    });
  };

  // 每次弹窗打开时根据当前 props 建立完整、互相一致的表单快照。
  // 原因：Arco Form 的 initialValue 仅在字段首次挂载时生效，无法响应随后传入的供应商或编辑模型。
  // 未保留额外 React 状态：Form.useWatch 已能驱动密钥选项，重复状态容易再次产生首开与重开不一致。
  useEffect(() => {
    if (!visible) return;

    const targetProvider = enabledProviders.find(provider => provider.id === selectedProviderId)
      ?? enabledProviders[0];
    modelForm.resetFields();
    if (!targetProvider) return;

    const editingApiKeyId = editingModel?.apiKeyId;
    const validEditingApiKeyId = editingApiKeyId
      && targetProvider.apiKeys.some(key => key.id === editingApiKeyId)
      ? editingApiKeyId
      : undefined;

    modelForm.setFieldsValue({
      providerId: targetProvider.id,
      name: editingModel?.name ?? '',
      modelId: editingModel?.modelId ?? '',
      port: editingModel?.port || getProviderPort(targetProvider),
      apiKeyId: editingModel ? validEditingApiKeyId : targetProvider.apiKeys[0]?.id,
      cap_tools: editingModel?.capabilities.includes('tools') ?? false,
      cap_vision: editingModel?.capabilities.includes('vision') ?? false,
      cap_reasoning: editingModel?.capabilities.includes('reasoning') ?? false,
    });
  }, [visible, editingModel, selectedProviderId, providers, modelForm]);

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
          <FormItem
            label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.provider')}</Title>}
            field="providerId"
            rules={[{ required: true, message: t('chatView.noProviderSelected') }]}
          >
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
          <FormItem
            label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.modelName')}</Title>}
            field="name"
            rules={[{ required: true, match: /\S/, message: t('chatView.modelNameEmpty') }]}
          >
            <Input placeholder={t('chatView.modelNamePlaceholder')} style={{ borderRadius: 'var(--radius-md)' }} />
          </FormItem>
          <FormItem
            label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.modelId')}</Title>}
            field="modelId"
            rules={[{ required: true, match: /\S/, message: t('chatView.modelIdEmpty') }]}
          >
            <Input placeholder={t('chatView.modelIdPlaceholder')} style={{ borderRadius: 'var(--radius-md)' }} />
          </FormItem>
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.port')}</Title>} field="port">
            <Select style={{ borderRadius: 'var(--radius-md)' }}>
              {PORT_OPTIONS.map(opt => (
                <Option key={opt.value} value={opt.value}>{opt.label}</Option>
              ))}
            </Select>
          </FormItem>
          <FormItem label={<Title heading={6} style={{ margin: 0 }}>{t('chatView.apiKeyScheme')}</Title>} field="apiKeyId">
            <Select allowClear style={{ borderRadius: 'var(--radius-md)' }}>
              {apiKeyProvider?.apiKeys.map(key => (
                <Option key={key.id} value={key.id}>{key.name || 'default'}</Option>
              ))}
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
                    <Checkbox>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <IconComp style={{ color: 'var(--color-primary)', fontSize: 16 }} />
                        <Text style={{ fontSize: 14 }}>{t(cap.labelKey)}</Text>
                      </span>
                    </Checkbox>
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
