---
date: 2026-11-18
title: "Use the active Web theme for the chat composer"
---

# 2026-11-18 — Use the active Web theme for the chat composer

- **Context:** The Web composer used fixed mint surfaces in both themes. The default textarea focus outline extended into the toolbar.
- **Decision:** Use the workspace's themed surface, text and action colors. Draw the textarea focus indicator on the composer perimeter and keep each toolbar button's own focus indicator.
- **Consequences:** The Web composer follows theme changes alongside the rest of the workspace. Terminal colors keep their existing values.
- **Alternatives:** Adding separate composer colors for each browser theme would duplicate the existing workspace palette. Keeping the inner outline would require extra spacing between the field and the toolbar.
- **Owner:** team.
- **Links:** `packages/admin-ui/src/workspace/chat/chat-composition.css`, [Share semantic colors between Web and the terminal](2026-10-24-share-interface-colors.md).
