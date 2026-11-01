---
date: 2026-11-01
title: "Distinguish missing Hugging Face model resources from Hub outages"
---

# 2026-11-01 — Distinguish missing Hugging Face model resources from Hub outages

- **Context:** both ATOMIC-CHAT-SERVER-D events in `atc@0.2.9` map to an unsuccessful HTTP response
  while fetching the pinned `config.json`. The original HTTP status is absent from telemetry. The reader
  fetches that file even when the revision listing does not contain it, unlike `hf_quant_config.json`.
- **Decision:** reject a revision without `config.json` before probing model files. Treat HTTP 404 for
  missing repositories, revisions and requested metadata files as `ATC_USAGE`, like existing access
  refusals. Other unsuccessful HTTP responses remain unexpected errors and carry a safe
  `HF_HTTP_<status>` code through the existing boundary reporter. Network and JSON failures retain their
  existing behavior.
- **Consequences:** invalid selections receive an actionable refusal without a false defect report.
  Hub rate limits and outages remain visible with a technical status, without disclosing private
  repository names, URLs, tokens or response bodies. Compatibility decisions still belong to core.
  The historic status cannot be recovered, so this does not establish that those two events were 404s.
- **Alternatives:** translating every Hub failure to a usage error would hide outages. Returning an
  empty configuration would invent metadata and ask engines to assess a different checkpoint.
- **Owner:** `team`.
- **Links:** [issue #54](https://github.com/AtomicBot-ai/atomic-server/issues/54),
  [Sentry](https://atomic-chat.sentry.io/issues/7823570643/),
  `src/workspace-service/models/hf-revision.ts`, `test/contract/model-check-errors.test.ts`,
  `test/e2e/model-check-errors.test.ts`.
