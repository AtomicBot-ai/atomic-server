---
date: 2026-11-04
title: "Unify web workspace sizing and recovery"
---

# 2026-11-04 — Unify web workspace sizing and recovery

- **Context:** the web UI recommendations W1–W8 follow the 0.2.12 retest. Profile
  isolation, first-load draft preservation, catalog routing and empty-answer retry
  already landed. The remaining interface still mixes oversized headers, pill-shaped
  controls and conflicting responsive rules. Long recipe content pushes actions out
  of view, and physical Option navigation can consume text-entry combinations.
- **Decision:** use a 52 px workspace header, a 72 px rail and an optional 240 px
  sidebar. Below 1100 px the sidebar is a drawer and media panels stack. The header
  keeps a compact download summary; its dialog retains detailed progress. Share
  36 px controls, 40 px primary actions, 32 px compact actions, 8 px control radii,
  16 px panel insets and 24 px sections. Preserve the existing semantic color pairs
  and add separate control-border and focus-ring tokens. Theme Reset is a secondary
  action, not a destructive one.
- **Decision:** bound media dialogs to 560 px or viewport minus 32 px, and viewport
  height minus 48 px. Only their content scrolls; the heading and footer stay visible.
  Name each model choice by its media type. Keep edited values when capabilities
  change; explain image/video range or step mismatches inline and block generation
  until corrected. Audio keeps its existing shared range-clamping policy and shows
  the effective value beside the unchanged input. Credential recovery opens remote
  providers; other errors retain their message and expandable details. Alt/Option
  page shortcuts use physical digits only outside editable fields and dialogs.
- **Consequences:** the layout fits compact and zoom-equivalent CSS viewports using
  vertical scrolling. No core, API or terminal behavior changes. The drawer and CSS
  breakpoint must stay aligned. Browser tests cover actual bounds, action sizes,
  focus return, theme switching, retained drafts and model pickers without engines.
  Synthetic layout/key tests do not establish native macOS layout compatibility or
  formal accessibility compliance.
- **Alternatives:** keeping a detailed download card in the header expands every
  screen during a transfer. Shrinking the editor beside two navigation columns makes
  narrow layouts unusable. Scrolling the whole recipe hides its actions; resetting
  out-of-range fields would discard user input. Reloading the page cannot repair
  rejected provider credentials.
- **Owner:** team.
- **Links:** [Admin UI](../admin-ui.md),
  [Web retest fixes](2026-11-04-preserve-web-profile-and-studio-state.md).
