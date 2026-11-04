---
date: 2026-11-04
title: "Diagnose chat stream failures with finite tags"
---

# 2026-11-04 — Diagnose chat stream failures with finite tags

- **Context:** ATOMIC-CHAT-SERVER-T (`7827451985`) reported `Error: Unexpected failure in chat.stream` on `atc@0.2.11` with empty stack frames (`frames: []`). One event carried `error_code: "ECONNRESET"`, while the second event had no `error_code`. Because `failureReport` scrubs exception messages to `Unexpected failure in chat.stream` and reads only top-level `errorCodeOf(error)`, an uncoded `Error` in `ChatJobs.run` / `readChatStream` (empty response body, >8 MB SSE frame, premature stream EOF, invalid tool-call index, or a wrapped `readDocument` cause in `ClientKeys.get()`) cannot be distinguished without finite diagnostic tags.
- **Decision:** Attach the bounded diagnostic observer to `nativeFailureTags` with four exact-message mappings from `src/workspace-service/chat/chat-stream.ts` (`CHAT_STREAM_EMPTY_RESPONSE`, `CHAT_STREAM_FRAME_TOO_LARGE`, `CHAT_STREAM_ENDED_UNEXPECTEDLY`, `CHAT_STREAM_INVALID_TOOL_CALL_INDEX`) and enable approved `diagnostic_cause_code` inspection across up to five `Error` causes. Keep message scrubbing, error filtering, severity, and reporting consent unchanged.
- **Consequences:** Future `chat.stream` error events in Sentry will identify which exact uncoded `Error` branch or wrapped OS/transport cause triggered the report without exposing prompts, replies, file paths, or arbitrary error text. Remove or replace these diagnostic rules once the observed branch is confirmed and its handling is decided.
- **Alternatives:** Reclassifying premature stream EOF or socket resets as `remoteError` immediately was rejected because the uncoded event lacks stack frames and cause codes, and changing reporting boundary exclusions requires an owner policy decision. Logging or reporting raw error messages was rejected to preserve user privacy.
- **Owner:** team.
- **Links:** [Sentry ATOMIC-CHAT-SERVER-T](https://atomic-chat.sentry.io/issues/7827451985/), `src/workspace-service/chat/chat-jobs.ts`, `src/workspace-service/chat/chat-stream.ts`, `src/telemetry/native-diagnostics.ts`.
