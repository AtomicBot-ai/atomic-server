---
date: 2026-11-02
title: "Treat document path refusals as usage"
---

# 2026-11-02 — Treat document path refusals as usage

- **Context:** ATOMIC-CHAT-SERVER-M reaches `readChatDocument`'s non-file guard while confirming a
  document in the terminal UI. macOS can open a directory for reading; the subsequent plain Error
  makes a user-facing refusal report as an unexpected `workspace.action` failure. The selected path
  is not retained in telemetry, so an empty submission is a possible trigger, not a proven one.
- **Decision:** Reject empty and quoted-empty paths before resolving them to the current directory.
  Use `ATC_USAGE` for non-files and both size guards, including files that grow while being read.
  Translate only the open errors `ENOENT`, `ENOTDIR`, `EISDIR`, `EACCES` and `EPERM` into actionable
  usage messages. The existing UI catch keeps the editor and selected path available for correction;
  the existing reporting boundary excludes typed usage errors. Preserve quoted paths, bounded reads,
  handle cleanup and the document extractor's existing validation.
- **Consequences:** A directory, absent file, permission refusal or excessive size stays visible to
  the user without sending a Sentry event. Disk/resource failures and unexpected stat/read/parser
  errors retain the normal reporting path. Unit tests cover real paths and injected filesystem
  failures; a real Ink contract and a built-program PTY journey check refusal, retained input and
  recovery. PTY coverage runs on POSIX; unit and contract coverage run on Windows too.
- **Alternatives:** Filtering all `workspace.action` errors or swallowing all filesystem errors
  would hide defects and outages. Changing the UI catch is unnecessary because it already retains
  the editor correctly. Image and skill file readers and attachment-count/feature preconditions
  are separate paths and are outside this fix.
- **Owner:** team.
- **Links:** [Sentry M](https://atomic-chat.sentry.io/issues/7824236987/),
  [issue 62](https://github.com/AtomicBot-ai/atomic-server/issues/62).
