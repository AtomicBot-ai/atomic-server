---
date: 2026-10-21
title: "Turn Foundry Local's 1DS upload off on Linux"
---

# 2026-10-21 — Turn Foundry Local's 1DS upload off on Linux

- **Context:**
  - On Linux, Foundry Local's library v2.1.0 crashes its host about ten seconds after a model loads.
    The 1DS telemetry thread sends the mandatory `ProcessInfo` event, and the curl the library bundles
    segfaults (`CurlHttpOperation::Send` → `curl_easy_perform` → `Curl_wildcard_dtor`).
  - Recorded on Ubuntu 26.04 (RTX 5090 Laptop), CPU and CUDA variants alike. The session is gone before
    the first answer; the TUI shows "No text returned".
  - Microsoft tracks it as microsoft/Foundry-Local#1182, fixed by #1153 (bundled curl symbols made
    private). No library release carries the fix yet.
  - The core only turns the optional telemetry off (`ORT_TELEMETRY_DISABLED=1`). Its spec
    (`foundry-local-runtime`, design D8 of `add-foundry-local`) forbids the core to bypass `ProcessInfo`
    through the environment.
- **Decision:** on Linux the server hands its core `TF_BUILD=True` (`src/daemon/core-env.ts`). The
  library treats it as a CI run and sends no 1DS telemetry, `ProcessInfo` included. A `TF_BUILD` the
  person set is kept. Windows and macOS are unchanged.
- **Consequences:**
  - Foundry Local runs on Linux. Microsoft gets no `ProcessInfo` from atc on Linux.
  - This departs from D8 ("only turn off and disclose") by the owner's decision, for this crash alone.
  - The core passes one environment to every process it starts, so llama.cpp and the rest see
    `TF_BUILD` too. Neither the core nor atc reads it; tools read it only to detect Azure Pipelines.
  - Drop it once the core installs a Foundry Local build later than v2.1.0.
- **Alternatives:**
  - The same in the core, beside `ORT_TELEMETRY_DISABLED`: the right place, but it needs a spec change
    and a core release. Kept for when the library fix ships, if it does not.
  - `CI=true`: the same effect, read by far more tools.
  - A proxy for the library's curl: the crash happens whatever the upload's result.
  - Waiting for the library release: Foundry Local does not work on Linux until then.
- **Owner:** `team`.
- **Links:** microsoft/Foundry-Local#1182, microsoft/Foundry-Local#1153; `src/daemon/core-env.ts`.
