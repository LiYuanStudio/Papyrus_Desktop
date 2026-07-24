import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { buildModelOptions, findModelOption, getDefaultModel, type ModelOption } from '../utils/modelSelector';

export function useModelSelector() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [configChecked, setConfigChecked] = useState(false);

  const modelsRef = useRef<ModelOption[]>([]);
  const selectedModelIdRef = useRef<string>('');

  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  useEffect(() => {
    selectedModelIdRef.current = selectedModelId;
  }, [selectedModelId]);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const [providersRes, configRes] = await Promise.all([
        api.listProviders(),
        api.getAIConfig(),
      ]);

      const providerModels = providersRes.success 
        ? buildModelOptions(providersRes.providers)
        : [];
      setModels(providerModels);

      let targetModelId = '';
      if (configRes.success && configRes.config?.current_model) {
        const configuredModel = findModelOption(
          providersRes.success ? providersRes.providers : [],
          configRes.config.current_model
        );
        if (configuredModel) {
          targetModelId = configuredModel.id;
        }
      }

      if (!targetModelId && providerModels.length > 0) {
        const defaultModel = getDefaultModel(
          providersRes.success ? providersRes.providers : []
        );
        targetModelId = defaultModel?.id || providerModels[0].id;
      }

      if (targetModelId) {
        setSelectedModelId(targetModelId);
      }
    } catch (error) {
      console.error('Failed to load model selector:', error);
    } finally {
      setLoading(false);
      setConfigChecked(true);
    }
  }, []);

  const selectModel = useCallback(async (modelId: string) => {
    const model = modelsRef.current.find(m => m.id === modelId);
    if (!model) return;

    setSelectedModelId(modelId);

    try {
      await api.saveAIConfig({
        current_provider: model.providerType,
        current_model: model.modelId,
      });
      window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
    } catch (error) {
      console.error('Failed to save model selection:', error);
      setSelectedModelId(selectedModelIdRef.current);
    }
  }, []);

  const refreshModels = useCallback(async () => {
    await loadModels();
  }, [loadModels]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    const handleConfigChange = () => {
      refreshModels();
    };
    window.addEventListener('papyrus_ai_config_changed', handleConfigChange);
    return () => window.removeEventListener('papyrus_ai_config_changed', handleConfigChange);
  }, [refreshModels]);

  const selectedModel = models.find(m => m.id === selectedModelId);

  return {
    models,
    selectedModelId,
    selectedModel,
    loading,
    configChecked,
    selectModel,
    refreshModels,
  };
}