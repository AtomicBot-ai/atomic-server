---
date: 2026-11-17
title: "Use the workspace UI for web onboarding"
---

# 2026-11-17 — Use the workspace UI for web onboarding

- **Context:** The intro and wizard came from separate desktop previews. They used their own colors, competing scroll regions and a second provider editor. The optional browser notification step added confirmation dialogs to both choices.
- **Decision:** Build the wizard on the workspace theme, header, settings fields and action buttons. Share directory rows with the engine catalog and open credentials in the Catalog's provider dialog. Give each step one scrolling body and a fixed footer. A dedicated Continue action advances optional steps. The explicit notification action calls the browser directly and shows its result inline.
- **Consequences:** Desktop shows the current step in a rail. Narrow windows reserve the width for the active step. Provider credentials are entered only after selecting a provider. The download reminder, download controls, model compatibility, and server and agent handoffs keep their existing operations.
- **Alternatives:** Restyling the inline provider editor would preserve a second focus and credential flow with a toolbar inside a scrolling grid. Reusing the Catalog dialog makes cancellation and error handling the same in both places.
- **Owner:** team.
