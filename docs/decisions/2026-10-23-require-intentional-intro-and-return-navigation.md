---
date: 2026-10-23
title: "Require intentional intro input and restore navigation origins"
---

# 2026-10-23 — Require intentional intro input and restore navigation origins

- **Context:** A fresh profile could bypass the intro when an engine was already available. Terminal cursor/focus reports could count as a key press. Escape from an existing-server connection traversed setup steps, and Escape from terminal Settings opened the section picker.
- **Decision:** A fresh profile first displays the intro with Choose engine and waits for deliberate input before opening the engine picker. Choosing an engine starts installation; completion returns to the intro with Press any key before model selection. An available engine with unfinished onboarding starts at that ready intro. Each intro action advances once after a deliberate key press or a click on its button. Terminal reports, pasted batches, modifier-only events, and key repeat/release events cannot advance it. Completed shared setup and model setup already in progress retain their resume behavior.
- **Decision:** Both clients retain the page and section that opened Settings or a connection guide. Escape closes inner controls first, then closes an existing-server guide or returns from Settings to that origin. Explicit Back controls still navigate guide steps; onboarding keeps its own step history. Preparation cannot be dismissed while its operations are running.
- **Decision:** Escape from the terminal engine picker returns to the initial hero. It never means setup completion. Set up later remains an explicit mouse action or S shortcut. Reopening the picker clears stale selectable cards until the refreshed catalog is ready.
- **Consequences:** Web and TUI preserve shared server state while keeping local navigation predictable. The fresh launcher still creates a new profile; it does not simulate input or reset an existing profile.
- **Alternatives:** An arbitrary delay before accepting input would hide input leakage without distinguishing terminal responses. Always reopening a section list or restarting onboarding would discard the caller's context.
- **Owner:** team.
- **Links:** `packages/admin-ui/src/workspace/useWorkspaceNavigation.ts`, `packages/admin-ui/src/workspace/server/useConnectionEscape.ts`, `src/tui/workspace/navigation-return.ts`, `src/tui/workspace/intro-lifecycle.test.tsx`.
