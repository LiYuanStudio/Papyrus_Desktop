import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const DANGEROUS_MARKDOWN_LINK_RE = /\[([^\]]*)\]\(\s*(?:javascript|data|vbscript):[^)]*\)/gi;

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

md.validateLink = (url) => {
  const scheme = url.trim().toLowerCase().split(':', 1)[0];
  return ALLOWED_SCHEMES.has(scheme);
};

// 严格 DOMPurify 白名单，供 markdown 渲染与 DOCX 预览共用。
// 原因：默认配置放行更多标签/属性（如 style），文档类内容只需基础排版标签；
//       导出为常量而非内联使用，避免两处消毒策略漂移。
// 未使用 DOMPurify 默认配置：DOCX 内容经 mammoth 转换后混入无关属性的机会面更大。
export const STRICT_PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong',
    'em', 's', 'del', 'a', 'img', 'table', 'thead', 'tbody',
    'tr', 'td', 'th', 'div', 'span', 'sup', 'sub',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'target', 'rel',
    'width', 'height', 'align', 'colspan', 'rowspan',
  ],
  ALLOW_DATA_ATTR: false,
};

const purifyConfig = STRICT_PURIFY_CONFIG;

export function renderMarkdown(source: string): string {
  const html = md.render(source.replace(DANGEROUS_MARKDOWN_LINK_RE, '$1'));
  return DOMPurify.sanitize(html, purifyConfig);
}

export function renderMarkdownInline(source: string): string {
  const html = md.renderInline(source.replace(DANGEROUS_MARKDOWN_LINK_RE, '$1'));
  return DOMPurify.sanitize(html, purifyConfig);
}
