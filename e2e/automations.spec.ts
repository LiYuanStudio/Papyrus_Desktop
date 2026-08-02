import { expect, test } from '@playwright/test';

const AUTH_TOKEN = process.env.PAPYRUS_AUTH_TOKEN || 'e2e-test-token-e2e-test-token-32chars';

// 为自动化页面提供 Electron 认证桥接，并清理临时 E2E 数据库中的旧夹具。
// 原因：Playwright retry 需要从可重复的空列表开始验证创建路径。
// 未使用生产数据库：playwright.config 已把 PAPYRUS_DATA_DIR 指向进程级临时目录。
test.beforeEach(async ({ page, request }) => {
  const response = await request.get('/api/automations');
  if (response.ok()) {
    const body = await response.json() as { automations?: Array<{ id: string }> };
    for (const automation of body.automations ?? []) {
      await request.delete(`/api/automations/${automation.id}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 840 });
  await page.addInitScript(({ token }) => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getAuthToken: () => Promise.resolve(token),
        getPlatform: () => Promise.resolve('win32'),
        getSystemAppearance: () => Promise.resolve({ darkMode: false, reduceTransparency: false }),
        onMenuAction: () => () => undefined,
        onSystemAppearanceChanged: () => () => undefined,
        openExternal: () => Promise.resolve(),
      },
    });
  }, { token: AUTH_TOKEN });
});

// 覆盖入口位置、结构化计划创建、暂停和无 Provider 时的失败审核记录。
// 原因：这些行为横跨 Sidebar、React 表单、Fastify、SQLite 与后台 Worker。
// 未模拟 API：真实链路能同时验证认证、字段映射和轮询刷新。
test('automation can be created, paused, run, and reviewed', async ({ page }) => {
  test.setTimeout(60_000);
  const frontendUrl = process.env.PAPYRUS_E2E_FRONTEND_URL;
  if (!frontendUrl) throw new Error('PAPYRUS_E2E_FRONTEND_URL must be provided by Playwright config');

  await page.goto(frontendUrl);
  const filesButton = page.getByRole('button', { name: '文件库', exact: true });
  const automationsButton = page.getByRole('button', { name: '自动化', exact: true });
  await expect(filesButton).toBeVisible();
  await expect(automationsButton).toBeVisible();
  const filesBox = await filesButton.boundingBox();
  const automationBox = await automationsButton.boundingBox();
  expect(automationBox?.y).toBeGreaterThan(filesBox?.y ?? 0);

  await automationsButton.click();
  await expect(page.getByRole('heading', { name: '自动化', level: 1 })).toBeVisible();
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: '新建自动化' }).click();

  const drawer = page.locator('.arco-drawer-wrapper:not(.arco-drawer-wrapper-hide)').filter({ hasText: '新建自动化' });
  await expect(drawer).toBeVisible();
  await drawer.locator('input[maxlength="100"]').fill('E2E 每日复习摘要');
  await drawer.locator('textarea').fill('汇总今天到期的卡片，并给出简短复习建议。');
  await drawer.getByRole('button', { name: '保存', exact: true }).click();

  const card = page.locator('.automation-card').filter({ hasText: 'E2E 每日复习摘要' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('每天');
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  const editDrawer = page.locator('.arco-drawer-wrapper:not(.arco-drawer-wrapper-hide)').filter({ hasText: '编辑自动化' });
  await editDrawer.locator('input[maxlength="100"]').fill('E2E 每日复习审核');
  await editDrawer.getByRole('button', { name: '保存', exact: true }).click();
  const editedCard = page.locator('.automation-card').filter({ hasText: 'E2E 每日复习审核' });
  await expect(editedCard).toBeVisible();
  const enabledSwitch = editedCard.getByRole('switch');
  await expect(enabledSwitch).toBeChecked();
  await enabledSwitch.click();
  await expect(enabledSwitch).not.toBeChecked();

  await editedCard.getByRole('button', { name: '立即运行' }).click();
  await expect(page.getByText('运行记录', { exact: true }).first()).toBeVisible();
  const runRow = page.locator('.automation-run-row').filter({ hasText: 'E2E 每日复习审核' });
  await expect(runRow).toBeVisible();
  await expect(runRow.getByText('失败', { exact: true })).toBeVisible({ timeout: 15_000 });
  await runRow.click();
  const runDrawer = page.locator('.arco-drawer-wrapper:not(.arco-drawer-wrapper-hide)').filter({ hasText: '运行详情' });
  await expect(runDrawer.getByText('失败', { exact: true })).toBeVisible();
  await expect(runDrawer.locator('.arco-alert-error')).toBeVisible();
  await expect(runDrawer.getByText('尚未配置 AI Provider，请先在设置中添加并启用一个提供商', { exact: true })).toBeVisible();
});

// 验证键盘入口、窄窗口布局、深色主题和减少动画偏好。
// 原因：自动化是高频侧栏功能，必须在非鼠标与紧凑桌面布局中保持可用。
// 未依赖截图像素：语义和计算样式断言在不同 Windows 缩放比例下更稳定。
test('automation page honors accessibility and compact appearance settings', async ({ page, request }) => {
  const frontendUrl = process.env.PAPYRUS_E2E_FRONTEND_URL;
  if (!frontendUrl) throw new Error('PAPYRUS_E2E_FRONTEND_URL must be provided by Playwright config');
  const createResponse = await request.post('/api/automations', {
    data: {
      name: '紧凑布局测试',
      prompt: '只读取复习统计。',
      schedule: { kind: 'daily', hour: 9, minute: 0 },
      enabled: true,
    },
  });
  expect(createResponse.ok()).toBe(true);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 720, height: 650 });
  await page.goto(frontendUrl);

  const automationsButton = page.getByRole('button', { name: '自动化', exact: true });
  await automationsButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '自动化', level: 1 })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('arco-theme', 'dark');
  await expect(page.locator('.automations-grid')).toHaveCSS('grid-template-columns', /\d+(\.\d+)?px/);
  const transitionSeconds = await page.locator('.automation-card').first().evaluate((element) => (
    Number.parseFloat(window.getComputedStyle(element).transitionDuration)
  ));
  expect(transitionSeconds).toBeLessThan(0.001);

  const newButton = page.getByRole('button', { name: '新建自动化' });
  await newButton.focus();
  await page.keyboard.down('Enter');
  await expect(page.locator('.arco-drawer-wrapper:not(.arco-drawer-wrapper-hide)').filter({ hasText: '新建自动化' })).toBeVisible();
  await page.keyboard.up('Enter');

  await page.keyboard.press('Escape');
  await expect(page.locator('.automations-page-shell')).toBeVisible();
});
