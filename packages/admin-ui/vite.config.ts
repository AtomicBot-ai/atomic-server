import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = path.resolve(__dirname)
const repoRoot = path.resolve(__dirname, '../..')
/** The BFF's wire contract, shared with the daemon: types plus the route constants, nothing from Node. */
const contract = path.resolve(repoRoot, 'src/contract')

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
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
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
})
