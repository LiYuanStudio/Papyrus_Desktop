import React from 'react';
import { IconRobot } from '@arco-design/web-react/icon';
import * as ModelIcons from './svgs/models';

type SvgIconComponent = React.FC<{
  size?: number | string;
  style?: React.CSSProperties;
  className?: string;
}>;

interface ModelMatch {
  keywords: string[];
  icon: keyof typeof ModelIcons;
}

const modelMatches: ModelMatch[] = [
  { keywords: ['gpt', 'openai', 'dall-e', 'whisper', 'tts'], icon: 'Openai' },
  { keywords: ['claude', 'anthropic'], icon: 'Claude' },
  { keywords: ['gemini'], icon: 'Gemini' },
  { keywords: ['ollama'], icon: 'Ollama' },
  { keywords: ['llama', 'meta', 'codellama'], icon: 'Meta' },
  { keywords: ['mistral', 'mixtral', 'pixtral'], icon: 'Mistral' },
  { keywords: ['huggingface', 'hf ', 'hugging face'], icon: 'Huggingface' },
  { keywords: ['openrouter'], icon: 'Openrouter' },
  { keywords: ['zhipu', 'glm', 'chatglm'], icon: 'Zhipu' },
  { keywords: ['gemma'], icon: 'Gemma' },
  { keywords: ['grok'], icon: 'Grok' },
  { keywords: ['qwen', 'tongyi', 'qwen2'], icon: 'Qwen' },
  { keywords: ['doubao'], icon: 'Doubao' },
  { keywords: ['deepseek'], icon: 'Deepseek' },
  { keywords: ['yuanbao'], icon: 'Yuanbao' },
  { keywords: ['minimax'], icon: 'Minimax' },
  { keywords: ['moonshot', 'kimi'], icon: 'Moonshot' },
  { keywords: ['nanobanana'], icon: 'Nanobanana' },
  { keywords: ['tavily'], icon: 'Tavily' },
  { keywords: ['wenxin', 'ernie'], icon: 'Wenxin' },
  { keywords: ['xiaomimimo'], icon: 'Xiaomimimo' },
];

function resolveModelIcon(model: string, modelId?: string): keyof typeof ModelIcons | null {
  // 优先用 modelId 匹配（更稳定，不受自定义名称影响）
  if (modelId) {
    const idLower = modelId.toLowerCase();
    for (const match of modelMatches) {
      for (const kw of match.keywords) {
        if (idLower.includes(kw.toLowerCase())) {
          return match.icon;
        }
      }
    }
  }
  const lower = model.toLowerCase();
  for (const match of modelMatches) {
    for (const kw of match.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return match.icon;
      }
    }
  }
  return null;
}

interface ModelLogoProps {
  model: string;
  modelId?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const ModelLogo = ({ model, modelId, size = 28, className, style }: ModelLogoProps) => {
  const iconName = resolveModelIcon(model, modelId);
  const IconComponent = iconName ? (ModelIcons as Record<string, SvgIconComponent>)[iconName] : null;

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

export default ModelLogo;
