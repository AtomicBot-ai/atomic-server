---
date: 2026-10-24
title: 'Shade dialogs and keep short terminals usable'
---

# 2026-10-24 — Shade dialogs and keep short terminals usable

- **Context:** Modal screens used different backdrop treatments, sometimes erased the underlying workspace, and early-return renderers could bypass dimming. The requested 60×20 terminal preview only showed resize guidance. The user selected Beacon endpoint artwork and Rover agent artwork from the review gallery.
- **Decision:** Dim the completed terminal background once before modal dispatch, preserving its characters and geometry. Nested connection pickers use the same dimmer. Web dialogs, Help, and the anchored chat model picker share a gray backdrop; ordinary inline listboxes remain non-modal. Below 24 terminal rows, use a two-row status brand, a four-row download card, the existing scrollable rail, and a concise server status surface with the same real actions. Beacon and Rover use fixed-size ASCII frames with compact forms on short cards.
- **Consequences:** Escape and outside-click dismissal continue to use the existing handlers, and modal targets remain isolated. The short overview retains server, engine, model, and connection actions without squeezing full agent cards into the available space. Standard-height layouts and the approved intro artwork remain unchanged. The terminal minimum is 54×20; smaller sizes retain explicit resize guidance. Static screenshots show representative animation frames rather than proving timing or live inference.
- **Alternatives:** Erasing the workspace obscures context. Dimming text alone leaves bright surfaces unchanged. Scaling every card down at 60×20 would make controls overlap; the short status surface instead keeps the actual shared actions and model-list navigation.
- **Owner:** team.
- **Links:** `src/tui/workspace/draw/backdrop.ts`, `src/tui/workspace/compact-status.ts`, `src/tui/workspace/floating-downloads.ts`, `src/tui/workspace/server/connection-illustrations.ts`, `packages/admin-ui/src/workspace/chat/ChatModelPicker.tsx`.
