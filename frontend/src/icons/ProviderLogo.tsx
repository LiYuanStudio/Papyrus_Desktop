import React from 'react';
import { IconRobot } from '@arco-design/web-react/icon';
import * as ProviderIcons from './svgs/providers';

type SvgIconComponent = React.FC<{
  size?: number | string;
  style?: React.CSSProperties;
  className?: string;
}>;

const providerMap: Record<string, keyof typeof ProviderIcons> = {
  openai: 'Openai',
  'openai-response': 'Openai',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  ollama: 'Ollama',
  deepseek: 'Deepseek',
  siliconflow: 'Siliconcloud',
  moonshot: 'Moonshot',
  custom: 'Openai',
  alibabacloud: 'Alibabacloud',
  azure: 'Azure',
  baidu: 'Baidu',
  bytedance: 'Bytedance',
  cerebras: 'Cerebras',
  cherrystudio: 'Cherrystudio',
  githubcopilot: 'Githubcopilot',
  google: 'Google',
  googlecloud: 'Googlecloud',
  grok: 'Grok',
  infinigence: 'Infinigence',
  lmstudio: 'Lmstudio',
  modelscope: 'Modelscope',
  newapi: 'Newapi',
  novelai: 'Novelai',
  nvidia: 'Nvidia',
  openrouter: 'Openrouter',
  perplexity: 'Perplexity',
  poe: 'Poe',
  qiniu: 'Qiniu',
  siliconcloud: 'Siliconcloud',
  stepfun: 'Stepfun',
  vertexai: 'Vertexai',
  volcengine: 'Volcengine',
  zai: 'Zai',
  zhipu: 'Zhipu',
};

// 按名称关键词回退匹配
const getIconByName = (name: string): keyof typeof ProviderIcons | undefined => {
  const lower = name.toLowerCase();

  if (lower.includes('deepseek')) return 'Deepseek';
  if (lower.includes('月之暗面') || lower.includes('moonshot') || lower.includes('kimi')) return 'Moonshot';
  if (lower.includes('硅基流动') || lower.includes('siliconflow') || lower.includes('silicon')) return 'Siliconcloud';
  if (lower.includes('ollama')) return 'Ollama';
  if (lower.includes('anthropic') || lower.includes('claude')) return 'Anthropic';
  if (lower.includes('gemini') || lower.includes('google')) return 'Gemini';
  if (lower.includes('openai') || lower.includes('gpt')) return 'Openai';
  if (lower.includes('zhipu') || lower.includes('chatglm') || lower.includes('glm')) return 'Zhipu';
  if (lower.includes('grok') || lower.includes('xai')) return 'Grok';
  if (lower.includes('azure') || lower.includes('microsoft')) return 'Azure';
  if (lower.includes('baidu') || lower.includes('wenxin') || lower.includes('文心')) return 'Baidu';
  if (lower.includes('bytedance') || lower.includes('doubao') || lower.includes('豆包')) return 'Bytedance';
  if (lower.includes('alibabacloud') || lower.includes('alibaba') || lower.includes('百炼')) return 'Alibabacloud';
  if (lower.includes('nvidia')) return 'Nvidia';
  if (lower.includes('openrouter')) return 'Openrouter';
  if (lower.includes('perplexity')) return 'Perplexity';
  if (lower.includes('github') || lower.includes('copilot')) return 'Githubcopilot';

  return undefined;
};

interface ProviderLogoProps {
  type: string;
  name?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const ProviderLogo = ({ type, name, size = 28, className, style }: ProviderLogoProps) => {
  let iconName: keyof typeof ProviderIcons | undefined;

  // 优先按名称匹配用户自定义的提供商
  if (name) {
    iconName = getIconByName(name);
  }
  if (!iconName) {
    iconName = providerMap[type.toLowerCase()];
  }

  const IconComponent = iconName ? (ProviderIcons as Record<string, SvgIconComponent>)[iconName] : null;

  if (IconComponent) {
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: 6,
          backgroundColor: 'var(--color-fill-2)',
          flex: 'none',
          ...style,
        }}
      >
        <IconComponent size={size * 0.65} style={{ flex: 'none', lineHeight: 1 }} />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 6,
        backgroundColor: 'var(--color-fill-2)',
        flex: 'none',
        ...style,
      }}
    >
      <IconRobot style={{ fontSize: size * 0.65, flex: 'none', lineHeight: 1 }} />
    </div>
  );
};

export default ProviderLogo;
