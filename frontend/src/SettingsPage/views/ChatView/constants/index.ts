import {
  IconMessage,
  IconSafe,
  IconRobot,
  IconBulb,
  IconSettings,
  IconUser,
  IconTool,
  IconEye,
} from '@arco-design/web-react/icon';
import type { NavItem } from '../../../components';
import type { CapabilitiesMap } from '../types';

export const PROVIDER_PRESETS: Record<string, { name: string; baseUrl: string }> = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  'openai-response': { name: 'OpenAI-Response', baseUrl: 'https://api.openai.com/v1' },
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  gemini: { name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  ollama: { name: 'Ollama', baseUrl: 'http://localhost:11434' },
};

export const NAV_ITEMS: NavItem[] = [
  { key: 'general-section', label: 'chatView.general', icon: IconMessage },
  { key: 'user-section', label: 'chatView.user', icon: IconUser },
  { key: 'providers-section', label: 'chatView.providers', icon: IconSafe },
  { key: 'models-section', label: 'chatView.models', icon: IconRobot },
  { key: 'completion-section', label: 'chatView.completion', icon: IconBulb },
  { key: 'parameters-section', label: 'chatView.parameters', icon: IconSettings },
];

export const CAPABILITIES_MAP: CapabilitiesMap = {
  tools: { icon: IconTool, labelKey: 'chatView.tools' },
  vision: { icon: IconEye, labelKey: 'chatView.vision' },
  reasoning: { icon: IconBulb, labelKey: 'chatView.reasoning' },
};