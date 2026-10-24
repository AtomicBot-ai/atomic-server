---
date: 2026-10-24
title: "Show engine update results before offering installation"
---

# 2026-10-24 — Show engine update results before offering installation

- **Context:** Engine dialogs offered Install latest build regardless of the current build. Refreshing gave little feedback, and unchanged forms displayed Save changes.
- **Decision:** Both clients show Checking, an available update, an up-to-date result, or a retryable failure. The shared selector reads the public core update offer; it never compares version strings. For installed build engines, the update-check action becomes Install latest build only after a successful check offers an update. Fresh installation and managed-engine approval remain separate operations.
- **Consequences:** Cached-source failures cannot claim the engine is current. Checking locks repeated requests; errors retain a recheck action. Save appears only for actual changed values, including structural equality for settings arrays and objects. Footer actions share their platform's button height. Settings and update actions stay in the same popup.
- **Alternatives:** Always offering installation was rejected because it disguises an update check as an installation action and gives no trustworthy result.
- **Owner:** team.
- **Links:** `src/workspace-view/engine-updates.ts`, `packages/admin-ui/src/workspace/library/EngineBuilds.tsx`, `src/tui/workspace/library/engine-builds.ts`.
