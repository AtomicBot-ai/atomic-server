---
date: 2026-10-09
title: "License atc under Apache-2.0 with generated notices"
---

# 2026-10-09 — License atc under Apache-2.0 with generated notices

- **Context:** `package.json` said MIT, but the repository had no license file at all, the web admin
  includes files copied from Atomic Chat (Apache-2.0, which requires its license and attribution to
  travel with the copies), and the binary bundles 82 third-party packages whose notices were nowhere.
- **Decision:** The repository is Apache-2.0 (owner's call): `LICENSE` is the canonical text, `NOTICE`
  attributes Atomic Chat and Menlo Research for the files in `packages/admin-ui/LIFTED.md`, and both
  `package.json` files say `Apache-2.0`. `scripts/gen-third-party-notices.mjs` walks what is compiled into
  the binary — the root runtime dependencies, `react-devtools-core` (resolved into it by the bundler),
  the admin SPA's dependencies — and writes `THIRD_PARTY_NOTICES.md` with every license text; it fails on
  a license outside `scripts/licenses.mjs`. CI and `npm run verify` run it with `--check`.
- **Consequences:** A dependency with a copyleft or unknown license fails the build until it is decided.
  `@atomic-chat/core` (MIT) ships no license file in its package; the notice names its license from
  `package.json`. The release must attach `LICENSE`, `NOTICE` and `THIRD_PARTY_NOTICES.md`. The copyright
  holder is written as "Atomic Chat (https://atomic.chat)", as in the Atomic Chat repository — confirm the
  legal entity before the first public release.
- **Alternatives:** MIT for our own code, Apache-2.0 for the lifted files: two licenses in one tree for
  no gain. A license checker dependency: a new dependency for a hundred lines of policy.
- **Owner:** `team`.
- **Links:** `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `scripts/gen-third-party-notices.mjs`,
  `scripts/licenses.mjs`, `test/scripts/licenses.test.ts`.
