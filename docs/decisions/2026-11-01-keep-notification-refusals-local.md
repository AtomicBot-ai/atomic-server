---
date: 2026-11-01
title: "Keep optional notification refusals out of error reports"
---

# 2026-11-01 — Keep optional notification refusals out of error reports

- **Context:** the web admin threw an ordinary `Error` when notifications were unavailable or the
  permission request returned `denied` or `default`. Its error display also reports browser exceptions,
  so these expected outcomes produced `Unexpected failure in browser.action` in Sentry. Both events in
  ATOMIC-CHAT-SERVER-B map to the refusal branch in the published `atc@0.2.9` browser asset.
- **Decision:** display these permission outcomes directly in the dialog and return without throwing.
  Keep the existing catch and reporter for unexpected exceptions from the permission request.
- **Consequences:** the user keeps the same explanation, can retry or continue without notifications,
  and grants still close the dialog and mark notifications allowed. Expected outcomes do not submit a
  browser error; genuine request failures retain their existing reporting and privacy rules.
- **Alternatives:** filtering all `browser.action` errors or matching message strings in the reporter
  would hide unrelated defects and couple telemetry policy to display text. The owning dialog knows
  whether the browser returned a normal permission result.
- **Owner:** `team`.
- **Links:** [issue #50](https://github.com/AtomicBot-ai/atomic-server/issues/50),
  [Sentry](https://atomic-chat.sentry.io/issues/7823275573/),
  `packages/admin-ui/src/workspace/setup/Permissions.tsx`,
  `test/e2e-web/notification-permissions.test.ts`.
