import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = path.resolve(__dirname)
const repoRoot = path.resolve(__dirname, '../..')
/** The BFF's wire contract, shared with the daemon: types plus the route constants, nothing from Node. */
const contract = path.resolve(repoRoot, 'src/admin/contract')

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      // Co-located tests (`index.test.tsx`) are not routes.
      routeFileIgnorePattern: '\\.test\\.tsx?$',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(root, './src'),
      '@contract': path.resolve(contract, 'index.ts'),
    },
  },
  server: {
    port: 1339,
    fs: {
      // `@contract` lives outside the package root.
      allow: [root, contract, path.resolve(repoRoot, 'src/workspace-view')],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:1338',
        changeOrigin: true,
        // `/api` without a slash is the SPA's own "API Server" page; only `/api/...` is the BFF.
        bypass: (req) => ((req.url ?? '').split('?')[0] === '/api' ? '/index.html' : undefined),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
})
