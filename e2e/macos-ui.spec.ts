import { expect, test } from '@playwright/test';

const AUTH_TOKEN = process.env.PAPYRUS_AUTH_TOKEN || 'e2e-test-token-e2e-test-token-32chars';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.addInitScript(({ token }) => {
    let nativeMenuListener: ((action: string) => void) | undefined;
    Object.defineProperty(window, 'electronEnv', {
      configurable: true,
      value: {
        ARCH: 'arm64',
        NODE_ENV: 'test',
        PLATFORM: 'darwin',
      },
    });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getAuthToken: () => Promise.resolve(token),
        getPlatform: () => Promise.resolve('darwin'),
        getSystemAppearance: () => Promise.resolve({
          darkMode: false,
          reduceTransparency: true,
        }),
        onMenuAction: (callback: (action: string) => void) => {
          nativeMenuListener = callback;
          return () => {
            nativeMenuListener = undefined;
          };
        },
        onSystemAppearanceChanged: () => () => {},
        openExternal: () => Promise.resolve(),
      },
    });
    Object.defineProperty(window, '__emitNativeMenuAction', {
      configurable: true,
      value: (action: string) => nativeMenuListener?.(action),
    });
  }, { token: AUTH_TOKEN });
});

test('macOS shell keeps native controls clear and remains usable at compact width', async ({ page }, testInfo) => {
  const frontendUrl = process.env.PAPYRUS_E2E_FRONTEND_URL;
  if (!frontendUrl) {
    throw new Error('PAPYRUS_E2E_FRONTEND_URL must be provided by Playwright config');
  }
  await page.goto(frontendUrl);

  const titlebar = page.locator('.titlebar');
  const search = page.locator('.titlebar-center');
  const sidebar = page.locator('.sidebar');
  await expect(titlebar).toHaveClass(/titlebar-macos/);
  await expect(page.locator('html')).toHaveAttribute('data-platform', 'macos');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-transparency', 'true');
  await expect(titlebar.locator('.titlebar-btn')).toHaveCount(0);
  await expect(titlebar.locator('.titlebar-sidebar-toggle')).toBeVisible();
  await expect(titlebar.locator('button.titlebar-avatar')).toBeVisible();
  await expect(titlebar.locator('input[placeholder*="⌘K"]')).toBeVisible();
  await expect(sidebar).not.toHaveClass(/sidebar-expanded/);

  const alignment = await page.evaluate(() => {
    const titlebarElement = document.querySelector('.titlebar');
    const searchElement = document.querySelector('.titlebar-center');
    if (!titlebarElement || !searchElement) {
      return null;
    }
    const titlebarRect = titlebarElement.getBoundingClientRect();
    const searchRect = searchElement.getBoundingClientRect();
    return {
      centerDelta: Math.abs(
        (titlebarRect.left + titlebarRect.width / 2) -
        (searchRect.left + searchRect.width / 2),
      ),
      height: titlebarRect.height,
      leadingLeft: document.querySelector('.titlebar-sidebar-toggle')?.getBoundingClientRect().left,
    };
  });
  expect(alignment).not.toBeNull();
  expect(alignment?.height).toBe(52);
  expect(alignment?.centerDelta).toBeLessThanOrEqual(1);
  expect(alignment?.leadingLeft).toBeGreaterThanOrEqual(78);

  await page.evaluate(() => {
    const emitAction = Reflect.get(window, '__emitNativeMenuAction');
    if (typeof emitAction === 'function') {
      emitAction('toggle-sidebar');
    }
  });
  await expect(sidebar).toHaveClass(/sidebar-expanded/);
  await expect(sidebar).toHaveCSS('width', '240px');
  const historyHeading = page.locator('.sidebar-chat-history-heading');
  await expect(historyHeading).toBeVisible();
  const historyHeadingBounds = await historyHeading.boundingBox();
  expect(historyHeadingBounds?.x).toBeGreaterThanOrEqual(0);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('macos-shell.png'),
    fullPage: true,
  });
});
