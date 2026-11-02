---
date: 2026-11-02
title: "Confirm terminal copies through the system clipboard"
---

# 2026-11-02 — Confirm terminal copies through the system clipboard

- **Context:** Copy commands only emitted OSC 52, which terminals such as macOS Terminal may ignore without any feedback.
- **Decision:** Inject a host clipboard operation into the TUI. Use `pbcopy` on macOS, PowerShell `Set-Clipboard` on Windows, and `wl-copy` or X11 helpers on Linux. Pass literal UTF-8 text on stdin, never interpolate copied text into a command. Await the result before showing `Copied to clipboard.` Preserve OSC 52 for SSH and headless terminals, describing it as sent rather than confirmed. Failures give a manual-copy instruction.
- **Consequences:** Local copy works independently of terminal escape-sequence support. Host helpers have a three-second timeout. SSH does not write to the remote host's desktop clipboard. Cloudflare copy includes the displayed installation commands followed by the displayed restart command.
- **Alternatives:** OSC 52 alone cannot confirm success and fails in some common local terminals. A new clipboard dependency is unnecessary.
- **Owner:** team.
- **Links:** `src/host/clipboard.ts`, `src/tui/workspace/copy.ts`.
