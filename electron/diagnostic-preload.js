const { contextBridge, app } = require('electron');
const fs = require('fs');
const path = require('path');

// Path whitelist for diagnostic directory listing
function isAllowedPath(dir) {
  const allowed = [
    app.getPath('userData'),
    path.join(app.getPath('home'), 'PapyrusData'),
    path.join(app.getPath('home'), '.papyrusData'),
    path.join(app.getPath('home'), '.papyrus'),
  ];
  const resolved = path.resolve(dir);
  // 使用 path.relative 包含性判断而非 startsWith：
  // 原因：startsWith 会把 "PapyrusData-backup" 这类同前缀兄弟目录误判为白名单内。
  // 与 security-validators.js 保持同一实现，避免两套边界判断语义漂移。
  return allowed.some(a => {
    const relative = path.relative(path.resolve(a), resolved);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}

contextBridge.exposeInMainWorld('diagnosticAPI', {
  listDir: (dir) => {
    if (typeof dir !== 'string' || dir.length > 1024) return 'Invalid directory path';
    if (!isAllowedPath(dir)) return 'Access denied: directory not in allowed list';
    if (!fs.existsSync(dir)) return 'Directory does not exist';

    function listRecursive(currentDir, indent) {
      indent = indent || '';
      let result = '';
      try {
        const items = fs.readdirSync(currentDir);
        for (let i = 0; i < Math.min(items.length, 20); i++) {
          const item = items[i];
          const fullPath = path.join(currentDir, item);
          const stat = fs.statSync(fullPath);
          const size = stat.isFile() ? (' (' + (stat.size / 1024 / 1024).toFixed(2) + ' MB)') : '';
          result += indent + item + size + '\n';

          if (stat.isDirectory() && (item === '_internal' || item === 'Papyrus')) {
            result += listRecursive(fullPath, indent + '  ');
          }
        }
        if (items.length > 20) {
          result += indent + '... and ' + (items.length - 20) + ' more items\n';
        }
      } catch (e) {
        result += indent + 'Error: ' + e.message + '\n';
      }
      return result;
    }

    return listRecursive(dir);
  }
});
