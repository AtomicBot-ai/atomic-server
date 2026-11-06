---
date: 2026-11-04
title: "Await the complete model-load operation in the terminal contract"
---

# 2026-11-04 — Await the complete model-load operation in the terminal contract

- **Context:** The macOS release gate failed with `ENOTEMPTY` while cleaning up the endpoint-selection contract's temporary data folder. Its `loaded` flag covered only the fake core load; `WorkspaceController.loadModel` still initialized API keys and started the API afterwards. Opening the picker did not synchronize that work.
- **Decision:** Observe and await the real controller's load promise after releasing the gated core load, before checking the saved endpoint and deleting the fixture. Restore the observer during cleanup; keep the real persistence and endpoint-supersession assertions.
- **Consequences:** The contract checks persistence after the complete old load and does not race its keyring writes. Product behavior and timeouts are unchanged.
- **Alternatives:** Retry directory removal, sleep, or rerun CI until green. These hide the missing completion boundary and can assert endpoint persistence before the operation being tested has finished.
- **Owner:** team.
- **Links:** `test/contract/terminal-model-selection.test.ts`, `src/tui/workspace/controller.ts`, [release gate](https://github.com/AtomicBot-ai/atomic-server/actions/runs/41884843841/job/126767367658).
