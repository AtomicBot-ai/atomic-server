---
date: 2026-10-09
title: "Order recent chats by message activity"
---

# 2026-10-09 — Order recent chats by message activity

- **Context:** opening a conversation triggers autosave. Updating its timestamp on every save moved it to the top of Recents even when no message changed.
- **Decision:** preserve the stored `updatedAt` when message content is unchanged. Advance it for new messages or streamed content. Compare against the persisted conversation inside its serialized mutation, so stale in-memory timestamps cannot undo the last message time.
- **Consequences:** opening, renaming, changing model metadata and saving on exit preserve order. Existing histories retain their recorded order until a message changes; older files contain no separate message timestamps to recover. No schema migration is required.
- **Alternatives:** changing only the click handler would leave autosave, rename and shutdown able to reorder chats.
- **Owner:** @plombeer31.
- **Links:** `src/terminal-data/history.ts`, `src/terminal-data/history.test.ts`.
