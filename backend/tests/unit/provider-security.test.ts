import {
  validateProviderBaseUrl,
  isMaskedApiKeySubmission,
  maskApiKeyForDisplay,
} from '../../src/utils/provider-security.js';

describe('provider-security', () => {
  it('allows localhost for ollama', () => {
    expect(validateProviderBaseUrl('http://localhost:11434', 'ollama')).toBeNull();
    expect(validateProviderBaseUrl('http://127.0.0.1:11434', 'ollama')).toBeNull();
  });

  it('blocks private URLs for remote providers', () => {
    expect(validateProviderBaseUrl('http://192.168.1.1/v1', 'openai')).toMatch(/SSRF/);
    expect(validateProviderBaseUrl('http://169.254.169.254/', 'deepseek')).toMatch(/SSRF/);
  });

  it('requires HTTPS before sending API keys to remote providers', () => {
    expect(validateProviderBaseUrl('http://203.0.113.10/v1', 'openai')).toMatch(/HTTPS/);
    expect(validateProviderBaseUrl('https://203.0.113.10/v1', 'openai')).toBeNull();
  });

  it('blocks non-local hosts for keyless providers', () => {
    expect(validateProviderBaseUrl('http://192.168.1.1:11434', 'ollama')).toMatch(/localhost/);
  });

  it('detects masked API key submissions', () => {
    expect(isMaskedApiKeySubmission('')).toBe(true);
    expect(isMaskedApiKeySubmission('********abcd')).toBe(true);
    expect(isMaskedApiKeySubmission('sk-live-real-key-value')).toBe(false);
  });

  it('masks stored keys for client responses', () => {
    expect(maskApiKeyForDisplay(false)).toEqual({ key: '', hasKey: false });
    expect(maskApiKeyForDisplay(true, 'sk-abcdefghijklmnop')).toEqual({
      key: '***************mnop',
      hasKey: true,
    });
    expect(maskApiKeyForDisplay(true)).toEqual({ key: '********', hasKey: true });
  });

  it('rejects invalid URL schemes for providers', () => {
    expect(validateProviderBaseUrl('file:///etc/passwd', 'openai')).toMatch(/http|https/);
    expect(validateProviderBaseUrl('not-a-url', 'openai')).toMatch(/无效/);
  });

  it('allows empty baseUrl', () => {
    expect(validateProviderBaseUrl('', 'openai')).toBeNull();
    expect(validateProviderBaseUrl('   ', 'openai')).toBeNull();
  });
});
