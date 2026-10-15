---
date: 2026-10-15
title: "Retire the pre-workspace screens"
---

# 2026-10-15 — Retire the pre-workspace screens

- **Context:** The shared workspaces (2026-10-13) replaced the terminal UI's tab screens and the web
  admin's routed pages, but both stayed in the tree. `src/tui/app.tsx` with `screens/`, `components/`,
  `theme.ts` and the key table `keys.ts` were imported only by their own tests. In the SPA, `AdminShell`
  rendered the workspace without an `<Outlet/>`, so no TanStack route below the root ever rendered;
  `routes/*`, `containers/setup/*` and their components were dead. Searches found two or three
  implementations of the same screen.
- **Decision:** Delete the unreachable code: about 1,800 lines in the terminal UI and 1,400 in the SPA (tests and the generated route tree included). The
  SPA renders `containers/AdminRoot.tsx` (sign-in, then the workspace) without a router;
  `@tanstack/react-router` and its Vite plugin are gone. `TuiCommand` moved into `src/tui/controller.ts`.
  `atc tui --screen` keeps its values; they map onto workspace pages as before.
- **Consequences:** One implementation per screen. The SPA has no URL routes: deep links would need
  workspace state in the URL, not file routes. The terminal's server reducer (`src/tui/state.ts`) stays:
  the workspace uses it for logs and checks.
- **Alternatives:** Keeping the router for future deep links — it rendered nothing and the workspace
  navigates by state in both clients.
- **Owner:** `team`.
- **Links:** `packages/admin-ui/src/containers/AdminRoot.tsx`, `src/tui/run-tui.tsx`,
  `2026-10-13-shared-server-workspaces.md`.
