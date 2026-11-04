---
date: 2026-11-04
title: "Diagnose workspace read transport cause codes"
---

# 2026-11-04 — Diagnose workspace read transport cause codes

- **Context:** Sentry issue ATOMIC-CHAT-SERVER-H (`7823689836`) recorded 11 occurrences of
  `Error: Unexpected failure in workspace.read` across Windows x64 (`atc@0.2.9`, core `0.20.5`)
  and macOS arm64 (`atc@0.2.11`, core `0.20.7`) with `component: 'tui'`, `operation: 'workspace.read'`,
  empty stack frames (`frames: []`), and no `error_code` or `native_failure` tag. Boundary analysis
  shows that in-process `WorkspaceService.execute` errors are already reported under
  `component: 'workspace'` and marked reported, and non-OK JSON responses from the local admin BFF
  in `createWorkspaceClient` are converted into `remoteError` or `AtomicCoreError` (both excluded by
  `expectedFailure`). However, when a loopback `fetch` or response body read in `createWorkspaceClient`
  rejects, standard `fetch` implementations wrap the underlying OS/socket error inside `error.cause`,
  while `failureReport` only inspects top-level `errorCodeOf(error)` and `technicalError` scrubs the
  message.
- **Decision:** Enable bounded cause-code diagnostics (`include_cause_codes: true`) in
  `src/telemetry/sentry-agent-diagnostics.ts` through `nativeFailureTags` so existing boundary error
  reports include a finite `diagnostic_cause_code` tag when `error` or its `cause` chain (up to five
  `Error` instances) carries an allowlisted OS or transport code. Keep existing message scrubbing,
  filtering, severity, consent, and reporting boundaries unchanged.
- **Consequences:** Future `workspace.read` and other boundary error reports will expose allowlisted
  cause codes such as Bun's reproduced `ConnectionRefused`, Node's `ECONNREFUSED`, `ECONNRESET`, `EPIPE`, `ETIMEDOUT`, or `UND_ERR_SOCKET` without
  emitting raw exception messages, file paths, or payloads. Once new events identify the specific
  transport or OS cause, this diagnostic observer can be removed or superseded by targeted handling.
- **Alternatives:** Guessing a fix in `createWorkspaceClient` or `WorkspaceRuntime.read` without
  confirming the underlying cause code could mask genuine bugs or misclassify unrelated failures.
  Logging raw `error.cause` messages would violate the telemetry privacy boundary.
- **Owner:** team.
- **Links:** [Sentry ATOMIC-CHAT-SERVER-H](https://atomic-chat.sentry.io/issues/7823689836/),
  `src/tui/workspace/runtime/runtime.ts`, `src/workspace-service/client.ts`,
  `src/telemetry/failures.ts`, `src/telemetry/native-diagnostics.ts`.

The regression also observes the final Sentry envelope through the pinned core reporter with an injected transport; the finite Bun code survives while private exception messages remain absent.
