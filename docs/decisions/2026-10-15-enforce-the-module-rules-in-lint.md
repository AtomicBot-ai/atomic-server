---
date: 2026-10-15
title: "Enforce the module rules in lint"
---

# 2026-10-15 — Enforce the module rules in lint

- **Context:** AGENTS.md set rules the tooling did not check. The eslint pattern meant to forbid
  `../<module>/<file>` imports never matched one; three files passed 300 lines; the repository map missed
  eight of twenty-two modules and named files that no longer existed; `npm run verify` skipped the SPA's
  tests, which CI runs, so six of them had failed unnoticed. The only named gate builds binaries and runs
  e2e, which is slow for an edit loop.
- **Decision:** eslint forbids a deep import into any folder of `src/` (a regex built from that folder
  list) and `max-lines` at 300 in both packages, except the verbatim lifted core runtime. The module table
  in AGENTS.md is generated from the doc comment that opens each `index.ts` (`npm run docs:modules`); lint
  fails when it is stale or a module has no comment. `npm run verify` runs the SPA's tests;
  `npm run verify:fast` (and `make fast`) runs lint, typecheck and the tests touched by uncommitted
  changes. The SPA's test setup gives jsdom's storage precedence over Node 25+'s own `localStorage`.
- **Consequences:** A new module must say what it is before lint passes; the map cannot drift. Folders
  inside a module import each other freely.
- **Alternatives:** dependency-cruiser or similar — one more dependency for what eslint already does.
- **Owner:** `team`.
- **Links:** `eslint.config.js`, `scripts/gen-module-map.mjs`, `package.json`.
