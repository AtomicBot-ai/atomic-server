---
date: 2026-10-24
title: "Own engine downloads in the shared server queue"
---

# 2026-10-24 — Own engine downloads in the shared server queue

- **Context:** Web and terminal intros waited for the core installation request. Engine progress was transient, unnamed in Downloads, and a model setup could independently install the same engine. Closing a frontend must not own the lifetime of server work.
- **Decision:** `engines.enqueue` admits supported engine-build downloads to a server-owned sequential queue. The server persists job identity, target, timestamps and terminal outcome in its own `engine-downloads` documents, observes public core progress, and publishes those rows in the shared snapshot. The core remains the only installer and build-file owner. `engines.install` retains its synchronous command contract; managed engine consent and host operations remain unchanged. Clients with the admin disabled reject queue admission instead of hosting long-lived downloads inside a terminal process.
- **Selection and readiness:** Onboarding records the chosen engine as intent, then opens model selection as soon as the queue accepts it. The job is ready only after the core installation returns. A newer engine choice cannot be overwritten by an older job finishing. Terminal GGUF setup, model loads, media setup and Prism model setup join an existing matching engine job. Cancelling a model setup only stops its wait; it does not cancel an engine another client or model may need.
- **Controls and recovery:** The Downloads page retains completed engine history and offers `engines.retry` for failed/interrupted jobs. Engine rows do not expose model Pause/Delete controls: the public installer has cancellation but no documented resumable pause or partial-build removal operation. Restarted jobs read as interrupted until explicitly retried. Proxy configuration is used when executing, never persisted in job records.
- **Handoff:** A selected terminal model stays visible as preparing until the server admits its job; its setup progress fills the interval before the general workspace poll. Completed shared records take precedence so the fallback cannot resurrect a finished download. The Web client accepts the newest completed snapshot even when a later polling request is still in flight; slow reads must not starve progress updates.
- **Consequences:** Every frontend sees the same engine name, progress and queue state. Multiple builds can be added without blocking the client; installation is serialized to avoid competing build activation. ETA remains an estimate from observed bytes. Core installation success, installed-build listings and loaded inference sessions remain distinct states.
- **Alternatives:** Keeping frontend-owned install promises leaves navigation coupled to download duration. Treating selection as installation success would bypass readiness checks. Reimplementing extraction or partial-build removal in the server would violate core ownership.
- **Owner:** team.
- **Links:** `src/workspace-service/engine-downloads.ts`, `src/workspace-view/downloads.ts`, `src/contract/operations/engines.ts`, `test/contract/terminal-onboarding.test.ts`.
