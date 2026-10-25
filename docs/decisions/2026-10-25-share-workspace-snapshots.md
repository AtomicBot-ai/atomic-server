---
date: 2026-10-25
title: "Share workspace snapshots between clients for a second"
---

# 2026-10-25 — Share workspace snapshots between clients for a second

- **Context:** `WorkspaceService.snapshot()` costs seven core requests, three file reads and five folder
  scans. The web admin polls it every 2.5 s and again after each change, the terminal UI every 2.5 s and
  after most actions, `atc control watch` every second, the terminal setup every 800 ms; each client and
  each tab pays the full price, and nothing shared a read already running.
- **Decision:** `SnapshotCache` holds the part that costs core requests (`workspaceSnapshot`) for up to
  one second and gives every caller who asks meanwhile that read (a copy each); what the server keeps
  itself (engine jobs, its own transfers, load stages, setup records, features) is read for every answer. A core event and every operation that mutates (the registry's
  `mutates`, success or failure) invalidate it, so a client sees its own change at once. What decides an
  operation — readiness before `api.start` and `chat.start`, `setup.complete`, `downloads.remove` — reads
  with `snapshot({ fresh: true })`, never a shared copy.
- **Consequences:** Clients polling together cost the core one read per second at most. Everything in
  the shared part is announced by a core event or written by an operation, so it invalidates; only a file
  another process writes (a key created by `atc keys` outside the server) can show up to a second late.
  Log lines and operations that only read never invalidate. The folder scans still run per poll.
- **Alternatives:** Pushing a snapshot revision over the relay's SSE instead of polling — the right next
  step, but it changes both clients and the protocol. Sharing the whole snapshot — the server's own
  transfers and setup records change without an event, so polls showed them up to a second late.
- **Owner:** `team`.
- **Links:** `src/workspace-service/snapshot/snapshot-cache.ts`, `src/workspace-service/service.ts`,
  `src/workspace-service/snapshot-sharing.test.ts`.
