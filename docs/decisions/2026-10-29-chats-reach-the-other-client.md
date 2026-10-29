---
date: 2026-10-29
title: "Saved chats reach the other client within one poll, and its unsaved reply wins"
---

# 2026-10-29 — Saved chats reach the other client within one poll, and its unsaved reply wins

- **Context:** The 0.2.7 end-to-end retest, B06 (Medium): a turn sent in the Web did not appear in the
  terminal with the same conversation open, and a new conversation did not appear in the other client
  until a reload. Both clients write the same history: the terminal into the data folder's `chats`
  directly, the Web through the server's `history.*` operations. Neither read it again: the Web on mount
  and after its own turns, the terminal after its own saves.
- **Decision:** Both clients read the saved history again on the clock their shared panels already use
  (2.5 s): the Web with `watchSharedRead` on `history.list` and on `history.load` of the open chat, the
  terminal in `useSharedPanels` while the Playground or History is open. Whether a saved copy is another
  client's change is one rule, `savedConversationChange` (workspace view). Each client remembers a print
  (title and messages) of what it last saved or loaded. A saved copy that differs is taken unless the
  chat on screen differs from that print too, because then this client has a change it has not saved yet
  (a reply that just finished). A copy gone after one was saved is a deletion: the chat empties and the
  draft stays. Neither the draft, cursor, focus nor scroll changes. `ChatHistory.list` keeps each file's
  summary by its modification stamp, so a list reads only the files that changed. A request the server
  runs (`chat.start`, the Web's turns and the terminal's local ones) is listed in the workspace snapshot
  (`chats`: job id and conversation); a client showing that conversation follows its reply with
  `chat.progress` and takes the saved reply when it ends. A page following another client's turn can
  still open other chats; only its own turn holds it. A terminal turn to a remote endpoint is not a
  server job: the terminal saves its partial reply every 750 ms, which the Web takes as above.
- **Consequences:** A turn, a rename, a new chat or a deletion in one client shows in the other within
  about 2.5 s; a reply being generated starts streaming in the other client within one snapshot and
  then follows at the job's pace. Stop in a client that follows another's turn stops that turn for both:
  the request belongs to the server, not to the client that started it. Two clients editing the same chat at once still end up
  with the copy saved last. On a file system with coarse timestamps, two writes of the same size within
  one tick look unchanged to the list until the next write.
- **Alternatives:** A history revision in the workspace snapshot: the terminal writes files without the
  server, so the server would have to watch the folder for it anyway. Comparing `updatedAt`: the Web sets
  it from the browser's clock and the server keeps the old value when only the title changes. A file
  watcher: platform differences, and the Web would still need a channel to hear it.
- **Owner:** `team`.
- **Links:** `src/workspace-view/chat/saved-conversation.ts`, `src/tui/workspace/chat/live-conversation.ts`,
  `src/tui/workspace/runtime/shared-conversations.ts`, `packages/admin-ui/src/workspace/chat/useChatSession.ts`,
  `src/terminal-data/history.ts`.
