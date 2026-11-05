---
date: 2026-11-05
title: "Recover refused workspace clients"
---

# 2026-11-05 — Recover refused workspace clients

- **Context:** A terminal workspace caches its admin client. Classifying a refused loopback connection as a stopped server prevents an unexpected Sentry report, but retaining the failed client can keep later calls on a stale admin address.
- **Decision:** On an exact Bun `ConnectionRefused` or nested Node `ECONNREFUSED`, invalidate the cached admin target and the terminal workspace client. A later call rereads the daemon record and token; an existing client accepts only its original server instance and a credential-free HTTP loopback address.
- **Consequences:** The next user action or polling tick can reconnect. The failed call remains visible as `ATC_DAEMON_NOT_RUNNING`; commands are never automatically replayed. Unrelated transport failures keep their original reporting behavior.
- **Alternatives:** Keeping the failed target prevents recovery when the address changes. Retrying the failed command could repeat a state-changing operation. Rebinding to another instance inside an existing client would bypass the terminal runtime's normal instance change handling.
- **Owner:** team.
- **Links:** [PR #82](https://github.com/AtomicBot-ai/atomic-server/pull/82), [PR #83](https://github.com/AtomicBot-ai/atomic-server/pull/83), `src/workspace-service/client.ts`, `src/tui/workspace/runtime/runtime.ts`.
