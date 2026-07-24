export interface ProviderConfig {
  api_key?: string;
  base_url?: string;
  models: string[];
}

export interface AIConfig {
  current_provider: string;
  current_model: string;
  translation_provider?: string;
  translation_model?: string;
  providers: Record<string, ProviderConfig>;
  parameters: {
    temperature: number;
    top_p: number;
    max_tokens: number;
    presence_penalty: number;
    frequency_penalty: number;
  };
  features: {
    auto_hint: boolean;
    auto_explain: boolean;
    context_length: number;
    agent_enabled: boolean;
    cache_enabled: boolean;
  };
}

export interface ProviderModel {
  key: string;
  label: string;
  providerId: string;
  providerType: string;
}
