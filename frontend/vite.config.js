import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')
)
const appVersion = rootPkg.version ?? 'unknown'
const backendUrl = process.env.PAPYRUS_BACKEND_URL ?? 'http://127.0.0.1:8000'

function readDevAuthToken() {
  if (process.env.PAPYRUS_AUTH_TOKEN) {
    return process.env.PAPYRUS_AUTH_TOKEN
  }
  const dataDir = process.env.PAPYRUS_DATA_DIR
    ? resolve(process.env.PAPYRUS_DATA_DIR)
    : join(os.homedir(), 'PapyrusData')
  const tokenFile = join(dataDir, '.api_token')
  try {
    if (existsSync(tokenFile)) {
      const token = readFileSync(tokenFile, 'utf8').trim()
      return token.length >= 32 ? token : null
    }
  } catch {
    // ignore token read errors in dev proxy
  }
  return null
}

// Vite injects the React Fast Refresh preamble as an inline module in development.
// Keep the checked-in/production CSP strict, and relax script-src only for the dev server response.
const developmentCspPlugin = {
  name: 'papyrus-development-csp',
  apply: 'serve',
  transformIndexHtml(html) {
    return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
  },
}

// TS + React 19 + Arco scaffold
export default defineConfig({
  base: './', // Required for Electron to load files locally
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    developmentCspPlugin,
    react({
      // keep classic runtime if you still want `import React from 'react'`
      // jsxRuntime: 'classic',
    }),
  ],
 server: {
   port: 5173,
   strictPort: true,
   proxy: {
     '/api': {
       target: backendUrl,
       changeOrigin: true,
       configure: (proxy) => {
         proxy.on('proxyReq', (proxyReq) => {
           const token = readDevAuthToken()
           if (token) {
             proxyReq.setHeader('x-papyrus-token', token)
           }
         })
       },
     },
   },
 },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // 把大的第三方库拆分成单独的 chunk，便于缓存
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react')) {
              return 'react-vendor';
            }
            if (id.includes('@arco-design')) {
              return 'arco-vendor';
            }
            return 'vendor';
          }
        }
      }
    },
    // 生产构建时不生成 source map，加快构建
    sourcemap: false,
  },
})
