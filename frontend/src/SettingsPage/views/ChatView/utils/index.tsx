import { Space, Tooltip } from '@arco-design/web-react';
import { CAPABILITIES_MAP } from '../constants';
import type { UserProfile, AgentSettings } from '../types';

export const renderCapabilityIcons = (capabilities: string[], t: (key: string) => string) => {
  return (
    <Space size={8}>
      {capabilities.map(cap => {
        const capConfig = CAPABILITIES_MAP[cap as keyof typeof CAPABILITIES_MAP];
        if (!capConfig) return null;
        const IconComp = capConfig.icon;
        return (
          <Tooltip key={cap} content={t(capConfig.labelKey)}>
            <IconComp style={{ color: 'var(--color-primary)', fontSize: 16 }} />
          </Tooltip>
        );
      })}
    </Space>
  );
};

export const loadUserProfile = (): UserProfile => {
  try {
    const saved = localStorage.getItem('papyrus_user_profile');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // ignore
  }
  return { userId: '', avatarUrl: null };
};

export const saveUserProfile = (profile: UserProfile) => {
  try {
    localStorage.setItem('papyrus_user_profile', JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent('papyrus_user_profile_changed'));
  } catch {
    // ignore
  }
};

export const loadAgentSettings = (): AgentSettings => {
  try {
    const saved = localStorage.getItem('papyrus_agent_settings');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // ignore
  }
  return { agentModeEnabled: false };
};

export const saveAgentSettings = (settings: AgentSettings) => {
  try {
    localStorage.setItem('papyrus_agent_settings', JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('papyrus_agent_settings_changed', { detail: settings }));
  } catch {
    // ignore
  }
};

export const notifyAIConfigChanged = () => {
  window.dispatchEvent(new CustomEvent('papyrus_ai_config_changed'));
};