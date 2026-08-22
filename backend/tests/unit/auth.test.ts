import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('auth', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-auth-test-${Date.now()}`);
  let originalEnv: string | undefined;
  let getOrCreateAuthToken: () => string;
  let getAuthToken: () => string | null;
  let isAuthEnabled: () => boolean;
  let validateRequestToken: (token?: string) => boolean;
  let isPublicApiPath: (url: string) => boolean;
  let extractRequestToken: (
    headerToken: string | string[] | undefined,
    queryAccessToken?: string,
  ) => string | undefined;
  let allowsQueryTokenAuth: (url: string) => boolean;
  let ensureAuthToken: () => string;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;
    originalEnv = process.env.PAPYRUS_AUTH_TOKEN;
    delete process.env.PAPYRUS_AUTH_TOKEN;

    const authModule = await import('../../src/utils/auth.js');
    getOrCreateAuthToken = authModule.getOrCreateAuthToken;
    getAuthToken = authModule.getAuthToken;
    isAuthEnabled = authModule.isAuthEnabled;
    validateRequestToken = authModule.validateRequestToken;
    isPublicApiPath = authModule.isPublicApiPath;
    extractRequestToken = authModule.extractRequestToken;
    allowsQueryTokenAuth = authModule.allowsQueryTokenAuth;
    ensureAuthToken = authModule.ensureAuthToken;
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
    if (originalEnv !== undefined) {
      process.env.PAPYRUS_AUTH_TOKEN = originalEnv;
    } else {
      delete process.env.PAPYRUS_AUTH_TOKEN;
    }
  });

  beforeEach(() => {
    delete process.env.PAPYRUS_AUTH_TOKEN;
    const tokenFile = path.join(testDir, '.api_token');
    if (fs.existsSync(tokenFile)) {
      fs.rmSync(tokenFile, { force: true });
    }
  });

  it('should create token from env', () => {
    process.env.PAPYRUS_AUTH_TOKEN = 'a'.repeat(32);
    expect(getOrCreateAuthToken()).toBe('a'.repeat(32));
    expect(isAuthEnabled()).toBe(true);
    expect(validateRequestToken('a'.repeat(32))).toBe(true);
    expect(validateRequestToken('wrong')).toBe(false);
    expect(getAuthToken()).toBe('a'.repeat(32));
  });

  it('should create new token when no env or file', () => {
    const token = getOrCreateAuthToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(isAuthEnabled()).toBe(true);
    expect(validateRequestToken(token)).toBe(true);
  });

  it('should read existing token from file', () => {
    const first = getOrCreateAuthToken();
    // getAuthToken should read same token from file
    expect(getAuthToken()).toBe(first);
    expect(getOrCreateAuthToken()).toBe(first);
  });

  it('should fail closed when no token can be established', () => {
    // Fail closed：token 文件缺失/不可读时必须拒绝一切请求。
    // 原因：旧行为在此场景返回 true（放行全部），数据目录只读时整个 API 会静默裸奔。
    expect(getAuthToken()).toBeNull();
    expect(isAuthEnabled()).toBe(false);
    expect(validateRequestToken()).toBe(false);
    expect(validateRequestToken('anything')).toBe(false);
  });

  it('should reject short env token', () => {
    process.env.PAPYRUS_AUTH_TOKEN = 'short';
    const token = getOrCreateAuthToken();
    expect(token).not.toBe('short');
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it('should only treat /api/health as public path', () => {
    expect(isPublicApiPath('/api/health')).toBe(true);
    expect(isPublicApiPath('/api/health?verbose=1')).toBe(true);
    expect(isPublicApiPath('/api/providers')).toBe(false);
    expect(isPublicApiPath('/api/export')).toBe(false);
  });

  it('should extract token from header or query', () => {
    expect(extractRequestToken('header-token')).toBe('header-token');
    expect(extractRequestToken(['array-token'])).toBe('array-token');
    expect(extractRequestToken(undefined, 'query-token')).toBe('query-token');
    expect(extractRequestToken(undefined)).toBeUndefined();
  });

  it('should allow query token only on file media routes', () => {
    expect(allowsQueryTokenAuth('/api/files/abc/preview')).toBe(true);
    expect(allowsQueryTokenAuth('/api/files/abc/thumbnail')).toBe(true);
    expect(allowsQueryTokenAuth('/api/files/abc/download')).toBe(true);
    expect(allowsQueryTokenAuth('/api/notes')).toBe(false);
    expect(allowsQueryTokenAuth('/api/files/abc')).toBe(false);
  });

  it('should ensure auth token exists on startup helper', () => {
    const token = ensureAuthToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(getAuthToken()).toBe(token);
  });

  // 模拟“token 无法持久化”用目录占用 token 路径的方式：
  // 原因：chmod 只读在特权用户（CI 容器内的 root 等）下不阻止写入，测试会不稳定地通过；
  //       writeFileSync 写入目录路径抛 EISDIR 在任何用户与平台都确定成立。
  it('should abort startup when the token file cannot be persisted', () => {
    delete process.env.PAPYRUS_AUTH_TOKEN;
    const tokenFile = path.join(testDir, '.api_token');
    fs.rmSync(tokenFile, { force: true, recursive: true });
    fs.mkdirSync(tokenFile);
    try {
      // token 无法持久化时启动助手必须抛错终止，
      // 而不是带着“无 token”状态继续运行（那等于无认证暴露 API）。
      expect(() => ensureAuthToken()).toThrow(/无法创建或读取 API 认证 token/);
      // 抛错属于致命失败，不得留下半初始化状态供后续请求误用。
      expect(validateRequestToken('anything')).toBe(false);
    } finally {
      fs.rmSync(tokenFile, { recursive: true, force: true });
    }
  });

  describe('edge cases', () => {
    it('should reject token with different length', () => {
      process.env.PAPYRUS_AUTH_TOKEN = 'a'.repeat(32);
      expect(validateRequestToken('a'.repeat(31))).toBe(false);
      expect(validateRequestToken('a'.repeat(33))).toBe(false);
    });

    it('should return null when auth disabled and no token file', () => {
      delete process.env.PAPYRUS_AUTH_TOKEN;
      const tokenFile = path.join(testDir, '.api_token');
      if (fs.existsSync(tokenFile)) fs.rmSync(tokenFile);
      expect(getAuthToken()).toBeNull();
      expect(isAuthEnabled()).toBe(false);
    });
  });
});
