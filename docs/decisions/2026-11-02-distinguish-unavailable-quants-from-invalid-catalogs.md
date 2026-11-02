---
date: 2026-11-02
title: "Distinguish unavailable quantizations from invalid catalogs"
---

# 2026-11-02 — Distinguish unavailable quantizations from invalid catalogs

- **Context:** Sentry ATOMIC-CHAT-SERVER-K on atc 0.2.9 points to the missing-choice guard in
  `artifactPlan`. An unknown explicit quantization and an empty catalog quantization list both threw
  an ordinary `Error('Choose an available quantization.')`. The workspace boundary consequently
  reported either case as an unexpected `artifacts.plan` failure. The event does not identify the
  model or requested quantization, so it cannot distinguish those two inputs.
- **Decision:** Reject missing, non-array or empty catalog quantizations as a reportable catalog
  failure before selecting a variant. When a non-empty catalog has no matching explicit choice,
  return `AtcError('ATC_USAGE', 'Choose an available quantization.')`. Keep valid explicit choices
  and the recommended/first-entry default unchanged.
- **Consequences:** CLI clients receive exit 2 and the `ATC_USAGE` JSON error for an unavailable
  choice; the web and terminal clients receive the same refusal through their workspace client.
  Refused plans write no installation plan and download nothing. Broken catalogs remain exit 1,
  `ATC_INTERNAL` and reportable. Unit, workspace/command contract and built-program tests cover
  the distinction, including delivery to a local Sentry collector for a broken catalog.
- **Alternatives:** Silencing every planning error would hide catalog defects. Falling back to a
  different variant after an explicit selection could download a model with different size and
  memory requirements. Neither is acceptable. No catalog, download integrity or telemetry policy
  change is required.
- **Owner:** team.
- **Links:** [Issue #59](https://github.com/AtomicBot-ai/atomic-server/issues/59),
  [Sentry issue](https://atomic-chat.sentry.io/issues/7823967551/).
