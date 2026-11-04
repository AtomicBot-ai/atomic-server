---
date: 2026-11-04
title: "Keep terminal space and recovery beside the draft"
---

# 2026-11-04 — Keep terminal space and recovery beside the draft

- **Context:** The 0.2.12 CLI UI review (C1–C7) found that the header, download card,
  permanent sidebars and bright composer displaced the transcript. Conflict recovery and
  loading an installed model required leaving the draft. Alt shortcuts differed from Web.
- **Decision:** At up to 35 rows, reserve two status lines and a separating row; downloads
  open their existing list. Keep a 14-column rail and 24-column secondary panel only when
  space allows: hide the secondary panel below 110 columns and use horizontal navigation
  below 90. Use a dark terminal composer, local accents, distinct `>` focus and `*` selection
  markers, single-row actions, and visual Tab order. Model details expose untruncated names.
  Show request/save failures above the composer, with diagnostics and explicit reopen/retry.
  Reopen reads the latest revision without first saving a stale transcript and keeps the draft
  and attachments. Load & send reuses the existing model-loading path, starts the API if needed,
  and sends only if the original draft and selection are still current. Cancellation removes
  the pending send. Ctrl+K opens contextual Help; Alt+1–4 follows the shared Web page order.
- **Consequences:** Compact screens reach secondary sections through Esc Sections. The terminal
  overrides a few shared palette tokens; Web colors remain unchanged. Recovery deliberately
  replaces the displayed stale transcript with the saved one, while retaining unsent input.
  Editing the draft during loading/recovery requires an explicit subsequent send. Model readiness
  and API readiness remain separate; an already loaded model with a stopped API links to Server.
- **Alternatives:** Keeping two permanent sidebars would leave too little text width at 80 columns.
  Saving before reopening repeats revision conflicts. Automatically sending an edited draft after
  a slow model load would submit text the user had not approved. A second loading mechanism would
  duplicate cancellation, errors and engine selection policy.
- **Owner:** team.
- **Links:** `src/tui/workspace/compact-layout.test.tsx`, `chat/draft-load.test.ts`,
  `server/chat-recovery.test.ts`, `test/e2e/tui-compact-workspace.test.ts`.

Supersedes the terminal composer emphasis in `2026-10-08-emphasize-composer-and-unify-hints.md`
and the terminal-only surface choices in `2026-10-24-share-interface-colors.md`.
