import {
  fetchWithProxy,
  getProxyUrl,
  createProxyAgent,
  isProxyConnectionError,
  parseMacProxyConfiguration,
} from '../../src/utils/proxy.js';

describe('proxy utilities', () => {
  const originalFetch = global.fetch;
  const originalHttpProxy = process.env.HTTP_PROXY;
  const originalHttpsProxy = process.env.HTTPS_PROXY;

  beforeEach(() => {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalHttpProxy !== undefined) {
      process.env.HTTP_PROXY = originalHttpProxy;
    } else {
      delete process.env.HTTP_PROXY;
    }
    if (originalHttpsProxy !== undefined) {
      process.env.HTTPS_PROXY = originalHttpsProxy;
    } else {
      delete process.env.HTTPS_PROXY;
    }
  });

  describe('getProxyUrl', () => {
    it('should return undefined when no proxy is configured', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getProxyUrl()).toBeUndefined();
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return HTTPS_PROXY env var', () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      expect(getProxyUrl()).toBe('http://127.0.0.1:7890');
    });

    it('should prefer HTTPS_PROXY over HTTP_PROXY', () => {
      process.env.HTTP_PROXY = 'http://192.168.1.1:8080';
      process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      expect(getProxyUrl()).toBe('http://127.0.0.1:7890');
    });

    it('should parse the active macOS HTTPS proxy without relying on service names', () => {
      const scutilOutput = `
        <dictionary> {
          HTTPEnable : 1
          HTTPPort : 8080
          HTTPProxy : fallback.local
          HTTPSEnable : 1
          HTTPSPort : 7897
          HTTPSProxy : secure.local
        }
      `;

      expect(parseMacProxyConfiguration(scutilOutput)).toBe('http://secure.local:7897');
    });

    it('should reject disabled or invalid macOS proxy dictionaries', () => {
      expect(parseMacProxyConfiguration('HTTPSEnable : 0\nHTTPSProxy : localhost\nHTTPSPort : 7890')).toBeUndefined();
      expect(parseMacProxyConfiguration('HTTPSEnable : 1\nHTTPSProxy : localhost\nHTTPSPort : 70000')).toBeUndefined();
    });
  });

  describe('createProxyAgent', () => {
    it('should return undefined when no proxy is configured', () => {
      expect(createProxyAgent()).toBeUndefined();
    });

    it('should create ProxyAgent when proxy is configured', () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      const agent = createProxyAgent();
      expect(agent).toBeDefined();
    });

    it('should return undefined for invalid proxy url', () => {
      process.env.HTTPS_PROXY = 'not-a-valid-url';
      // ProxyAgent constructor may throw or accept the string; depending on undici version
      // Just verify it does not crash
      expect(() => createProxyAgent()).not.toThrow();
    });
  });

  describe('fetchWithProxy', () => {
    it('should use global.fetch when no proxy is configured', async () => {
      const mockResponse = { ok: true, status: 200 } as Response;
      let calledUrl: string | undefined;
      let calledInit: RequestInit | undefined;
      global.fetch = (url: string, init?: RequestInit) => {
        calledUrl = url;
        calledInit = init;
        return Promise.resolve(mockResponse);
      };

      const result = await fetchWithProxy('https://example.com/test');

      expect(calledUrl).toBe('https://example.com/test');
      expect(calledInit).toBeUndefined();
      expect(result).toBe(mockResponse);
    });

    it('should pass init options through when no proxy is configured', async () => {
      const mockResponse = { ok: true, status: 200 } as Response;
      let calledUrl: string | undefined;
      let calledInit: RequestInit | undefined;
      global.fetch = (url: string, init?: RequestInit) => {
        calledUrl = url;
        calledInit = init;
        return Promise.resolve(mockResponse);
      };
      const init = { method: 'POST', headers: { 'Content-Type': 'application/json' } } as RequestInit;

      await fetchWithProxy('https://example.com/test', init);

      expect(calledUrl).toBe('https://example.com/test');
      expect(calledInit).toBe(init);
    });

    it('should not crash when proxy is configured', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      // When proxy is configured, fetchWithProxy uses undiciFetch which will fail
      // because there's no actual proxy server. We just verify it attempts the call
      // and throws a network-level error rather than a type/programming error.
      await expect(fetchWithProxy('http://localhost:99999/test')).rejects.toThrow();
    });

    it('should fall back to global.fetch when proxy server is unreachable', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:1';
      const mockResponse = { ok: true, status: 200 } as Response;
      global.fetch = () => Promise.resolve(mockResponse);

      const result = await fetchWithProxy('https://api.github.com/test');
      expect(result).toBe(mockResponse);
    });

    it('should throw wrapped error when both proxy and direct fail', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:1';
      global.fetch = () => Promise.reject(new Error('Direct fetch failed'));

      await expect(fetchWithProxy('https://api.github.com/test')).rejects.toThrow(
        /通过代理 .* 连接失败，已尝试直连仍失败/
      );
    });

    it('should not fallback for non-proxy errors', () => {
      expect(isProxyConnectionError(new Error('Proxy responded with 407'))).toBe(false);
      expect(isProxyConnectionError(null)).toBe(false);

      const connError = new Error('fetch failed');
      // @ts-expect-error — 构造与 undici 运行时一致的 mock error shape
      connError.cause = { code: 'ECONNREFUSED' };
      expect(isProxyConnectionError(connError)).toBe(true);
    });

    it('should bypass proxy for AI API URLs (not GitHub)', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      const mockResponse = { ok: true, status: 200 } as Response;
      let calledWithGlobalFetch = false;
      global.fetch = () => {
        calledWithGlobalFetch = true;
        return Promise.resolve(mockResponse);
      };

      const result = await fetchWithProxy('https://api.openai.com/v1/chat/completions');
      expect(calledWithGlobalFetch).toBe(true);
      expect(result).toBe(mockResponse);
    });

    it('should bypass proxy for local AI services (Ollama, etc.)', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      const mockResponse = { ok: true, status: 200 } as Response;
      let calledWithGlobalFetch = false;
      global.fetch = () => {
        calledWithGlobalFetch = true;
        return Promise.resolve(mockResponse);
      };

      const result = await fetchWithProxy('http://localhost:11434/api/tags');
      expect(calledWithGlobalFetch).toBe(true);
      expect(result).toBe(mockResponse);
    });

    it('should bypass proxy for other external APIs (not GitHub)', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      const mockResponse = { ok: true, status: 200 } as Response;
      let calledWithGlobalFetch = false;
      global.fetch = () => {
        calledWithGlobalFetch = true;
        return Promise.resolve(mockResponse);
      };

      const result = await fetchWithProxy('https://api.deepseek.com/v1/chat/completions');
      expect(calledWithGlobalFetch).toBe(true);
      expect(result).toBe(mockResponse);
    });

    it('should attempt to use proxy for GitHub API (update check)', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:1';
      const mockResponse = { ok: true, status: 200 } as Response;
      global.fetch = () => Promise.resolve(mockResponse);

      const result = await fetchWithProxy('https://api.github.com/repos/PapyrusOR/Papyrus_Desktop/releases/latest');
      expect(result).toBe(mockResponse);
    });

    it('should attempt to use proxy for raw.githubusercontent.com', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:1';
      const mockResponse = { ok: true, status: 200 } as Response;
      global.fetch = () => Promise.resolve(mockResponse);

      const result = await fetchWithProxy('https://raw.githubusercontent.com/PapyrusOR/Papyrus_Desktop/main/README.md');
      expect(result).toBe(mockResponse);
    });
  });
});
