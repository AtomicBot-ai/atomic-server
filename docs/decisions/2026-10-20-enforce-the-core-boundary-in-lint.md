---
date: 2026-10-20
title: "Enforce the core boundary in lint"
---

# 2026-10-20 — Enforce the core boundary in lint

- **Context:** AGENTS.md §8 says "never copy core logic — request an export", and nothing checked it.
  On Windows CI (PR #12), `Get-Acl` failed when atc was started from pwsh: the core's `readWindowsAcl`
  passed on PowerShell 7's `PSModulePath`. atc fixed it in its own `src/host/acl.ts`, so its own call
  worked while the core's host-step executor kept failing. Core 0.18.5 fixed it there, and nothing would
  have said that atc's copy could go.
- **Decision:** three checks in `npm run lint`. eslint refuses an import of `@atomic-chat/core/<path>`
  outside the package's `exports`, read from the installed core. `scripts/check-core-boundary.mjs`
  refuses a string in `src/` (tests aside) that names a mechanism the core owns (`Get-Acl`,
  `PSModulePath`, the hardware tools, the core's lock, journal and token files, `version_backend`,
  `model.yml`) unless the file carries `// core-boundary: <name> — <reason>`, and a reason that no longer
  matches a string fails too. It fails on `// core-workaround: <name> until core X.Y.Z — <reason>` once
  `package.json` pins that core or a later one, and on a core pin that is not one exact version. Only
  strings and comments are read, through the TypeScript parser, so a comment may always explain what the
  core does.
- **Consequences:** Three reasons were written on the day: `version_backend` twice, both refusing it as
  a setting, and `model.yml` once, to tell whose registration it is. A new core-owned mechanism needs its
  name in `CORE_OWNED`. The check reads strings, so code that builds the name from pieces passes. It is
  a tripwire, not a proof.
- **Alternatives:** a review rule only (what §8 already was); a deny list of files (misses new ones);
  dependency-cruiser (one more dependency for what eslint and the TypeScript parser already do).
- **Owner:** `team`.
- **Links:** `scripts/check-core-boundary.mjs`, `test/scripts/core-boundary.test.ts`, `eslint.config.js`,
  AGENTS.md §8, atomic-chat-core#45 (core 0.18.5), [Take the last core gaps from the
  core](2026-10-20-take-the-last-core-gaps-from-the-core.md).
