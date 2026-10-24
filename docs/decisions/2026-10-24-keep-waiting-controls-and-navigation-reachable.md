---
date: 2026-10-24
title: "Keep waiting controls and navigation reachable"
---

# 2026-10-24 — Keep waiting controls and navigation reachable

- **Context:** Shared download status now belongs beside the brand in the application header. Short terminals need room for that header, the waiting game, and normal navigation without overlapping controls.
- **Decision:** The waiting screen places its email input and Confirm action together, followed by Back and Continue in background. Confirmation is local mock state only: idle, invalid, confirming, confirmed. “Email saved” acknowledges the local value, without claiming a message will be delivered. A future PR must implement and configure the notification service before enabling email delivery.
- **Decision:** Terminal waiting screens scroll the game board with the focused cell while keeping email and exit controls visible. The main rail keeps two-line icon/text buttons, one-row gaps, and blank margins. When all six destinations do not fit, a scroll window follows focus; Up/Down and mouse-wheel input move focus without activating a destination. Enter and mouse click activate it.
- **Decision:** The Web game’s loss effect expands within the mine field only and is omitted when reduced motion is requested.
- **Supersedes:** The bottom-right download placement in `2026-10-23-gate-inference-and-keep-downloads-visible.md`. Shared header placement is used in both onboarding and the normal workspace, except the large welcome screen.
- **Validation:** Waiting email validation, pending/confirmed transitions, closing during confirmation, both explicit exits, mine-field loss/reset and reduced motion, plus keyboard/mouse access to every rail destination at 54×24, 80×24 and 90×32.
