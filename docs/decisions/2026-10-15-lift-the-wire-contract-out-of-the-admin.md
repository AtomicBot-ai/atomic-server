---
date: 2026-10-15
title: "Lift the wire contract out of the admin"
---

# 2026-10-15 — Lift the wire contract out of the admin

- **Context:** `src/admin/contract/` began as the admin BFF's wire types, then became the workspace
  operation registry, navigation and setup goals that the daemon, CLI, MCP, terminal UI and web admin all
  use. Thirty-one imports reached it from outside `src/admin/`, `admin` and `workspace-service` imported
  each other, and `src/admin/index.ts` re-exported the whole contract.
- **Decision:** The contract is its own module, `src/contract/`, with the same browser-safe rule (types and
  constants only, no `node:*`, enforced by eslint and `scripts/check-runtime-agnostic.mjs`). `src/admin/`
  no longer re-exports it; the SPA's `@contract` alias points at the new folder.
- **Consequences:** The dependency direction is one way: every module, `admin` included, depends on
  `contract`, and `contract` on nothing but types. Imports changed in place; no behaviour changed.
- **Alternatives:** Keeping the folder and documenting it as shared — the name would keep telling readers
  and agents that only the admin owns it.
- **Owner:** `team`.
- **Links:** `src/contract/index.ts`, `eslint.config.js`, `packages/admin-ui/vite.config.ts`.
