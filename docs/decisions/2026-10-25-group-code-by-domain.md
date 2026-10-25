---
date: 2026-10-25
title: "Group code by domain in every layer"
---

# 2026-10-25 — Group code by domain in every layer

- **Context:** ADR 2026-10-15 grouped the terminal UI and the web admin by area. Since then
  `src/workspace-service/` had grown to 83 flat files (Foundry, LiteRT, managed engines, connectors, chat,
  catalogs and downloads side by side), `src/workspace-view/` to 27 and `src/commands/` to 37; the
  terminal UI's root held 48 files beside its areas, and the web admin's `server/` and `library/` about 50
  each. The eslint rule that kept modules apart matched folder names, so a folder inside a module named
  like another module (`downloads/`) would have failed every import of it.
- **Decision:** One set of domain names in every layer — `workspace-service/` (`snapshot`, `chat`,
  `features`, `connectors`, `models`, `engines`, `managed`, `foundry`, `litert`, `cloud`),
  `workspace-view/` (`downloads`, `engines`, `catalog`, `connectors`, `setup`, `games`), the terminal UI
  (`input`, `navigation`, `runtime`, `intro`, `downloads`, `games` beside its existing areas), the web
  admin (`server/{connection,connectors,features,settings}`, `library/{catalog,engines,downloads,install,cloud}`)
  and `commands/` by help group (`server`, `models`, `access`, `system`). As in 2026-10-15 these are
  folders, not modules: no `index.ts`, direct imports, file names unchanged; a module's shell stays at
  its root and `index.ts` remains its one public entry. `scripts/check-module-boundaries.mjs` replaces the
  eslint regex: it resolves each relative path, so it fails a path past another module's `index.ts` and a
  path that names no file (imports, `vi.mock`, `new URL(…, import.meta.url)` and its template prefix, CSS
  `@import`/`url()`, assets) — the references typecheck does not see.
- **Consequences:** An area's code and tests sit together and the same word finds a domain in the
  service, the selectors, the terminal and the browser. Every move was checked by the full test inventory
  (same tests by name), byte equality of each moved file apart from its paths, the public exports of every
  module, the built CSS and `atc --help`, and the full verify with both e2e suites. File names still carry
  their domain prefix (`foundry/foundry-catalog.ts`); dropping it is a separate rename. Boundary errors now
  appear at `npm run lint`, not in the editor.
- **Alternatives:** An `index.ts` per domain folder — the domains call each other in both directions and
  the barrels would hide nothing worth hiding (as 2026-10-15 found). New `src/` modules per domain —
  seven more public surfaces for calls that are the service's own business.
- **Owner:** `team`.
- **Links:** `scripts/check-module-boundaries.mjs`, `test/scripts/module-boundaries.test.ts`,
  `2026-10-15-group-workspace-files-by-area.md`.
