import { expect, test } from '@playwright/test';

const AUTH_TOKEN = process.env.PAPYRUS_AUTH_TOKEN || 'e2e-test-token-e2e-test-token-32chars';
const KEYED_PROVIDER_ID = 'e2e-model-modal-keyed-provider';
const KEYLESS_PROVIDER_ID = 'e2e-model-modal-keyless-provider';
const PRIMARY_KEY_ID = 'e2e-model-modal-primary-key';
const SECONDARY_KEY_ID = 'e2e-model-modal-secondary-key';

// 为每次用例准备可重复创建的供应商数据，并模拟 Electron 向前端提供本地认证令牌。
// 原因：固定 ID 配合测试前删除可以支持 Playwright retry，同时避免失败重试残留模型影响默认供应商顺序。
// 未复用生产用户数据：E2E 配置已把数据库定向到临时目录，所有删除和创建都只作用于测试夹具。
test.beforeEach(async ({ page, request }) => {
  await request.delete(`/api/providers/${KEYED_PROVIDER_ID}`);
  await request.delete(`/api/providers/${KEYLESS_PROVIDER_ID}`);

  const keyedProviderResponse = await request.post('/api/providers', {
    data: {
      id: KEYED_PROVIDER_ID,
      type: 'openai',
      name: 'E2E OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      enabled: true,
      isDefault: true,
      apiKeys: [
        { id: PRIMARY_KEY_ID, name: 'primary', key: 'e2e-primary-secret' },
        { id: SECONDARY_KEY_ID, name: 'secondary', key: 'e2e-secondary-secret' },
      ],
      models: [],
    },
  });
  expect(keyedProviderResponse.ok(), await keyedProviderResponse.text()).toBe(true);

  const keylessProviderResponse = await request.post('/api/providers', {
    data: {
      id: KEYLESS_PROVIDER_ID,
      type: 'ollama',
      name: 'E2E Keyless',
      baseUrl: 'http://127.0.0.1:11434',
      enabled: true,
      isDefault: false,
      apiKeys: [],
      models: [],
    },
  });
  expect(keylessProviderResponse.ok(), await keylessProviderResponse.text()).toBe(true);

  await page.setViewportSize({ width: 1280, height: 840 });
  await page.addInitScript(({ token }) => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getAuthToken: () => Promise.resolve(token),
        getPlatform: () => Promise.resolve('win32'),
        getSystemAppearance: () => Promise.resolve({
          darkMode: false,
          reduceTransparency: false,
        }),
        onMenuAction: () => () => undefined,
        onSystemAppearanceChanged: () => () => undefined,
        openExternal: () => Promise.resolve(),
      },
    });
  }, { token: AUTH_TOKEN });
});

// 覆盖模型弹窗首次打开、重复打开、无密钥供应商和编辑恢复的完整用户路径。
// 原因：缺陷来自 Modal、Form 与异步 props 的组合生命周期，静态渲染无法验证实际交互状态。
// 未拆成多个共享数据库用例：单一顺序场景能直接复现“继续添加模型”，并减少跨测试夹具干扰。
test('model modal keeps provider and API key state consistent across repeated use', async ({ page }) => {
  test.setTimeout(60_000);
  const frontendUrl = process.env.PAPYRUS_E2E_FRONTEND_URL;
  if (!frontendUrl) {
    throw new Error('PAPYRUS_E2E_FRONTEND_URL must be provided by Playwright config');
  }

  // 统计浏览器实际发出的模型创建请求，验证必填校验在网络请求前截断提交。
  // 原因：只检查错误文案不能证明后台没有收到无效数据。
  // 未拦截或模拟请求：保留真实前后端链路，后续成功创建仍由响应断言验证。
  let modelCreateRequestCount = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/models')) {
      modelCreateRequestCount += 1;
    }
  });

  await page.goto(frontendUrl);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.locator('.settings-page').locator('..')).not.toHaveAttribute('style', /opacity/);
  const chatCategory = page.locator('.settings-category-card').filter({ hasText: '聊天' });
  await expect(chatCategory).toBeVisible();
  await chatCategory.click();
  await page.getByRole('button', { name: '模型管理', exact: true }).click();

  await page.getByRole('button', { name: '添加模型', exact: true }).click();
  let modal = page.locator('.arco-modal').filter({ hasText: '添加模型' });
  await expect(modal).toBeVisible();

  let providerField = modal.locator('.arco-form-item').filter({ hasText: '供应商' });
  let apiKeyField = modal.locator('.arco-form-item').filter({ hasText: 'API Key 方案' });
  await expect(providerField.locator('.arco-select-view')).toContainText('E2E OpenAI');
  await expect(apiKeyField.locator('.arco-select-view')).toContainText('primary');

  await modal.getByRole('button', { name: '确定' }).click();
  await expect(modal.getByText('模型名称不能为空', { exact: true })).toBeVisible();
  await expect(modal.getByText('模型 ID 不能为空', { exact: true })).toBeVisible();
  await expect(modal).toBeVisible();
  expect(modelCreateRequestCount).toBe(0);

  await modal.getByPlaceholder('如：GPT-4o', { exact: true }).fill('E2E First Model');
  await modal.getByPlaceholder('实际的 API ID，如：gpt-4o', { exact: true }).fill('e2e-first-model');
  await modal.locator('label.arco-checkbox').first().click();
  await apiKeyField.locator('.arco-select-view').click();
  await page.locator('.arco-select-option').filter({ hasText: /^secondary$/ }).click();

  const firstCreateResponsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api/providers/${KEYED_PROVIDER_ID}/models`
      && response.request().method() === 'POST'
  );
  await modal.getByRole('button', { name: '确定' }).click();
  const firstCreateResponse = await firstCreateResponsePromise;
  expect(firstCreateResponse.ok(), await firstCreateResponse.text()).toBe(true);
  await expect(modal).toBeHidden();

  const firstModelCard = page.locator('.arco-card').filter({ hasText: 'E2E First Model' });
  await expect(firstModelCard).toContainText('Key: secondary (已配置)');

  await page.getByRole('button', { name: '添加模型', exact: true }).click();
  modal = page.locator('.arco-modal').filter({ hasText: '添加模型' });
  providerField = modal.locator('.arco-form-item').filter({ hasText: '供应商' });
  apiKeyField = modal.locator('.arco-form-item').filter({ hasText: 'API Key 方案' });
  await expect(providerField.locator('.arco-select-view')).toContainText('E2E OpenAI');
  await expect(apiKeyField.locator('.arco-select-view')).toContainText('primary');

  await modal.getByPlaceholder('如：GPT-4o', { exact: true }).fill('E2E Second Model');
  await modal.getByPlaceholder('实际的 API ID，如：gpt-4o', { exact: true }).fill('e2e-second-model');
  await apiKeyField.locator('.arco-select-view').click();
  await page.locator('.arco-select-option').filter({ hasText: /^secondary$/ }).click();

  const secondCreateResponsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api/providers/${KEYED_PROVIDER_ID}/models`
      && response.request().method() === 'POST'
  );
  await modal.getByRole('button', { name: '确定' }).click();
  const secondCreateResponse = await secondCreateResponsePromise;
  expect(secondCreateResponse.ok(), await secondCreateResponse.text()).toBe(true);
  await expect(page.getByText('E2E Second Model', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '添加模型', exact: true }).click();
  modal = page.locator('.arco-modal').filter({ hasText: '添加模型' });
  providerField = modal.locator('.arco-form-item').filter({ hasText: '供应商' });
  apiKeyField = modal.locator('.arco-form-item').filter({ hasText: 'API Key 方案' });
  await providerField.locator('.arco-select-view').click();
  await page.getByRole('option', { name: /E2E Keyless/ }).click();
  await expect(apiKeyField.locator('.arco-select-view')).not.toContainText(/primary|secondary/);

  await modal.getByPlaceholder('如：GPT-4o', { exact: true }).fill('E2E Keyless Model');
  await modal.getByPlaceholder('实际的 API ID，如：gpt-4o', { exact: true }).fill('e2e-keyless-model');
  const keylessCreateResponsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api/providers/${KEYLESS_PROVIDER_ID}/models`
      && response.request().method() === 'POST'
  );
  await modal.getByRole('button', { name: '确定' }).click();
  const keylessCreateResponse = await keylessCreateResponsePromise;
  expect(keylessCreateResponse.ok(), await keylessCreateResponse.text()).toBe(true);

  const keylessModelCard = page.locator('.arco-card').filter({ hasText: 'E2E Keyless Model' });
  await expect(keylessModelCard).toContainText('Key: default (未配置)');

  await firstModelCard.getByTitle('编辑').click();
  const editModal = page.locator('.arco-modal').filter({ hasText: '编辑模型' });
  await expect(editModal.getByPlaceholder('如：GPT-4o', { exact: true })).toHaveValue('E2E First Model');
  await expect(editModal.getByPlaceholder('实际的 API ID，如：gpt-4o', { exact: true })).toHaveValue('e2e-first-model');
  const editApiKeyField = editModal.locator('.arco-form-item').filter({ hasText: 'API Key 方案' });
  await expect(editApiKeyField.locator('.arco-select-view')).toContainText('secondary');
  await expect(editModal.getByRole('checkbox').first()).toBeChecked();
  expect(modelCreateRequestCount).toBe(3);
  await editModal.getByRole('button', { name: '取消' }).click();
});
