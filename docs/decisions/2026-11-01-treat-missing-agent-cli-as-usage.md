---
date: 2026-11-01
title: "Treat a missing agent CLI as an expected connect refusal"
---

# 2026-11-01 — Treat a missing agent CLI as an expected connect refusal

- **Context:** both ATOMIC-CHAT-SERVER-E events in `atc@0.2.9` point to `prepareAgent` line 24, where
  no supported executable is found on `PATH`. That branch throws an ordinary Error, so `connect`
  reports an unexpected defect and exits 1 instead of explaining an unmet installation prerequisite.
- **Decision:** use `AtcError('ATC_USAGE', ...)` for this branch for all supported agents. Preserve
  the existing message and installation link. Check before version probes, profile writes or launch.
- **Consequences:** interactive connect exits 2 without submitting a Sentry event or exposing the API
  key. Existing export mode still produces a profile without requiring a local agent installation.
  Other preparation, filesystem and child-process failures retain their current classification.
- **Alternatives:** ignoring all connect failures would lose genuine launch and filesystem defects;
  classifying the failure at the executable lookup keeps that distinction local to its cause.
- **Owner:** `team`.
- **Links:** [issue #56](https://github.com/AtomicBot-ai/atomic-server/issues/56),
  [Sentry](https://atomic-chat.sentry.io/issues/7823645312/), `src/agent-launch/prepare.ts`,
  `src/agent-launch/prepare.test.ts`, `test/contract/codex-connect.test.ts`,
  `test/e2e/managed-models.test.ts`.
