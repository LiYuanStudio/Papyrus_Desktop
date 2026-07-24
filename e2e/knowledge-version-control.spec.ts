import { expect, test } from '@playwright/test';

const AUTH_TOKEN = process.env.PAPYRUS_AUTH_TOKEN || 'e2e-test-token-e2e-test-token-32chars';

test.beforeEach(async ({ page }) => {
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

test('settings version control creates, branches, switches and deletes through the UI', async ({ page }) => {
  const frontendUrl = process.env.PAPYRUS_E2E_FRONTEND_URL;
  if (!frontendUrl) {
    throw new Error('PAPYRUS_E2E_FRONTEND_URL must be provided by Playwright config');
  }
  await page.goto(frontendUrl);

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.locator('.settings-page').locator('..')).not.toHaveAttribute('style', /opacity/);
  const category = page.locator('.settings-category-card').filter({ hasText: '版本控制' });
  await expect(category).toBeVisible();
  await category.click();
  await expect(page.getByRole('heading', { name: '版本控制', level: 2 })).toBeVisible();

  await page.locator('.knowledge-version-toolbar-actions')
    .getByRole('button', { name: '新建分支' })
    .click();
  const directBranchModal = page.locator('.arco-modal').filter({ hasText: '新建分支' });
  await directBranchModal.locator('input').fill('e2e-direct-branch');
  const directBranchResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/knowledge-branches')
      && response.request().method() === 'POST'
  );
  await directBranchModal.getByRole('button', { name: '确认' }).click();
  const directBranchResponse = await directBranchResponsePromise;
  expect(directBranchResponse.status(), await directBranchResponse.text()).toBe(201);
  await expect(page.getByText('已创建并切换到分支“e2e-direct-branch”')).toBeVisible();
  await expect(page.locator('.knowledge-version-branch-picker')).toContainText('e2e-direct-branch');

  await page.locator('.knowledge-version-branch-picker').click();
  await page.locator('.arco-select-option').filter({ hasText: /^main$/ }).click();
  await expect(page.getByText('已切换到分支“main”')).toBeVisible();

  await page.getByRole('button', { name: '创建版本' }).first().click();
  const versionModal = page.locator('.arco-modal').filter({ hasText: '创建版本' });
  await versionModal.locator('input').fill('E2E UI 基线');
  await versionModal.locator('textarea').fill('浏览器流程测试');
  const createResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/knowledge-versions')
      && response.request().method() === 'POST'
  );
  await versionModal.getByRole('button', { name: '确认' }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status(), await createResponse.text()).toBe(201);
  await expect(page.getByText('版本已创建')).toBeVisible();
  await expect(page.getByText('E2E UI 基线', { exact: true })).toBeVisible();

  const versionRow = page.locator('.knowledge-version-item').filter({ hasText: 'E2E UI 基线' });
  await versionRow.getByRole('button', { name: '从此版本旁开分支' }).click();
  const branchModal = page.locator('.arco-modal').filter({ hasText: '旁开分支' });
  await branchModal.locator('input').fill('e2e-ui-branch');
  await branchModal.getByRole('button', { name: '确认' }).click();
  await expect(page.getByText('已创建并切换到分支“e2e-ui-branch”')).toBeVisible();
  await expect(page.locator('.knowledge-version-branch-picker')).toContainText('e2e-ui-branch');

  await page.locator('.knowledge-version-branch-picker').click();
  await page.locator('.arco-select-option').filter({ hasText: /^main$/ }).click();
  await expect(page.getByText('已切换到分支“main”')).toBeVisible();

  await page.getByRole('button', { name: '分支管理' }).click();
  const branchRow = page.locator('.knowledge-branch-row').filter({ hasText: 'e2e-ui-branch' });
  await expect(branchRow).toBeVisible();
  await branchRow.getByRole('button', { name: '删除分支：e2e-ui-branch' }).click();
  const deleteModal = page.locator('.arco-modal').filter({ hasText: '删除分支？' });
  await deleteModal.getByRole('button', { name: '删除' }).click();
  await expect(page.getByText('删除成功')).toBeVisible();
  await expect(branchRow).toHaveCount(0);
});
