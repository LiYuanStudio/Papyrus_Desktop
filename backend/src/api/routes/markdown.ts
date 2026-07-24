import type { FastifyInstance } from 'fastify';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,
  linkify: true,
});

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'ftp:']);
const DANGEROUS_MARKDOWN_LINK_RE = /\[([^\]]*)\]\(\s*(?:javascript|data|vbscript):[^)]*\)/gi;

md.validateLink = (url: string): boolean => {
  try {
    const parsed = new URL(url.trim());
    return ALLOWED_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
};

export default async function markdownRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/render', async (request, reply) => {
    const body = request.body as { content?: string };
    if (!body.content) {
      reply.status(400).send({ success: false, error: 'Content is required' });
      return;
    }
    const safeContent = body.content.replace(DANGEROUS_MARKDOWN_LINK_RE, '$1');
    const html = md.render(safeContent);
    reply.send({ success: true, html });
  });
}
