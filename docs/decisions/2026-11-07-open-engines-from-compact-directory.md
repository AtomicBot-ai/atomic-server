---
date: 2026-11-07
title: "Open engines from a compact directory"
---

# 2026-11-07 — Open engines from a compact directory

- **Context:** The web engine directory repeated a large Engine settings button on every row and a global Refresh button despite automatic reads. Installed and uninstalled engines were mixed in a long list.
- **Decision:** Group installed builds and ready managed installations before available engines. Each compact row is a keyboard-accessible button with a name, build details, shared engine status and chevron. Open the existing engine dialog as a right-side drawer from the directory, full-width on narrow screens. Keep the automatic read lifecycle; offer Retry only beside a read error.
- **Consequences:** Installation, update, removal, unsaved-setting confirmation and focus trapping keep their existing behavior. Returning focus locates the engine's current row even if installation moved it between groups. Other entry points retain the centered dialog. No extra polling or core installation policy is introduced.
- **Alternatives:** Repeated icon-only settings buttons would retain detached hit targets and obscure their purpose. Installing directly from an uninstalled row would bypass the existing preparation and consent flow.
- **Owner:** team.
- **Links:** `packages/admin-ui/src/workspace/library/engines/EnginesTab.tsx`, `packages/admin-ui/src/workspace/library/catalog/Catalog.tsx`.
