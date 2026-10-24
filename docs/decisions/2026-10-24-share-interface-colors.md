---
date: 2026-10-24
title: "Share semantic colors between Web and the terminal"
---

# 2026-10-24 — Share semantic colors between Web and the terminal

- **Context:** Web and the terminal present the same server state, but separate palettes gave matching controls different visual meanings.
- **Decision:** Keep the terminal's existing semantic color values in the browser-safe contract. The terminal consumes them directly; Web exposes them as CSS custom properties and uses them for navigation, actions, the composer and download status. Preserve Web typography and desktop-inspired composition.
- **Playground layout:** Follow the installed Atomic Chat desktop's Workspace sidebar, collapsible Recents, centered empty conversation, composer controls, and top-right parameters. Keep the existing server and download header above the page. Search and conversation actions stay in focused dialogs; omit desktop actions without a working server equivalent.
- **Consequences:** A shared color change reaches both clients. Terminal fallback rendering still chooses readable ANSI colors when true color is unavailable.
- **Alternatives:** Duplicating CSS literals would continue the drift. Sharing terminal rendering code with Web would introduce an unnecessary runtime dependency.
- **Owner:** team.
- **Links:** `src/contract/workspace-colors.ts`, `packages/admin-ui/src/workspace/workspace-theme.ts`.
