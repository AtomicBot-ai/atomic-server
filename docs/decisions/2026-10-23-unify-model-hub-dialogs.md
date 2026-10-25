---
date: 2026-10-23
title: "Keep engine controls and completed downloads together"
---

# 2026-10-23 — Keep engine controls and completed downloads together

- **Context:** The model hub hid completed downloads, opened an endpoint editor even when endpoints were saved, and split terminal engine settings/builds into additional screens. Modal backdrops behaved inconsistently.
- **Decision:** Both clients retain completed jobs in the full Downloads view while background cards show active work only. Explicit installed-file deletion delegates to the core and removes the transfer record only after success. Engine settings, installed builds, and update controls share one scrollable popup. Saved custom endpoints open as a list. An outside click dismisses the topmost popup using its existing close policy and consumes the click.
- **Consequences:** Completed work stays discoverable, paused downloads retain partial files, and confirmation is still required before deletion. Pending operations and unsaved-change prompts keep their existing close guards. Settings remain server-owned; terminal fields edit inline and dropdown choices stay in the popup.
- **Alternatives:** Showing successful jobs in every background card would obscure active work. Deleting installed files directly would bypass core ownership and loaded-model protection.
- **Owner:** team.
- **Links:** `src/workspace-view/downloads.ts`, `src/workspace-service/download-removal.ts`, `packages/admin-ui/src/workspace/useDialog.ts`, `src/tui/workspace/library/engine-panel.ts`.

The connector review also keeps MCP sessions bounded: each request has a deadline, pagination is finite,
HTTP sessions are explicitly closed, and child processes receive a final kill deadline. Browser sign-in
requests only the MCP resource's advertised scopes. PKCE and state bind the callback, a callback is
consumed once, and cancelling or signing out invalidates any in-flight token refresh before it can save.
Credential-bearing connector stderr is excluded from the shared connection status.

Short engine dialogs size to their content; longer settings remain scrollable. Their primary install,
download or save action uses the same three-row button as onboarding. Late setting reads and saves
cannot overwrite a different engine's open form, and a pending save consumes repeated save actions.
