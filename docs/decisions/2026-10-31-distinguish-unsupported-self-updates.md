---
date: 2026-10-31
title: "Distinguish unsupported self-updates from update failures"
---

# 2026-10-31 — Distinguish unsupported self-updates from update failures

- **Context:** `atc update` correctly refuses to replace a package-managed binary or a source checkout, but used the operational `ATC_UPDATE_FAILED` code for those refusals. The reporting boundary therefore sent them to Sentry as unexpected update failures. All ten events inspected in ATOMIC-CHAT-SERVER-2 point to the package-install guard; nine correlate with Linux release checks, and one occurred later on another machine.
- **Decision:** Return the expected `ATC_UPDATE_UNSUPPORTED` error for source and deb/rpm/AUR installs. Preserve exit 1, the existing messages and package-manager hints, and refuse before release lookup or file changes. Keep `ATC_UPDATE_FAILED` operational for actual lookup, download, trust, executable and replacement failures. Set `DO_NOT_TRACK=1` in the shared Linux package smoke script, used both before and after release publication.
- **Consequences:** JSON consumers see a new refusal code; the process exit code is unchanged. Expected refusals no longer generate Sentry events, including on user machines. Package smoke checks retain their assertions while opting every child command out of production telemetry. Unit and CLI contract tests cover the distinction; the source-program E2E uses a local Sentry collector with reporting enabled to prove silence, alongside the existing operational-failure reporting test.
- **Alternatives:** Suppressing every `ATC_UPDATE_FAILED` would hide genuine broken updates. Reusing `ATC_USAGE` would change the exit code to 2. Opting out only in CI would leave the same false alarms on user machines. Parsing the human message in the reporter would couple classification to prose.
- **Owner:** team.
- **Links:** [Issue #39](https://github.com/AtomicBot-ai/atomic-server/issues/39), [Expected service refusals](2026-10-30-distinguish-missing-services-from-manager-failures.md), `src/update/apply.ts`, `scripts/smoke-linux-package.sh`, `test/contract/update-refusals.test.ts`, `test/e2e/reporting.test.ts`.
