---
date: 2026-11-04
title: "Keep terminal regression checks aligned with the compact layout"
---

# 2026-11-04 — Keep terminal regression checks aligned with the compact layout

- **Context:** Thirty unit/contract failures still expected the terminal layout before `2026-11-04-compact-terminal-workspace-and-chat-recovery.md`: boxed actions, permanent sidebars, the old Alt map and inline download controls on short screens. Real Ink journeys also selected `Skip setup` by a substring intended for `Skip`, or typed a path before the attachment editor opened.
- **Decision:** Test the intended responsive layout and its user actions: one-row buttons, compact download-list access with keyboard-reachable pause/remove controls, sidebar scrolling where the sidebar exists, Alt+3 for Models, and explicit conversation recovery. Wait for the attachment editor and select the intended onboarding action unambiguously. Preserve assertions for hit targets, viewport bounds, focus, download continuation, history integrity and error-reporting behavior.
- **Consequences:** The tests retain their behavioral coverage without reverting the compact layout. Correct three remaining adaptations in the UI itself: fit the waiting status inside the server sidebar, right-align the compact connection action, and align the reminder action with its email field. No inference or download policy changes.
- **Browser coverage:** The engine-only onboarding e2e fixture now saves the selected engine explicitly before asserting that its paused download blocks the API. The existing policy only blocks standalone engine downloads belonging to the selection (`2026-11-04-settle-terminal-cancellation-and-scope-api-downloads.md`); an unselected engine record was not a valid fixture for that assertion.
- **Test lifecycle:** The browser composer regression still asserts that acceptance clears the draft before generation ends, then completes its mocked turn and waits for Send to return. Leaving that mock forever generating let its polling promise update React after jsdom teardown and produced an unhandled `window is not defined` rejection during the full UI suite.
- **Alternatives:** Restore the old layout or remove the failing checks. Both would lose the intended behavior or its protection; changing only expected screenshots would miss the input races and clipped controls.
- **Owner:** team.
- **Links:** [PR #77](https://github.com/AtomicBot-ai/atomic-server/pull/77), `2026-11-04-compact-terminal-workspace-and-chat-recovery.md`, `src/tui/workspace/polished-flows.test.ts`, `test/contract/terminal-model-selection.test.ts`, `test/contract/terminal-onboarding.test.ts`.
