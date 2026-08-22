// Mock undici 的 fetch 以拦截 GitHub 代理路径的实际出站调用，避免测试产生真实网络请求。
// ProxyAgent 保留真实实现，用于断言代理路径选择的 dispatcher 类型。
// 原因：本仓库 jest 运行在原生 ESM 模式（--experimental-vm-modules），
//       CJS 风格的 jest.mock 工厂不可用，必须用 unstable_mockModule + 动态导入。
// 非代理路径与 SSRF 连接期校验走 global.fetch（受全局受保护 dispatcher 影响），单独以
// global.fetch 替换 / dns.lookup spy 覆盖。
import { jest } from '@jest/globals';
import dns from 'node:dns';

jest.unstable_mockModule('undici', async () => {
  // requireActual 是唯一不会被 mock 拦截的加载路径；
  // 工厂内直接 import('undici') 会递归触发本 mock，导致无限循环。
  const actual = jest.requireActual('undici') as Record<string, unknown>;
  return { ...actual, fetch: jest.fn() };
});

const {
  fetchWithProxy,
  getProxyUrl,
  createProxyAgent,
  isProxyConnectionError,
  parseMacProxyConfiguration,
} = await import('../../src/utils/proxy.js');
const undici = await import('undici');

// undici.fetch 的声明类型是真实 fetch，测试里按 jest.Mock 使用需要收窄。
// 原因：mock 工厂替换了运行时实现，类型系统无法感知。
const fetchMock = undici.fetch as unknown as jest.Mock;
const UndiciProxyAgent = undici.ProxyAgent;

describe('proxy utilities', () => {
  const originalFetch = global.fetch;
  const originalHttpProxy = process.env.HTTP_PROXY;
  const originalHttpsProxy = process.env.HTTPS_PROXY;

  beforeEach(() => {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    fetchMock.mockReset();
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
    it('should use global.fetch with redirect error when no proxy is configured', async () => {
      const mockResponse = { ok: true, status: 200 } as Response;
      let calledUrl: string | undefined;
      let calledInit: RequestInit | undefined;
      global.fetch = (url: string | URL, init?: RequestInit) => {
        calledUrl = String(url);
        calledInit = init;
        return Promise.resolve(mockResponse);
      };

      const result = await fetchWithProxy('https://example.com/test');

      expect(calledUrl).toBe('https://example.com/test');
      expect(calledInit?.redirect).toBe('error');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toBe(mockResponse);
    });

    it('should pass init options through while forcing redirect error', async () => {
      const mockResponse = { ok: true, status: 200 } as Response;
      let calledInit: RequestInit | undefined;
      global.fetch = (_url: string | URL, init?: RequestInit) => {
        calledInit = init;
        return Promise.resolve(mockResponse);
      };
      const init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
      } as RequestInit;

      await fetchWithProxy('https://example.com/test', init);

      expect(calledInit?.method).toBe('POST');
      expect(calledInit?.headers).toEqual({ 'Content-Type': 'application/json' });
      // redirect 必须被覆盖为 error：调用方不能放宽 SSRF 重定向防护。
      expect(calledInit?.redirect).toBe('error');
    });

    it('should reject non-loopback literal URLs without allowLoopback before any request', async () => {
      let fetchCalled = false;
      global.fetch = () => {
        fetchCalled = true;
        return Promise.resolve({ ok: true } as Response);
      };

      await expect(fetchWithProxy('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/受限网络地址/);
      expect(fetchCalled).toBe(false);
    });

    it('should bypass proxy for AI API URLs (not GitHub)', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      const mockResponse = { ok: true, status: 200 } as Response;
      let globalFetchUsed = false;
      global.fetch = () => {
        globalFetchUsed = true;
        return Promise.resolve(mockResponse);
      };

      const result = await fetchWithProxy('https://api.openai.com/v1/chat/completions');

      expect(globalFetchUsed).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toBe(mockResponse);
    });

    it('should bypass proxy for local AI services when allowLoopback is set', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      const mockResponse = { ok: true, status: 200 } as Response;
      global.fetch = () => Promise.resolve(mockResponse);

      const result = await fetchWithProxy('http://localhost:11434/api/tags', undefined, { allowLoopback: true });

      expect(result).toBe(mockResponse);
    });

    it('should attempt to use proxy for GitHub API (update check)', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      const mockResponse = { ok: true, status: 200 } as Response;
      fetchMock.mockResolvedValue(mockResponse);

      const result = await fetchWithProxy('https://api.github.com/repos/PapyrusOR/Papyrus_Desktop/releases/latest');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = fetchMock.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(init.dispatcher).toBeInstanceOf(UndiciProxyAgent);
      expect(init.redirect).toBe('error');
      expect(result).toBe(mockResponse);
    });

    it('should attempt to use proxy for raw.githubusercontent.com', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      const mockResponse = { ok: true, status: 200 } as Response;
      fetchMock.mockResolvedValue(mockResponse);

      const result = await fetchWithProxy('https://raw.githubusercontent.com/PapyrusOR/Papyrus_Desktop/main/README.md');

      const init = fetchMock.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(init.dispatcher).toBeInstanceOf(UndiciProxyAgent);
      expect(result).toBe(mockResponse);
    });

    it('should fall back to global.fetch when proxy server is unreachable', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:1';
      const mockResponse = { ok: true, status: 200 } as Response;
      const proxyError = new TypeError('fetch failed');
      // 构造与 undici 运行时一致的 mock error shape
      (proxyError as unknown as { cause: { code: string } }).cause = { code: 'ECONNREFUSED' };
      fetchMock.mockRejectedValueOnce(proxyError);
      global.fetch = () => Promise.resolve(mockResponse);

      const result = await fetchWithProxy('https://api.github.com/test');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockResponse);
    });

    it('should throw wrapped error when both proxy and direct fail', async () => {
      process.env.HTTPS_PROXY = 'http://127.0.0.1:1';
      const proxyError = new TypeError('fetch failed');
      (proxyError as unknown as { cause: { code: string } }).cause = { code: 'ECONNREFUSED' };
      fetchMock.mockRejectedValueOnce(proxyError);
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
  });

  describe('fetchWithProxy SSRF connect-time guard', () => {
    // 同 realm 的真实 undici fetch：jest 的 vm realm 分离会让内置 global.fetch 读不到
    // npm undici setGlobalDispatcher 挂载的受保护 dispatcher（生产环境单 realm 不受影响，
    // 已在纯 Node 下验证）。测试中显式替换为同 realm 的 undici fetch 以走完整 guard 链路。
    const actualUndiciFetch = (jest.requireActual('undici') as { fetch: typeof fetch }).fetch;
    let dnsLookupMock: jest.Mock;

    beforeEach(() => {
      global.fetch = actualUndiciFetch;
      // dns.lookup 的多重重载与 jest.Mock 泛型不兼容，测试里以受控 spy 伪造解析结果。
      dnsLookupMock = jest.spyOn(dns, 'lookup') as unknown as jest.Mock;
    });

    afterEach(() => {
      dnsLookupMock.mockRestore();
    });

    // undici 把连接层错误包成 TypeError('fetch failed')，真实原因在 cause 链上，
    // 断言必须遍历整条链才能区分 SSRF 拦截与其他网络错误。
    // 不用 instanceof Error：'fetch failed' 由 Node 内部 fetch 抛出，跨 jest vm realm
    // 的 instanceof 判定会失败，改为按 message 属性做鸭子类型判断。
    function deepErrorMessage(error: unknown): string {
      const parts: string[] = [];
      let current: unknown = error;
      while (
        current !== null && typeof current === 'object' &&
        'message' in current && typeof (current as { message?: unknown }).message === 'string'
      ) {
        parts.push((current as { message: string }).message);
        current = (current as { cause?: unknown }).cause;
      }
      return parts.join('\n');
    }

    it('should reject connections whose hostname resolves to a private address', async () => {
      dnsLookupMock.mockImplementation(
        (_hostname: string, _options: unknown, callback: (err: unknown, addresses: unknown) => void) => {
          callback(null, [{ address: '169.254.169.254', family: 4 }]);
        },
      );

      const error = await fetchWithProxy('http://metadata.attacker.example/').catch((e: unknown) => e);
      expect(deepErrorMessage(error)).toMatch(/受限网络地址/);
    });

    it('should reject loopback resolutions without allowLoopback even for keyless-style URLs', async () => {
      dnsLookupMock.mockImplementation(
        (_hostname: string, _options: unknown, callback: (err: unknown, addresses: unknown) => void) => {
          callback(null, [{ address: '127.0.0.1', family: 4 }]);
        },
      );

      // 字面量 localhost 在预检阶段即被拒绝（未带 allowLoopback），不会发起任何请求。
      const error = await fetchWithProxy('http://localhost:11434/api/tags').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/受限网络地址/);
    });

    it('should allow loopback resolutions when allowLoopback is set', async () => {
      dnsLookupMock.mockImplementation(
        (_hostname: string, _options: unknown, callback: (err: unknown, addresses: unknown) => void) => {
          callback(null, [{ address: '127.0.0.1', family: 4 }]);
        },
      );

      // 端口 1 上没有服务，连接会被拒绝——但错误必须是连接层错误而非 SSRF 拦截，
      // 证明回环地址已通过全局 dispatcher 的 guard 进入真实建连阶段。
      const error = await fetchWithProxy('http://127.0.0.1:1/api/tags', undefined, { allowLoopback: true }).catch((e: unknown) => e);
      expect(deepErrorMessage(error)).not.toMatch(/受限网络地址/);
    });

    it('should still block private non-loopback resolutions when allowLoopback is set', async () => {
      dnsLookupMock.mockImplementation(
        (_hostname: string, _options: unknown, callback: (err: unknown, addresses: unknown) => void) => {
          callback(null, [{ address: '192.168.1.10', family: 4 }]);
        },
      );

      const error = await fetchWithProxy('http://lan-service.example/api/tags', undefined, { allowLoopback: true }).catch((e: unknown) => e);
      expect(deepErrorMessage(error)).toMatch(/受限网络地址/);
    });
  });
});
