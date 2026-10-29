import { defineConfig } from 'vitest/config'

// Six test layers, see AGENTS.md and docs/testing.md. Unit tests live next to the code; the rest under test/.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}', 'test/scripts/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['test/setup.ts'],
          // The first PowerShell identity probe on a cold Windows CI runner alone takes ~5 s.
          testTimeout: process.platform === 'win32' ? 20_000 : 5_000,
        },
      },
      {
        test: {
          name: 'contract',
          include: ['test/contract/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['test/setup.ts'],
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['test/setup.ts'],
          testTimeout: 120_000,
          // Cleanup can await two bounded CLI commands on a cold Windows runner.
          hookTimeout: 120_000,
        },
      },
      {
        test: {
          // The web admin of the built program in headless Chromium (Playwright); `npm run test:e2e:web`.
          name: 'e2e-web',
          include: ['test/e2e-web/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['test/setup.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
      {
        test: {
          // The installers against a release served from loopback; POSIX for install.sh, Windows for install.ps1.
          name: 'installers',
          include: ['test/installers/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'runtime-compat',
          include: ['test/runtime-compat/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/index.ts',
        'src/contract/**',
        'src/bin.ts',
        'src/**/*.generated.ts',
      ],
      reporter: ['text', 'json-summary', 'html', 'lcov'],
    },
  },
})
