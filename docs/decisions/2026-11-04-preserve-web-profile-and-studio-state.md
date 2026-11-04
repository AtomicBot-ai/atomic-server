---
date: 2026-11-04
title: "Preserve browser profile sessions and studio drafts"
---

# 2026-11-04 — Preserve browser profile sessions and studio drafts

- **Context:** the 0.2.12 web retest exposed host-wide cookie collisions between local
  profiles (WEB-01), continuation of empty failed answers (WEB-02), misleading engine
  selection (WEB-03), lost media context and drafts (WEB-04/06), layout-dependent Option
  shortcuts (WEB-05), mixed light/dark surfaces (WEB-07), clipped recipes (WEB-08), and
  an open model picker that missed completed downloads (WEB-09).
- **Decision:** namespace each admin cookie by a hash of its session-file path, keeping
  the namespace stable across server restarts and port changes. Only that namespace is
  accepted or cleared; session ownership, token rotation, HttpOnly and SameSite remain
  enforced. Retry an empty failed assistant turn from its preceding conversation;
  Continue requires actual answer text. Preserve user-edited media fields across model
  loads, applying capability defaults only to untouched fields. Audio requests include
  only text and controls supported by the selected model, while the local draft survives
  unload. Browse models carries the studio category; Option navigation uses physical
  digit codes. The browser selects a complete semantic light palette. Recipes use the
  existing focus-managed, scrollable dialog, and model pickers share the existing live
  read clock rather than owning another polling timer.
- **Consequences:** existing browsers must open a login link once after upgrading.
  Moving a profile to a different path also requires login. Cookies still travel to
  other ports on the same host, but another profile cannot validate or revoke them.
  Drafts are component-local, not persisted across browser reloads. User-edited numeric
  media parameters remain subject to engine validation. Browser fixtures test these
  flows without downloading or starting an inference engine.
- **Alternatives:** including the admin port in a cookie name would break session
  continuity when an ephemeral port changes. Falling back to the legacy shared cookie
  retains ambiguous profile selection. Resetting the whole media form on capability
  arrival destroys edits made before or during loading. An absolute recipe popup stays
  subject to the viewer's clipping boundary; a dialog provides viewport bounds and
  keyboard focus handling already used elsewhere in the application.
- **Owner:** team.
- **Links:** [Admin UI](../admin-ui.md),
  [API download scope](2026-11-04-settle-terminal-cancellation-and-scope-api-downloads.md).
