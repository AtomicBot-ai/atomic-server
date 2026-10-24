---
date: 2026-10-23
title: "Apply prototype annotations to both real frontends"
---

# Apply prototype annotations to both real frontends

- **Owner:** team
- **Status:** accepted

The screenshot review identified extra onboarding choices, inconsistent navigation and missing desktop workspace features. Changes belong to the real clients first; capture fixtures only supply review data.

Both frontends now begin with supported inference-engine selection. Selecting an engine starts its real installation; readiness unlocks the intro continuation and model selection. Web `engines.select` validates the installed core build and persists the same `EngineSelection` document used by TUI. Model downloads continue in the background. The everyday-chat purpose step is removed; the two server destinations remain. Terminal permission actions open the Web permission flow and never claim terminal access grants.

Navigation uses Server, Playground and Models above Help, Web and Settings. A single sidebar group contains power, engine, model and connections; visual transition states follow actual pending operations and respect reduced motion. Help uses the desktop support URLs and a mailto link, with no automatic messages.

Conversation layout follows the desktop message bubbles, icon actions and composer. Shared assistant/skill selections and explicitly approved MCP calls use server operations; secrets are not put into the inference request. The existing keyboard shortcuts remain available after removing duplicate focus-description copy.

Validation covers responsive terminal hit targets, support destinations and dismissal, shared engine preference and onboarding progression, plus browser keyboard/mouse journeys. Source-mapped screenshot IDs remain stable through aliases when steps are removed. Screenshot coverage is reported separately from real backend/inference evidence.

**Alternatives:** Screenshot-only edits would leave the application inconsistent; separate client state would make onboarding and server controls diverge. Both were rejected.

**Links:** `packages/admin-ui/LIFTED.md`, `docs/decisions/2026-10-23-shared-workspace-features.md`, and the source-mapped prototype capture inventories.
