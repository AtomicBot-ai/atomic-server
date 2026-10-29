---
date: 2026-10-29
title: "Show engine installation status in both lists"
---

# 2026-10-29 — Show engine installation status in both lists

- **Context:** The 0.2.7 retest found that the terminal engine list displayed names without the installed build or the progress visible in engine details.
- **Decision:** Derive each engine's list status in a shared browser-safe selector from the engine listing and the workspace snapshot. Show an active installation, a current install, a failure, or an offered update in both the terminal and web lists.
- **Consequences:** A failed update does not hide a build that remains installed; an active or later successful download takes precedence over an older failure. Managed engines use the snapshot's installation and operation. The list reflects the existing snapshot refresh interval.
- **Alternatives:** Keeping separate terminal and web labels would let their descriptions drift. Fetching details for every row would add requests to render a list whose data is already available.
- **Owner:** team.
- **Links:** `src/workspace-view/engines/engine-status.ts`, 0.2.7 retest B08.
