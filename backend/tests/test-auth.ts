export const TEST_AUTH_TOKEN = 'test-jest-auth-token-32-chars-minimum';

export function testAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'x-papyrus-token': process.env.PAPYRUS_AUTH_TOKEN ?? TEST_AUTH_TOKEN,
    ...extra,
  };
}

type InjectableApp = {
  inject: (opts: Record<string, unknown>) => Promise<unknown>;
};

// 为集成测试自动注入认证头，避免逐个修改数百处 app.inject 调用。
// 原因：安全加固后所有 /api 路由都需要 token，测试夹具必须统一携带。
// 未在 server 内对 test 环境放行：那会削弱认证回归测试的价值。
export function patchAppInjectWithAuth(app: InjectableApp): void {
  const token = process.env.PAPYRUS_AUTH_TOKEN ?? TEST_AUTH_TOKEN;
  const originalInject = app.inject.bind(app);
  app.inject = ((opts: Record<string, unknown>) => {
    const existingHeaders = (opts.headers as Record<string, string> | undefined) ?? {};
    return originalInject({
      ...opts,
      headers: {
        'x-papyrus-token': token,
        ...existingHeaders,
      },
    });
  }) as typeof app.inject;
}
