import type { ProviderItem } from '../api';

export interface ModelOption {
  id: string;
  modelId: string;
  name: string;
  providerId: string;
  providerType: string;
  providerName: string;
  capabilities: string[];
}

export const PORT_OPTIONS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'OpenAI-Response', value: 'openai-response' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'Ollama', value: 'ollama' },
];

export const CAPABILITY_LABELS: Record<string, string> = {
  tools: '工具调用',
  vision: '视觉能力',
  reasoning: '推理能力',
};

export function buildModelOptions(providers: ProviderItem[]): ModelOption[] {
  // 第一步：收集所有模型并记录名称出现次数
  const allModels: Array<{ provider: ProviderItem; model: ProviderItem['models'][0] }> = [];
  const nameCount: Record<string, number> = {};
  
  for (const provider of providers) {
    if (!provider.enabled) continue;
    for (const model of provider.models) {
      if (!model.enabled) continue;
      allModels.push({ provider, model });
      nameCount[model.name] = (nameCount[model.name] || 0) + 1;
    }
  }
  
  // 第二步：构建模型选项，重名时显示提供商名称
  const options: ModelOption[] = [];
  for (const { provider, model } of allModels) {
    const displayName = nameCount[model.name] > 1 
      ? `${model.name} (${provider.name})` 
      : model.name;
    
    options.push({
      id: model.id,
      modelId: model.modelId,
      name: displayName,
      providerId: provider.id,
      providerType: provider.type,
      providerName: provider.name,
      capabilities: model.capabilities,
    });
  }
  
  return options;
}

export function findModelOption(
  providers: ProviderItem[],
  modelId: string
): ModelOption | undefined {
  for (const provider of providers) {
    const model = provider.models.find(m => m.id === modelId || m.modelId === modelId);
    if (model && provider.enabled && model.enabled) {
      return {
        id: model.id,
        modelId: model.modelId,
        name: model.name,
        providerId: provider.id,
        providerType: provider.type,
        providerName: provider.name,
        capabilities: model.capabilities,
      };
    }
  }
  return undefined;
}

export function getDefaultModel(providers: ProviderItem[]): ModelOption | undefined {
  const defaultProvider = providers.find(p => p.isDefault && p.enabled);
  if (defaultProvider && defaultProvider.models.length > 0) {
    const enabledModel = defaultProvider.models.find(m => m.enabled);
    if (enabledModel) {
      return {
        id: enabledModel.id,
        modelId: enabledModel.modelId,
        name: enabledModel.name,
        providerId: defaultProvider.id,
        providerType: defaultProvider.type,
        providerName: defaultProvider.name,
        capabilities: enabledModel.capabilities,
      };
    }
  }
  
  for (const provider of providers) {
    if (!provider.enabled) continue;
    const enabledModel = provider.models.find(m => m.enabled);
    if (enabledModel) {
      return {
        id: enabledModel.id,
        modelId: enabledModel.modelId,
        name: enabledModel.name,
        providerId: provider.id,
        providerType: provider.type,
        providerName: provider.name,
        capabilities: enabledModel.capabilities,
      };
    }
  }
  return undefined;
}

export function getEnabledProviders(providers: ProviderItem[]): ProviderItem[] {
  return providers.filter(p => p.enabled);
}

export function getModelsForProvider(
  providers: ProviderItem[],
  providerId: string
): ProviderItem['models'] {
  const provider = providers.find(p => p.id === providerId);
  return provider?.models.filter(m => m.enabled) || [];
}