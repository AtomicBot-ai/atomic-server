---
date: 2026-10-28
title: "The web admin says what a thing is, and its rail is the menu"
---

# 2026-10-28 — The web admin says what a thing is, and its rail is the menu

- **Context:** the fourth batch of reports, all on the web admin: "Local models" opened the catalog;
  "Cloud providers" listed llama.cpp and sd.cpp servers; "HTTPS proxy" configured the download proxy;
  "Start server" started the API (the server was already running); "Web" opened the admin in itself;
  Alt+1…4 followed the contract's page order, not the rail's; the rail offered "Containers" settings
  and the onboarding asked for the microphone on a server with no managed engines and no voice input;
  Hardware listed no GPU on Apple silicon; the Downloads badge counted finished transfers; "Start
  automatically" and "Startup models" were read by nothing before 0.2.2. Two reports (a modal opening
  by itself, two active menu items) did not reproduce.
- **Decision:** names follow `docs/concepts.md`: the API is started and stopped as "API" in both UIs
  (the server is the process behind it); the Hub section is "Catalog", providers are "Remote
  providers", the proxy is "Download proxy". `WORKSPACE_NAVIGATION` lists pages in the rails' order,
  so Alt+N is the Nth item of the menu in the web and the terminal alike. The web rail has no "Web"
  item. The Containers group appears only where `engines.list` names a managed engine. The onboarding
  asks for notifications only. Hardware shows Apple silicon's GPU and unified memory where the core
  lists no GPU. The Downloads badge counts what the Downloads page still shows.
- **Consequences:** tests and e2e flows that named "Start server" or "Local models" now say "Start
  API" and "Catalog"; the General settings page asks `engines.list` once on mount.
- **Alternatives:** keeping "Start server" and renaming the process (the process is what `atc start`
  starts; the word is taken); a bottom tab bar for phones (out of this batch).
- **Owner:** `team`.
- **Links:** `src/contract/workspace-navigation.ts`, `packages/admin-ui/src/workspace/WorkspaceNavigation.tsx`,
  `packages/admin-ui/src/workspace/server/ServerControlPanel.tsx`,
  `packages/admin-ui/src/workspace/server/settings/GeneralSettings.tsx`,
  `packages/admin-ui/src/workspace/server/settings/HardwareSettings.tsx`,
  `packages/admin-ui/src/workspace/setup/Permissions.tsx`.
