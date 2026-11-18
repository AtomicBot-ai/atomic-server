---
date: 2026-11-15
title: "Diagnose CLI chat failures with finite tags"
---

# 2026-11-15 — Diagnose CLI chat failures with finite tags

## Context

ATOMIC-CHAT-SERVER-1S reported a generic CLI chat error in the SSE reader. The reporter
scrubs free-form exception text, so it could not distinguish a provider-reported generation
error from an incomplete stream. The client also preserves the message from a non-2xx HTTP
response for the caller. A message lookup could mistake that remote text for a local error.

## Decision

Have the terminal client attach a bounded diagnostic code when it rejects a parsed endpoint,
finds an absent response body, reads a generation error in SSE, or reaches the end of an
incomplete stream. The reporter reads that metadata from the error class. Existing allowlisted
transport codes still identify failures in the response reader, and the reporter still scrubs
remote HTTP text.

## Consequences

A tagged event identifies the client branch that produced it. Invalid URL syntax, malformed
SSE and arbitrary HTTP messages can still reach the reporter without a terminal chat code.
CLI output, exit status and the reporting rules use their existing behaviour.

Owner: team

References: [Sentry ATOMIC-CHAT-SERVER-1S](https://atomic-chat.sentry.io/issues/7848662602/),
`src/terminal-service/client.ts`, `src/telemetry/native-diagnostics.ts`.
