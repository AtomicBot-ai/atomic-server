---
date: 2026-11-04
title: "Settle terminal cancellation and scope API download waits"
---

# 2026-11-04 — Settle terminal cancellation and scope API download waits

- **Context:** Stopping a local TUI answer cleared `generating` before the server finished saving it. Autosave then used a stale revision; on the first turn the terminal saved a second conversation under its temporary ID. Separately, the API download gate treated any standalone engine transfer, including audio.cpp, as a prerequisite for the selected text connection. The Ctrl+K reference also named Keyboard shortcuts although the key opens Help.
- **Decision:** Keep the terminal turn active while cancellation settles, send cancellation once, and poll through `stopping`. Adopt the server's saved conversation (ID, revision, messages and interruption state) before permitting another send or autosave. Navigation can abandon the display of a turn without adopting its late result. The server creates local streamed histories with an implicit endpoint so a later API port change does not turn them into remote chats. A remote endpoint still leaves persistence to the terminal. Label Ctrl+K as Help. Standalone engine downloads block API controls only when their engine matches the saved selection; retain the first text-model/preparation gate and the exemption for any ready service.
- **Consequences:** Cancellation may briefly display Stopping response while persistence finishes. A cancellation error is reported rather than declared successful. The next turn uses the authoritative revision, and cancelling a first turn does not duplicate history. Unrelated media engines cannot block Start/Restart or suspend an empty text API. With no engine selection, a standalone engine transfer alone does not block the API; text-model jobs and preparation still do.
- **Alternatives:** Ignoring revisions would hide conflicting writes. Clearing the UI immediately would re-enable autosave before ownership returns. Disabling all download guards would discard the existing first-model onboarding behavior. Hard-coding media engine IDs would duplicate the core's registry.
- **Validation:** Targeted terminal turn tests cover new/existing chats, delayed persistence, immediate follow-up, navigation and remote interruption. Shared-chat tests cover early cancellation and cancellation failure. API policy, server guard, TUI and Web tests cover unrelated audio downloads; the shortcut test compares reference, handler and footer.
- **Owner:** team.
- **Links:** `src/tui/workspace/chat/turn-actions.ts`, `src/tui/workspace/chat/shared-chat.ts`, `src/workspace-view/setup/api-download-wait.ts`; refines `2026-11-02-wait-before-server-handoff.md`.
