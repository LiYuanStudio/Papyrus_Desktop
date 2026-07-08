import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import os from 'os'

const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')
)
const appVersion = rootPkg.version ?? 'unknown'

function readDevAuthToken(): string | null {
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

// TS + React 19 + Arco scaffold
export default defineConfig({
  base: './', // Required for Electron to load files locally
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
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
       target: 'http://127.0.0.1:8000',
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
