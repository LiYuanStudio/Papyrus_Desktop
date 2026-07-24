import { renderMarkdown, renderMarkdownInline } from '../markdown';

describe('renderMarkdown', () => {
  it('should render heading', () => {
    const html = renderMarkdown('# Hello');
    expect(html).toContain('<h1>Hello</h1>');
  });

  it('should render bold and inline code', () => {
    const html = renderMarkdown('**bold** `code`');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('should render code block', () => {
    const html = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code>');
    expect(html).toContain('const x = 1;');
  });

  it('should render list', () => {
    const html = renderMarkdown('- a\n- b');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<li>b</li>');
  });

  it('should escape raw html', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('should allow safe https links', () => {
    const html = renderMarkdown('[ok](https://example.com)');
    expect(html).toContain('href="https://example.com"');
  });

  it('should strip dangerous javascript links', () => {
    const html = renderMarkdown('[x](javascript:alert(1))');
    expect(html).not.toContain('javascript:alert(1)');
  });
});

describe('renderMarkdownInline', () => {
  it('should not wrap in paragraph', () => {
    const html = renderMarkdownInline('hello');
    expect(html).toBe('hello');
  });

  it('should render inline bold', () => {
    const html = renderMarkdownInline('**bold**');
    expect(html).toContain('<strong>bold</strong>');
  });
});
