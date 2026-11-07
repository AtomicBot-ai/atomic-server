---
date: 2026-11-06
title: "Separate runtime memory preparation from driver recipes"
---

# 2026-11-06 — Separate runtime memory preparation from driver recipes

- **Context:** The server could display a low memlock result but could not prepare a healthy Linux host without a driver recipe. The terminal UI also left elevation to the background server, which has no terminal for sudo.
- **Decision:** Keep memory policy and mutation entirely in core. Forward the new host action through the existing digest-bound, single-launch executor. On consent or resume, the terminal UI releases Ink/raw input, runs the normal authorization handler, then restores its workspace. For browser preparation on a Linux desktop, the daemon can open `xdg-terminal-exec` with an unprivileged prompt wrapper that invokes sudo. This path does not require a separately running polkit agent; pkexec remains available when no terminal launcher exists.
- **Consequences:** The user does not copy prlimit or systemd commands. Where no desktop authorization surface is available, the pending memory operation offers authorization in the server's terminal UI. The prompt wrapper validates the launch digest and records sudo refusal as a bound failure so the operation does not wait indefinitely. Neither the UI nor server collects passwords. Cancellation, receipts and single-launch guards stay shared with other FLM operations.
- **Limits:** A remote browser alone cannot supply a local OS authentication agent. The server's terminal UI provides the interactive authorization path. The core persists future-session limits; already open parent sessions retain their old limits. The exact released core pin remains a separate release task.
- **Alternatives:** Embedding memlock logic in service templates or CLI commands duplicates core policy and misses existing foreground/server processes. Running sudo while Ink owns raw input corrupts password interaction.
- **Owner:** team.
- **Links:** `add-fastflowlm-runtime`; [polkit authentication agents](https://polkit.pages.freedesktop.org/polkit/pkexec.1.html).
