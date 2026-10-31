---
date: 2026-10-31
title: "Serialize GGUF model file ownership"
---

# 2026-10-31 — Serialize GGUF model file ownership

- **Context:** GGUF setups have distinct request and setup IDs but share download paths for the same model ID. Concurrent installs, or an install and a resume, could both pass the active-run check before either registered its run. One writer could rename the temporary file while the other still expected it, producing an ENOENT like the Windows reports in ATOMIC-CHAT-SERVER-3. Removal could also clean up files while another setup started using them. This reproduces a possible cause, not a diagnosis of every reported event.
- **Decision:** Serialize install claims, resumes and removal cleanup by model ID within the server's ModelSetups instance. Keep the existing request-ID idempotency queue and per-setup persistence queue. Check for an active run and register its replacement within one model operation; refuse removal if a different setup currently owns the model files. Removal acquires the model queue before cancellation and waits for the run without holding its persistence queue.
- **Consequences:** One active GGUF setup owns a model's files. Removal finishes cleanup before a waiting install or resume can claim them. Model queues are released after launch, so different models still download concurrently. Failed cleanup releases the queue. This is coordination inside the server that owns the data folder, not a cross-process filesystem lock; other download providers and external file deletion retain their existing behavior.
- **Alternatives:** Request-ID serialization alone does not coordinate different requests for the same files. Guarding only install leaves resume and cleanup races open. Holding a global queue for the entire download would unnecessarily block other models. Retrying ENOENT would hide the conflicting owners without preventing one from replacing another's files.
- **Owner:** team.
- **Links:** [Sentry investigation](https://github.com/AtomicBot-ai/atomic-server/issues/40), [ModelSetups](../../src/workspace-service/models/model-setups.ts).
