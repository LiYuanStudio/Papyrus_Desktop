import assert from 'node:assert/strict';
import test from 'node:test';
import { clampChatWidth, getChatWidthBounds } from './appLayout';
import { formatShortcutForPlatform, resolveAppPlatform } from './platform';

test('resolveAppPlatform maps Electron platform names without user-agent guessing', () => {
  assert.equal(resolveAppPlatform('darwin'), 'macos');
  assert.equal(resolveAppPlatform('win32'), 'windows');
  assert.equal(resolveAppPlatform('linux'), 'linux');
  assert.equal(resolveAppPlatform('freebsd'), 'web');
  assert.equal(resolveAppPlatform(), 'web');
});

test('chat width preserves a readable main area on compact MacBook-sized windows', () => {
  assert.deepEqual(getChatWidthBounds(960, 48), { min: 280, max: 492 });
  assert.equal(clampChatWidth(600, 960, 48), 492);
  assert.equal(clampChatWidth(200, 1440, 240), 280);
  assert.equal(clampChatWidth(520, 1440, 240), 520);
});

test('macOS shortcut labels use native modifier symbols without changing other platforms', () => {
  assert.equal(formatShortcutForPlatform('Ctrl+K', 'macos'), '⌘K');
  assert.equal(formatShortcutForPlatform('Ctrl+Shift+I', 'macos'), '⌘⇧I');
  assert.equal(formatShortcutForPlatform('Alt+F4', 'macos'), '⌥F4');
  assert.equal(formatShortcutForPlatform('Ctrl+K S', 'macos'), '⌘K S');
  assert.equal(formatShortcutForPlatform('Ctrl+K', 'windows'), 'Ctrl+K');
});
