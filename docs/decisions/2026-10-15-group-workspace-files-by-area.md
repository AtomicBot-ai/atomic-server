---
date: 2026-10-15
title: "Group workspace files by area"
---

# 2026-10-15 — Group workspace files by area

- **Context:** `src/tui/workspace/` held about seventy files and `packages/admin-ui/src/workspace/` sixty,
  each flat, sorted only by name prefixes (`setup-*`, `library-*`, `Chat*`).
- **Decision:** Each keeps its shell at the root (state, controller, frame, input and actions in the
  terminal; `WorkspaceApp`, `Cockpit`, `Controls`, `OperationForm`, the API and hooks in the browser) and
  one folder per area. Terminal: `draw/`, `chat/`, `setup/`, `library/`, `operations/`, `server/`.
  Browser: `chat/`, `media/`, `library/`, `server/`, `setup/`, `styles/`. File names did not change;
  imports were rewritten by resolving each one, not by text replacement.
- **Consequences:** An area's files and tests sit together. The folders are not modules: no `index.ts`,
  and they import each other directly. Pure helpers in the browser live in `*-data.ts` files next to their
  components (`setup/setup-data.ts`).
- **Alternatives:** Making each area a module with an `index.ts` — the areas call each other in both
  directions, and the barrels would hide no API worth hiding.
- **Owner:** `team`.
- **Links:** `src/tui/workspace/`, `packages/admin-ui/src/workspace/`.
