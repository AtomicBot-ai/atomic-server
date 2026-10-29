---
date: 2026-10-29
title: "Report errors at each workspace boundary"
---

# 2026-10-29 — Report errors at each workspace boundary

- **Context:** atc's reporter covered server startup, uncaught server failures, admin requests and
  downloads. CLI/TUI failures, browser exceptions and background persistence failures could be shown
  to a user without an event. Normal server shutdown did not flush its own pending reports.
- **Decision:**
  - Give each process one lazy reporter, available through the command context. Initialize it only
    on a failure. Bound initialization, consent checks and delivery by the same two-second exit wait.
    The daemon shares it and follows the core's live consent; long-lived clients re-read consent.
  - Report at the first owning boundary. Mark locally observed exceptions and preserve the remote
    ownership of decoded server errors. Downloads retain their existing classification and are not
    repeated by setup workers. Expected answers, cancellations and core-owned failures stay excluded.
  - Observe background job failures before persisting `failed`, including a second failure to persist
    that state. Report local TUI actions and browser React/global/handled failures as well.
  - New boundaries retain error category, code and call frames, replacing free-form messages with a
    code-owned operation label. Messages can contain prompts or replies; generic PII scrubbing alone
    cannot make such content safe.
  - The browser posts only an allowlisted category and bundled asset positions to an authenticated,
    origin-gated BFF route. No message, URL, fragment, arbitrary tags or envelope is accepted. Bound
    the body to 16 KiB, 30 frames and ten submissions per minute per server. The server's existing
    consent, scrubbing, dedup and hourly caps decide external delivery.
  - Keep source builds opt-in and existing quotas unchanged. Official production/prerelease builds
    must fail rather than ship without a valid atc DSN. Retain the core's implementation and add no
    dependencies.
- **Consequences:** browser delivery requires a reachable server and authenticated session; errors
  before login may remain local. Browser stacks identify bundled asset positions; source-map upload
  is not introduced. Reporting outages never replace an operation's result or recursively report
  themselves. Technical context is preserved while arbitrary error text is intentionally absent.
- **Alternatives:** an SDK in every client adds dependencies and independent consent/transport
  behavior. Sending every caught error adds duplicates and expected refusals. Enlarging quotas would
  not fix failures that never reached the reporter.
- **Owner:** `team`.
- **Links:** `src/telemetry/`, `src/admin/client-reports.ts`, `src/contract/client-reports.ts`,
  `packages/admin-ui/src/services/error-reporting.ts`, `test/e2e/reporting.test.ts`,
  `test/e2e-web/reporting.test.ts`; extends `2026-10-21-report-atc-server-errors-to-its-own-project.md`.
