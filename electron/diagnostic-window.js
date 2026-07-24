/**
 * Diagnostic window for debugging startup issues
 * Shows paths, logs, and error information
 */

const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let diagnosticWindow = null;

function createDiagnosticWindow(logs, paths, error) {
  if (diagnosticWindow) {
    diagnosticWindow.focus();
    return diagnosticWindow;
  }

  // Generate path table rows
  const pathRows = Object.entries(paths).map(([key, value]) => {
    const exists = fs.existsSync(value);
    const existsClass = exists ? 'exists-yes' : 'exists-no';
    const existsText = exists ? '✓ EXISTS' : '✗ NOT FOUND';
    return `
      <tr>
        <td>${escapeHtml(key)}</td>
        <td>
          <span class="path">${escapeHtml(value)}</span><br>
          <span class="${existsClass}">${existsText}</span>
        </td>
      </tr>
    `;
  }).join('');

  // Generate log entries
  const logEntries = logs.map(log => {
    const levelClass = log.level === 'error' ? 'log-error' : 'log-info';
    return `<div class="log-entry ${levelClass}">[${escapeHtml(log.timestamp)}] ${escapeHtml(log.message)}</div>`;
  }).join('');

  diagnosticWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Papyrus Desktop Diagnostic',
    webPreferences: {
      // SECURITY: disable nodeIntegration and enable contextIsolation
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'diagnostic-preload.js'),
    },
  });

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Papyrus Desktop Diagnostic</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 20px;
      background: #1a1a1a;
      color: #e0e0e0;
      line-height: 1.6;
    }
    h1 { color: #4fc3f7; margin-top: 0; }
    h2 { color: #81c784; border-bottom: 1px solid #333; padding-bottom: 8px; }
    .section { margin-bottom: 24px; }
    .path { 
      font-family: monospace; 
      background: #2d2d2d; 
      padding: 4px 8px; 
      border-radius: 4px;
      word-break: break-all;
    }
    .exists-yes { color: #81c784; }
    .exists-no { color: #e57373; }
    .log-entry { 
      font-family: monospace; 
      font-size: 12px;
      padding: 2px 0;
      border-bottom: 1px solid #333;
    }
    .log-info { color: #4fc3f7; }
    .log-error { color: #e57373; }
    pre {
      background: #2d2d2d;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    td {
      padding: 8px;
      border-bottom: 1px solid #333;
    }
    td:first-child {
      width: 200px;
      color: #aaa;
    }
  </style>
</head>
<body>
  <h1>🔍 Papyrus Desktop Diagnostic</h1>
  
  <div class="section">
    <h2>Path Information</h2>
    <table>
      ${pathRows}
    </table>
  </div>

  <div class="section">
    <h2>Backend Directory Contents</h2>
    <pre id="dirContents">Loading...</pre>
  </div>

  <div class="section">
    <h2>Startup Logs</h2>
    <div id="logs">
      ${logEntries}
    </div>
  </div>

  ${error ? `
  <div class="section">
    <h2>Error Details</h2>
    <pre style="color: #e57373;">${escapeHtml(error.message)}\n\n${escapeHtml(error.stack || '')}</pre>
  </div>
  ` : ''}

  <script>
    const backendDir = ${JSON.stringify(paths.backendCwd)};

    if (backendDir && window.diagnosticAPI) {
      try {
        document.getElementById('dirContents').textContent = window.diagnosticAPI.listDir(backendDir);
      } catch (e) {
        document.getElementById('dirContents').textContent = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>
  `;

  diagnosticWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

  diagnosticWindow.on('closed', () => {
    diagnosticWindow = null;
  });

  return diagnosticWindow;
}

function escapeHtml(text) {
  if (typeof text !== 'string') return String(text);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { createDiagnosticWindow };
