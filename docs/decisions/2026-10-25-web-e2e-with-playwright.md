---
date: 2026-10-25
title: "Test the web admin end to end with Playwright"
---

# 2026-10-25 — Test the web admin end to end with Playwright

- **Context:** The terminal UI had e2e on the built program (a real pseudo-terminal); the web admin had only
  jsdom component tests and a manual browser review (`docs/keyboard-mouse-e2e.md`). Bugs found while
  integrating PR #14 — LiteRT-LM missing from the new screens, a first run that skipped the waiting screen,
  a usage error answered with a 500, a connector program run without confirmation — lived where those layers
  do not reach: the built SPA against the built server.
- **Decision:** `playwright` 1.64.0 (exact) as a devDependency and a vitest project `e2e-web` under
  `test/e2e-web/`: headless Chromium signs in to the built program's admin through `atc admin open
  --no-open` and drives it with clicks and keys; `npm run test:e2e:web` runs it apart from the terminal
  journeys (`npm run test:e2e:tui`). Nothing reaches the network: the Hub and conf's lists point at a closed
  loopback port or a fixture file (`test/helpers/admin-browser.ts`).
- **Consequences:** `npm run verify` needs Chromium once per machine (`npx playwright install chromium`, about
  100 MB). CI runs it on ubuntu-latest and macos-14 after rebuilding the binary with the SPA inside; the
  admin is the same page on every OS. Nothing ships in the binary.
- **Alternatives:** HTTP-level checks of the admin API alone (no clicks, no rendering); a manual browser pass
  per change (not repeatable); `@playwright/test` as its own runner (a second test runner beside vitest).
- **Owner:** team.
- **Links:** `test/e2e-web/`, `test/helpers/admin-browser.ts`, `test/helpers/pty-driver.ts`, `.github/workflows/ci.yml`.
