import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Switch,
  Button,
  Slider,
  InputNumber,
  Typography,
  Input,
  Message,
} from '@arco-design/web-react';
import {
  IconMessage,
  IconSafe,
  IconRobot,
  IconBulb,
  IconSettings,
  IconPlus,
} from '@arco-design/web-react/icon';
import { SettingItem, SettingsViewLayout } from '../components';
import { api } from '../../api';
import { NAV_ITEMS } from './ChatView/constants';
import { loadUserProfile, saveUserProfile, loadAgentSettings, saveAgentSettings, notifyAIConfigChanged, renderCapabilityIcons } from './ChatView/utils';
import { ProvidersSection } from './ChatView/components';
import { ModelsSection } from './ChatView/components';
import { AddProviderModal } from './ChatView/components';
import { ModelModal } from './ChatView/components';
import type { Provider, Model, UserProfile } from './ChatView/types';

const { Paragraph } = Typography;

interface ChatViewProps {
  onBack: () => void;
}

const ChatView = ({ onBack }: ChatViewProps) => {
  const { t } = useTranslation();
  const [agentModeEnabled, setAgentModeEnabledState] = useState(() => loadAgentSettings().agentModeEnabled);
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sendOnEnter, setSendOnEnter] = useState(true);
  
  const [userProfile, setUserProfile] = useState<UserProfile>(loadUserProfile());
  
  const [completionEnabled, setCompletionEnabled] = useState(true);
  const [completionRequireConfirm, setCompletionRequireConfirm] = useState(false);
  const [completionTriggerDelay, setCompletionTriggerDelay] = useState(500);
  const [completionMaxTokens, setCompletionMaxTokens] = useState(50);
  const [completionSaving, setCompletionSaving] = useState(false);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [, setProvidersLoading] = useState(false);
  const [currentModelId, setCurrentModelId] = useState<string>('');
  const [translationModelId, setTranslationModelId] = useState<string>('');
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [modelModalVisible, setModelModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [modelModalProviderId, setModelModalProviderId] = useState<string>('');

  useEffect(() => {
    api.getCompletionConfig()
      .then(data => {
        if (data.success && data.config) {
          setCompletionEnabled(data.config.enabled);
          setCompletionRequireConfirm(data.config.require_confirm);
          setCompletionTriggerDelay(data.config.trigger_delay);
          setCompletionMaxTokens(data.config.max_tokens);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    api.getAIConfig()
      .then(data => {
        if (data.success && data.config) {
          if (data.config.features) {
            const agentEnabled = data.config.features.agent_enabled ?? false;
            setAgentModeEnabledState(agentEnabled);
            saveAgentSettings({ agentModeEnabled: agentEnabled });
          }
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadProviders();
  }, []);

  /**
   * 根据已保存的 AI 配置，把 current_model / translation_model 解析为模型行 id。
   * 原因：UI 用 DB 行 id 高亮卡片，而配置存的是 API modelId + provider type。
   * 未仅用 isDefault：翻译模型可能与默认聊天模型不同；但 current_model 为空时仍回退 isDefault，与聊天工具栏一致。
   */
  const hydrateModelSelections = (providerList: Provider[]) => {
    api.getAIConfig()
      .then(data => {
        const cfg = data.success ? data.config : undefined;
        let resolvedCurrentId = '';

        if (cfg?.current_model) {
          for (const p of providerList) {
            if (cfg.current_provider && p.type !== cfg.current_provider) continue;
            const match = p.models.find(m => m.modelId === cfg.current_model || m.id === cfg.current_model);
            if (match) {
              resolvedCurrentId = match.id;
              break;
            }
          }
        }

        // 与 useModelSelector 对齐：配置缺失/不匹配时高亮默认供应商首个启用模型
        if (!resolvedCurrentId) {
          const defaultProvider = providerList.find(p => p.isDefault && p.enabled)
            ?? providerList.find(p => p.enabled);
          const defaultModel = defaultProvider?.models.find(m => m.enabled);
          if (defaultModel) {
            resolvedCurrentId = defaultModel.id;
          }
        }

        if (resolvedCurrentId) {
          setCurrentModelId(resolvedCurrentId);
        }

        if (cfg?.translation_model) {
          let resolvedTranslationId = '';
          for (const p of providerList) {
            if (cfg.translation_provider && p.type !== cfg.translation_provider) continue;
            const match = p.models.find(
              m => m.modelId === cfg.translation_model || m.id === cfg.translation_model,
            );
            if (match) {
              resolvedTranslationId = match.id;
              break;
            }
          }
          setTranslationModelId(resolvedTranslationId);
        } else {
          setTranslationModelId('');
        }
      })
      .catch(console.error);
  };

  const loadProviders = () => {
    setProvidersLoading(true);
    api.listProviders()
      .then(data => {
        if (data.success && data.providers) {
          setProviders(data.providers);
          hydrateModelSelections(data.providers);
        }
      })
      .catch(console.error)
      .finally(() => setProvidersLoading(false));
  };

  const deleteProvider = (id: string) => {
    api.deleteProvider(id)
      .then(data => {
        if (data.success) {
          Message.success(t('chatView.supplierDeleted'));
          loadProviders();
          notifyAIConfigChanged();
        } else {
          Message.error(data.error || t('chatView.deleteFailed'));
        }
      })
      .catch(err => {
        console.error('Failed to delete provider:', err);
        Message.error(t('chatView.deleteFailed'));
      });
  };

  const setDefault = (id: string) => {
    api.setDefaultProvider(id)
      .then(data => {
        if (data.success) {
          Message.success(t('chatView.defaultProviderSet'));
          loadProviders();
        } else {
          Message.error(data.error || t('chatView.updateFailed'));
        }
      })
      .catch(err => {
        console.error('Failed to set default provider:', err);
        Message.error(t('chatView.updateFailed'));
      });
  };

  const deleteModel = (providerId: string, modelId: string) => {
    api.deleteModel(providerId, modelId)
      .then(data => {
        if (data.success) {
          Message.success(t('chatView.modelDeleted'));
          loadProviders();
          notifyAIConfigChanged();
        } else {
          Message.error(data.error || t('chatView.deleteFailed'));
        }
      })
      .catch(err => {
        console.error('Failed to delete model:', err);
        Message.error(t('chatView.deleteFailed'));
      });
  };

  const openModelModal = (providerId?: string, model?: Model) => {
    const effectiveProviderId = providerId || '1';
    setModelModalProviderId(effectiveProviderId);
    setEditingModel(model || null);
    setModelModalVisible(true);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      Message.error(t('chatView.selectImageFile'));
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      Message.error(t('chatView.imageSizeExceeded'));
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const avatarUrl = event.target?.result as string;
      const newProfile = { ...userProfile, avatarUrl };
      setUserProfile(newProfile);
      saveUserProfile(newProfile);
      Message.success(t('chatView.avatarUpdated'));
    };
    reader.readAsDataURL(file);
  };
  
  const handleUserIdChange = (value: string) => {
    const userId = value.trim().slice(0, 10);
    const newProfile = { ...userProfile, userId };
    setUserProfile(newProfile);
    saveUserProfile(newProfile);
  };
  
  const clearAvatar = () => {
    const newProfile = { ...userProfile, avatarUrl: null };
    setUserProfile(newProfile);
    saveUserProfile(newProfile);
    Message.success(t('chatView.defaultAvatarRestored'));
  };
  
  const setAgentModeEnabled = async (enabled: boolean) => {
    setAgentModeEnabledState(enabled);
    saveAgentSettings({ agentModeEnabled: enabled });
    try {
      await api.saveAIConfig({
        features: {
          agent_enabled: enabled,
        },
      } as Partial<import('../../api').AIConfig>);
      notifyAIConfigChanged();
    } catch (err) {
      console.error('Failed to save Agent mode config:', err);
    }
  };

  const saveDefaultModel = async (modelId: string) => {
    setCurrentModelId(modelId);
    try {
      const provider = providers.find(p => p.models.some(m => m.id === modelId));
      const model = provider?.models.find(m => m.id === modelId);
      const updated: Partial<import('../../api').AIConfig> = {
        current_model: model?.modelId || modelId,
      };
      if (provider) {
        updated.current_provider = provider.type;
      }
      await api.saveAIConfig(updated);
      notifyAIConfigChanged();
    } catch (err) {
      console.error('Failed to sync model config to backend:', err);
      Message.error(t('chatView.syncFailed'));
    }
  };

  /**
   * 将指定模型设为翻译专用模型，并写入 translation_provider + translation_model。
   * 与 saveDefaultModel 对称，保证翻译可走独立供应商密钥。
   * 未只写 modelId：跨供应商时必须同时保存 provider type。
   */
  const saveTranslationModel = async (modelId: string) => {
    setTranslationModelId(modelId);
    try {
      const provider = providers.find(p => p.models.some(m => m.id === modelId));
      const model = provider?.models.find(m => m.id === modelId);
      const updated: Partial<import('../../api').AIConfig> = {
        translation_model: model?.modelId || modelId,
      };
      if (provider) {
        updated.translation_provider = provider.type;
      }
      await api.saveAIConfig(updated);
      notifyAIConfigChanged();
      Message.success(t('chatView.translationModelSet'));
    } catch (err) {
      console.error('Failed to sync translation model config to backend:', err);
      Message.error(t('chatView.syncFailed'));
    }
  };

  const saveCompletionConfig = async (updates: Partial<{ enabled: boolean; require_confirm: boolean; trigger_delay: number; max_tokens: number }>) => {
    if (completionSaving) return;
    setCompletionSaving(true);
    try {
      await api.saveCompletionConfig({
        enabled: updates.enabled ?? completionEnabled,
        require_confirm: updates.require_confirm ?? completionRequireConfirm,
        trigger_delay: updates.trigger_delay ?? completionTriggerDelay,
        max_tokens: updates.max_tokens ?? completionMaxTokens,
      });
    } catch (err) {
      console.error('Failed to save completion config:', err);
    } finally {
      setCompletionSaving(false);
    }
  };

  const syncKeyToAIConfig = async (_providerType: string, _apiKey: string) => {
    notifyAIConfigChanged();
  };

  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'general-section':
        return (
          <>
            <SettingItem title={t('chatView.agentMode')} desc={t('chatView.agentModeDesc')}>
              <Switch
                checked={agentModeEnabled}
                onChange={setAgentModeEnabled}
              />
            </SettingItem>

            <SettingItem title={t('chatView.showTimestamp')} desc={t('chatView.showTimestampDesc')}>
              <Switch checked={showTimestamp} onChange={setShowTimestamp} />
            </SettingItem>

            <SettingItem title={t('chatView.autoScroll')} desc={t('chatView.autoScrollDesc')}>
              <Switch checked={autoScroll} onChange={setAutoScroll} />
            </SettingItem>

            <SettingItem title={t('chatView.enterToSend')} desc={t('chatView.enterToSendDesc')} divider={false}>
              <Switch checked={sendOnEnter} onChange={setSendOnEnter} />
            </SettingItem>
          </>
        );

      case 'user-section':
        return (
          <>
            <SettingItem title={t('chatView.userId')} desc={t('chatView.userIdDesc')}>
              <Input
                value={userProfile.userId}
                onChange={handleUserIdChange}
                maxLength={10}
                style={{ width: 120 }}
                placeholder="P"
              />
            </SettingItem>

            <SettingItem title={t('chatView.avatar')} desc={t('chatView.avatarDesc')} divider={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      // 默认头像底色/文字色换语义 token，替代写死的品牌蓝与白色
                      background: userProfile.avatarUrl ? 'transparent' : 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      color: 'var(--color-white)',
                      fontWeight: 500,
                      flexShrink: 0,
                    }}
                  >
                    {userProfile.avatarUrl ? (
                      <img
                        src={userProfile.avatarUrl}
                        alt="avatar"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      userProfile.userId?.charAt(0)?.toUpperCase() || '?'
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Button
                      type="primary"
                      shape="round"
                      size="small"
                      style={{ height: '32px', padding: '0 16px', fontSize: '13px' }}
                      onClick={() => document.getElementById('avatar-input')?.click()}
                    >
                      {t('chatView.selectImage')}
                    </Button>
                    {userProfile.avatarUrl && (
                      <Button
                        type="secondary"
                        shape="round"
                        size="small"
                        style={{ height: '32px', padding: '0 16px', fontSize: '13px' }}
                        onClick={clearAvatar}
                      >
                        {t('chatView.restoreDefault')}
                      </Button>
                    )}
                    <input
                      id="avatar-input"
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleAvatarChange}
                      aria-label={t('chatView.selectImage')}
                    />
                  </div>
                </div>
                <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
                  {t('chatView.avatarTip')}
                </Paragraph>
              </div>
            </SettingItem>
          </>
        );

      case 'completion-section':
        return (
          <>
            <SettingItem title={t('chatView.completionEnabled')} desc={t('chatView.completionEnabledDesc')}>
              <Switch
                checked={completionEnabled}
                onChange={(checked) => {
                  setCompletionEnabled(checked);
                  saveCompletionConfig({ enabled: checked });
                }}
              />
            </SettingItem>

            {completionEnabled && (
              <>
                <SettingItem title={t('chatView.completionConfirm')} desc={t('chatView.completionConfirmDesc')}>
                  <Switch
                    checked={completionRequireConfirm}
                    onChange={(checked) => {
                      setCompletionRequireConfirm(checked);
                      saveCompletionConfig({ require_confirm: checked });
                    }}
                  />
                </SettingItem>

                <SettingItem title={t('chatView.completionDelay')} desc={t('chatView.completionDelayDesc')}>
                  <Slider
                    min={200}
                    max={2000}
                    step={100}
                    value={completionTriggerDelay}
                    onChange={(val) => {
                      setCompletionTriggerDelay(val as number);
                      saveCompletionConfig({ trigger_delay: val as number });
                    }}
                    style={{ width: 200 }}
                  />
                </SettingItem>

                <SettingItem title={t('chatView.completionMaxTokens')} desc={t('chatView.completionMaxTokensDesc')} divider={false}>
                  <Slider
                    min={10}
                    max={200}
                    step={10}
                    value={completionMaxTokens}
                    onChange={(val) => {
                      setCompletionMaxTokens(val as number);
                      saveCompletionConfig({ max_tokens: val as number });
                    }}
                    style={{ width: 200 }}
                  />
                </SettingItem>
              </>
            )}
          </>
        );

      case 'parameters-section':
        return (
          <>
            {[
              { label: t('chatView.temperature'), min: 0, max: 2, step: 0.1, default: 0.7 },
              { label: t('chatView.topP'), min: 0, max: 1, step: 0.1, default: 0.9 },
              { label: t('chatView.maxTokens'), min: 100, max: 8000, step: 100, default: 2000 },
            ].map((item, index) => (
              <SettingItem 
                key={item.label} 
                title={item.label} 
                desc="" 
                divider={index !== 2}
              >
                  <div className="settings-slider-control" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 200 }}>
                    <Slider min={item.min} max={item.max} step={item.step} defaultValue={item.default} style={{ flex: 1 }} />
                    <InputNumber min={item.min} max={item.max} step={item.step} defaultValue={item.default} style={{ width: 80 }} />
                  </div>
              </SettingItem>
            ))}

            <SettingItem title="" desc="" divider={false}>
              <Button type="primary" shape="round">{t('chatView.saveParams')}</Button>
            </SettingItem>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <SettingsViewLayout
        title={t('chatView.title')}
        description={t('chatView.titleDesc')}
        icon={IconMessage}
        navItems={NAV_ITEMS.map(item => ({ ...item, label: t(item.label) }))}
        sections={[
          { id: 'general-section', title: t('chatView.general') },
          { id: 'user-section', title: t('chatView.user') },
          { id: 'providers-section', title: t('chatView.providers'), icon: IconSafe },
          { id: 'models-section', title: t('chatView.models'), icon: IconRobot },
          { id: 'completion-section', title: t('chatView.completion'), icon: IconBulb },
          { id: 'parameters-section', title: t('chatView.parameters'), icon: IconSettings },
        ]}
        onBack={onBack}
      >
        {(sectionId) => {
          if (sectionId === 'providers-section') {
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <Button type="primary" icon={<IconPlus />} onClick={() => setAddModalVisible(true)} style={{ borderRadius: '999px', padding: '4px 16px', display: 'flex', alignItems: 'center' }}>
                    {t('chatView.addProvider')}
                  </Button>
                </div>
                <ProvidersSection 
                  providers={providers} 
                  loadProviders={loadProviders} 
                  deleteProvider={deleteProvider} 
                  setDefault={setDefault} 
                  syncKeyToAIConfig={syncKeyToAIConfig} 
                  t={t} 
                />
              </>
            );
          }
          if (sectionId === 'models-section') {
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <Button 
                    type="primary" 
                    icon={<IconPlus />} 
                    onClick={() => {
                      const enabledProvider = providers.find(p => p.enabled);
                      if (!enabledProvider) {
                        Message.warning(t('chatView.noProviderSelected'));
                        return;
                      }
                      openModelModal(enabledProvider.id);
                    }} 
                    style={{ borderRadius: '999px', padding: '4px 16px', display: 'flex', alignItems: 'center' }}
                  >
                    {t('chatView.addModel')}
                  </Button>
                </div>
                <ModelsSection
                  providers={providers}
                  currentModelId={currentModelId}
                  translationModelId={translationModelId}
                  saveDefaultModel={saveDefaultModel}
                  saveTranslationModel={saveTranslationModel}
                  deleteModel={deleteModel}
                  openModelModal={openModelModal}
                  renderCapabilityIcons={renderCapabilityIcons}
                  t={t}
                />
              </>
            );
          }
          return renderSection(sectionId);
        }}
      </SettingsViewLayout>

      <AddProviderModal 
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onProviderAdded={loadProviders}
        t={t}
      />

      <ModelModal
        visible={modelModalVisible}
        onClose={() => { setModelModalVisible(false); setEditingModel(null); setModelModalProviderId(''); }}
        onModelSaved={loadProviders}
        providers={providers}
        editingModel={editingModel}
        selectedProviderId={modelModalProviderId}
        t={t}
      />
    </>
  );
};

export default ChatView;
