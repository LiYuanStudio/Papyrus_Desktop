const fs = require('fs');
const path = require('path');

const EXTERNAL_PROTOCOLS = ['http:', 'https:', 'mailto:'];
const EXTERNAL_DOMAINS = [
  'github.com',
  'githubusercontent.com',
  'openai.com',
  'anthropic.com',
  'google.com',
  'googleapis.com',
  'deepseek.com',
  'siliconflow.cn',
  'moonshot.cn',
];

// Resolve a path for security checks while tolerating missing paths.
// Reason: folder-opening checks must account for symlinks/junctions without requiring every target to exist.
// Not using raw string comparisons: links and relative segments can otherwise escape allowed directories.
function normalizeRealPath(targetPath) {
  const resolved = path.resolve(targetPath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

// Check whether a path resolves inside an allowed directory.
// Reason: Electron IPC can open local folders, so every caller needs the same containment rule.
// Not using startsWith: path.relative handles sibling-prefix paths like C:\foo and C:\foobar correctly.
function isInsideDirectory(targetPath, allowedDirectory) {
  const target = normalizeRealPath(targetPath);
  const allowed = normalizeRealPath(allowedDirectory);
  const relative = path.relative(allowed, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// Validate external navigation URLs and return the normalized URL when allowed.
// Reason: renderer-controlled URLs can reach shell.openExternal, which is an OS-level sink.
// Not allowing arbitrary https: trusted protocols alone do not prevent malicious download/navigation targets.
function validateExternalUrl(url, options = {}) {
  const protocols = options.protocols || EXTERNAL_PROTOCOLS;
  const domains = options.domains || EXTERNAL_DOMAINS;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }
  if (!protocols.includes(parsed.protocol)) {
    return { ok: false, reason: 'Disallowed protocol' };
  }
  if (parsed.protocol !== 'mailto:') {
    const hostname = parsed.hostname.toLowerCase();
    const allowed = domains.some(domain => hostname === domain || hostname.endsWith('.' + domain));
    if (!allowed) {
      return { ok: false, reason: 'Disallowed domain: ' + hostname };
    }
  }
  return { ok: true, url: parsed.toString() };
}

// Validate a renderer-requested folder path against a set of allowed roots.
// Reason: shell.openPath exposes local filesystem browsing and must not cross the app policy boundary.
// Not trusting the renderer's path text: realpath catches links that point outside allowed roots.
function validateOpenFolderPath(folderPath, allowedDirectories) {
  if (!folderPath || typeof folderPath !== 'string') {
    return { ok: false, reason: 'Invalid folder path' };
  }
  const resolved = normalizeRealPath(folderPath);
  const allowed = allowedDirectories.some(dir => isInsideDirectory(resolved, dir));
  if (!allowed) {
    return { ok: false, reason: 'Path outside allowed directories' };
  }
  return { ok: true, path: resolved };
}

module.exports = {
  EXTERNAL_DOMAINS,
  EXTERNAL_PROTOCOLS,
  isInsideDirectory,
  validateExternalUrl,
  validateOpenFolderPath,
};
