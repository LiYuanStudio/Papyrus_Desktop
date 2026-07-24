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

const purifyConfig = {
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

export function renderMarkdown(source: string): string {
  const html = md.render(source.replace(DANGEROUS_MARKDOWN_LINK_RE, '$1'));
  return DOMPurify.sanitize(html, purifyConfig);
}

export function renderMarkdownInline(source: string): string {
  const html = md.renderInline(source.replace(DANGEROUS_MARKDOWN_LINK_RE, '$1'));
  return DOMPurify.sanitize(html, purifyConfig);
}
