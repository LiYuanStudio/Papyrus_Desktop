const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  MACOS_VIBRANCY,
  getBackendLaunchInfo,
  getTrayIconName,
  getWindowAppearance,
  getWindowIconName,
} = require('../../electron/platform-config');
const {
  MACOS_MENU_ACTIONS,
  createMacApplicationMenuTemplate,
  dispatchRendererMenuAction,
} = require('../../electron/application-menu');
const builderConfig = require('../../.electron-builder.config');

test('macOS window appearance preserves native controls and accessibility fallback', () => {
  assert.deepEqual(getWindowAppearance('darwin', {
    darkMode: false,
    reduceTransparency: false,
  }), {
    frame: true,
    roundedCorners: true,
    titleBarOverlay: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 17 },
    backgroundColor: '#f7f7f5',
    vibrancy: MACOS_VIBRANCY,
    visualEffectState: 'active',
  });

  const reducedAppearance = getWindowAppearance('darwin', {
    darkMode: true,
    reduceTransparency: true,
  });
  assert.equal(reducedAppearance.vibrancy, undefined);
  assert.equal(reducedAppearance.backgroundColor, '#1e1e22');
  assert.equal(getWindowIconName('darwin'), 'icon.icns');
  assert.equal(getTrayIconName('darwin'), 'trayTemplate.png');
  assert.equal(getTrayIconName('win32'), 'icon.ico');
  assert.equal(getTrayIconName('linux'), 'icon.png');
});

test('macOS tray template includes standard and Retina assets', () => {
  const assetsDir = path.join(__dirname, '..', '..', 'assets');
  assert.equal(fs.existsSync(path.join(assetsDir, 'trayTemplate.png')), true);
  assert.equal(fs.existsSync(path.join(assetsDir, 'trayTemplate@2x.png')), true);
});

test('packaged backend launch uses the app executable without a shell', () => {
  assert.deepEqual(getBackendLaunchInfo({
    appRoot: '/Applications/Papyrus Desktop.app/Contents/Resources/app.asar',
    isDevMode: false,
    platform: 'darwin',
    processExecPath: '/Applications/Papyrus Desktop.app/Contents/MacOS/Papyrus Desktop',
    resourcesPath: '/Applications/Papyrus Desktop.app/Contents/Resources',
  }), {
    command: '/Applications/Papyrus Desktop.app/Contents/MacOS/Papyrus Desktop',
    args: ['/Applications/Papyrus Desktop.app/Contents/Resources/backend/dist/api/server.js'],
    cwd: '/Applications/Papyrus Desktop.app/Contents/Resources/backend',
  });
});

test('macOS menu exposes native accelerators and forwards stable renderer actions', () => {
  const actions = [];
  const template = createMacApplicationMenuTemplate({
    appName: 'Papyrus',
    isDevMode: false,
    sendAction: (action) => actions.push(action),
  });
  const appMenu = template[0];
  const fileMenu = template[1];
  const preferences = appMenu.submenu.find((item) => item.label === 'Preferences…');
  const newNote = fileMenu.submenu.find((item) => item.label === 'New Note');

  assert.equal(preferences.accelerator, 'Command+,');
  assert.equal(newNote.accelerator, 'Command+N');
  preferences.click();
  newNote.click();
  assert.deepEqual(actions, [
    MACOS_MENU_ACTIONS.PREFERENCES,
    MACOS_MENU_ACTIONS.NEW_NOTE,
  ]);
});

test('macOS menu waits for a recreated renderer before delivering its action', () => {
  const calls = [];
  let finishLoading;
  const targetWindow = {
    focus: () => calls.push('focus'),
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    webContents: {
      isLoadingMainFrame: () => true,
      once: (eventName, callback) => {
        calls.push(eventName);
        finishLoading = callback;
      },
      send: (channel, action) => calls.push(`${channel}:${action}`),
    },
  };

  dispatchRendererMenuAction(targetWindow, MACOS_MENU_ACTIONS.NEW_NOTE);
  assert.deepEqual(calls, ['did-finish-load']);
  assert.equal(typeof finishLoading, 'function');
  finishLoading();
  assert.deepEqual(calls, [
    'did-finish-load',
    'show',
    'focus',
    'menu:action:new-note',
  ]);
});

test('macOS release configuration builds native arm64 and Intel artifacts', () => {
  assert.deepEqual(builderConfig.mac.target, ['dmg']);
  assert.equal(builderConfig.mac.darkModeSupport, true);
  assert.equal(builderConfig.mac.minimumSystemVersion, '12.0');
  assert.equal(builderConfig.dmg.artifactName, '${productName}-macOS-${arch}.${ext}');

  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '..', '.github', 'workflows', 'release-optimized.yml'),
    'utf8',
  );
  assert.match(workflow, /platform: macos-arm64[\s\S]*arch: arm64[\s\S]*os: macos-15/);
  assert.match(workflow, /platform: macos-x64[\s\S]*arch: x64[\s\S]*os: macos-15-intel/);
  assert.match(workflow, /electron-builder --\$\{\{ matrix\.target \}\} --\$\{\{ matrix\.arch \}\}/);
});
