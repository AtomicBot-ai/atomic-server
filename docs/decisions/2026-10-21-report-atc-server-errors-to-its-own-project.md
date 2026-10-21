---
date: 2026-10-21
title: "Report atc's server errors to its own Sentry project"
---

# 2026-10-21 — Report atc's server errors to its own Sentry project

- **Context:**
  - The core reports its own failures (engines, loads, its HTTP routes) to `atomic-chat-core`. atc
    embeds it as a library with `telemetry: { host: 'atc' }`, and a library core leaves its host's
    process alone.
  - Nothing reported what fails in atc's own server code:
    - a throw nothing caught in the server process;
    - a server that could not start;
    - a bug behind the admin API;
    - model downloads, which moved from the core into `src/downloads/`. In the Atomic Chat app the web
      app reports these to `atomic-chat-frontend`.
  - The app splits its reports the same way: `atomic-chat-desktop` for its own process, the core's
    project for the core.
- **Decision:**
  1. **Own project, the core's reporter.** atc builds a second `ErrorReporter` from
     `@atomic-chat/core/host`, with atc's DSN and release `atc@<version>` (`src/telemetry/`). It reuses
     the core's envelopes over `fetch`, scrubbing, dedup, caps and `429` handling. No SDK, no new
     dependency.
  2. **DSN at release only.** `ATC_SENTRY_DSN` (repository secret) is baked by
     `scripts/build-binaries.mjs` as `__ATC_SENTRY_DSN__`. `ATC_SENTRY_ENVIRONMENT` labels both
     projects.
     - A build from source, a test run and the `development` environment send no atc reports.
     - A non-empty `ATC_SENTRY_DSN` in the environment overrides the DSN, for a local check. An empty
       one changes nothing, as for the core.
  3. **One consent for both projects.** Before the core exists, consent is resolved as the core does
     it: an environment "off", then `--telemetry` or `telemetry.enabled`, then the stored choice, then
     on. Once the core runs, its live state decides, so `config set telemetry.enabled` reaches both.
     Both projects use the core's anonymous `install_id`, minted whenever the build reports at all, so
     consent turned on later still has it. The one-time notice covers both.
  4. **What is reported.** The core's `ReportSource` is closed, so its values are reused. A
     `component` tag names the part of atc.
     - A throw nothing caught (the core's `processHandlersFor`, through `AtcIo.catchFatal`): `fatal`.
     - A server that could not start: `startup`, `fatal`, `component: daemon`.
     - A bug behind the admin API (≥ 500): `control_route`, `component: admin`. The route is
       `METHOD /api/…` with ids as `:id`, never the path.
     - A failed model download: `model_load`, `component: downloads`, `failure_reason`.
       - Network, proxy, 5xx after the retries and disk faults are reported at `warning`.
       - A 404, a checksum or size mismatch, a path outside the data folder and anything unknown are
         reported at `error`.
       - A known cause is one issue (`fingerprint: ['download-failure', reason]`).
  5. **Not reported:**
    - `AtcError`s other than `ATC_INTERNAL`: they are atc's answers.
    - `AtomicCoreError`s behind the admin API: the core reports its own.
    - Clients that hang up.
    - A cancelled download, a 401 or 403 (a missing `HF_TOKEN`), a full disk and an invalid `proxy.*`
      setting (`PROXY_CONFIG_INVALID`).
- **Consequences:**
  - Reports go out only once the `ATC_SENTRY_DSN` secret exists and the project is created in Sentry.
    Until then a release builds and reports nothing for atc, and the core reports as before.
  - The release job's e2e on the shipped binary sends nothing: a test runner never uses the baked DSN.
  - The download reasons come from typed facts first: `DownloadRequestError.status`, error codes, the
    disk tags and the downloader's exported messages. Free text is read only for a stream that kept
    dropping. A message that changes falls back to `unknown` (error, grouped by stack) rather than to a
    wrong cause.
  - `runDaemon` moved to `src/daemon/run.ts`, since `daemon.ts` was at the 300-line limit.
- **Alternatives:**
  - The core's project with a `host: atc` tag only: atc's bugs would mix with the core's issues and
    its quota.
  - `@sentry/node`: it needs loader hooks a single-file binary cannot offer, and it is a new
    dependency.
  - Widening the core's `ReportSource` first: a core release for a label. The `component` tag carries
    the same information today.
- **Owner:** `team`.
- **Links:** `src/telemetry/{config,reports,reporter}.ts`, `src/daemon/run.ts`, `src/admin/bff.ts`,
  `src/downloads/downloader.ts`, `src/workspace-service/model-downloads.ts`, `src/io.ts`,
  `scripts/build-binaries.mjs`, `.github/workflows/release.yml`; Atomic-Chat
  `2026-06-09-add-zero-pii-sentry-crash-error-tracking-to-both-the-react.md`; core
  `2026-09-22-the-core-owns-its-error-reporting.md`.
