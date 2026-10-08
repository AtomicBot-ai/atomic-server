---
date: 2026-10-08
title: "Simplify the header and animate the eye"
---

# 2026-10-08 — Simplify the header and animate the eye

- **Context:** API status duplicates the Server page, the black separator breaks the app surface, and the eye is nearly static between glances.
- **Decision:** Keep the title free of service status. Use one app-background row below the title, followed by a menu-coloured blank row and the bold navigation labels. This supersedes the black separator in the earlier composer-and-hints decision. Animate radial fibres and edge flames continuously, add a gentle pupil pulse, and shorten the interval between glances. Preserve the anchored silhouette, 4:3 visual proportions and two-thirds size limit.
- **Consequences:** Content and composer coordinates stay fixed. Motion uses the existing bounded animation clock, refreshed every 140 ms; it still pauses in conversations and overlays. Turning motion off freezes every animation component. No service lifecycle, model or download behaviour changes.
- **Validation:** Full CLI verification and Bun runtime checks; deterministic reduced-motion and flowing-eye assertions; compact, wide and server PTY previews, plus an animation preview.
- **Owner:** @plombeer31.
