---
date: 2026-10-29
title: "Keep an exploratory QA ledger"
---

# 2026-10-29 — Keep an exploratory QA ledger

- **Context:** Exploratory QA produced reproducible defects and local evidence that later passes need to find, extend and deduplicate.
- **Decision:** Keep a cumulative ledger in `docs/qa/`, one file per stable finding ID, a journal per session and synthetic or redacted evidence. Link it from the testing guide. Discovery does not imply permission to fix code or file external tickets.
- **Consequences:** Findings remain reviewable with the repository. Updating a status requires evidence; verified-fixed status also requires a linked fix and retest. Engine binaries, weights, credentials and production data stay outside the repository.
- **Alternatives:** Chat-only reports and temporary files are harder to continue across sessions. An external issue tracker remains an option when the owner explicitly requests it.
- **Owner:** team.
- **Links:** [QA ledger](../qa/README.md), [testing guide](../testing.md).
