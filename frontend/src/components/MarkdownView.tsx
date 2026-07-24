import React from 'react';
import { renderMarkdown, renderMarkdownInline } from '../utils/markdown.js';

interface MarkdownViewProps {
  source: string;
  compact?: boolean;
  inline?: boolean;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ source, compact, inline }) => {
  const html = inline ? renderMarkdownInline(source) : renderMarkdown(source);
  const className = compact ? 'chat-markdown chat-markdown-compact' : 'chat-markdown';
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
