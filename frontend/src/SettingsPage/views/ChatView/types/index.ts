import type { UserProfile } from '../../../../types/common';

export interface ApiKeyItem {
  id: string;
  name: string;
  key: string;
  hasKey?: boolean;
}

export interface Model {
  id: string;
  name: string;
  modelId: string;
  enabled: boolean;
  port: string;
  capabilities: string[];
  apiKeyId?: string;
}

export interface Provider {
  id: string;
  type: string;
  name: string;
  apiKeys: ApiKeyItem[];
  baseUrl: string;
  models: Model[];
  enabled: boolean;
  isDefault: boolean;
}

export interface ChatViewProps {
  onBack: () => void;
}

export interface AgentSettings {
  agentModeEnabled: boolean;
}

export interface CapabilityConfig {
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  labelKey: string;
}

export type CapabilitiesMap = Record<string, CapabilityConfig>;

export { type UserProfile };