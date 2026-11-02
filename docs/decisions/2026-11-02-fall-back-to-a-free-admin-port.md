---
date: 2026-11-02
title: "Fall back to a free web-admin port"
---

# 2026-11-02 — Fall back to a free web-admin port

- **Context:** on macOS Apple Silicon, another listener on 127.0.0.1:1338 made the admin bind fail,
  shut down the core, and leave initial engine selection empty. The intro also discarded the failure's
  details and hint, hiding the occupied port behind "The server did not start."
- **Decision:** try the configured admin host and port first. On `EADDRINUSE` for a nonzero port,
  retry once on the same host with port 0 so the OS reserves a free port. Log the move and publish the
  bound address through the existing daemon record, status and authenticated admin link. Preserve the
  configured preference. The intro keeps and wraps error details and hints for remaining startup failures.
- **Consequences:** admin URLs can change across starts; callers and SSH forwarding must use
  `atc admin status`. Authentication and loopback restrictions apply at the new address. Other bind
  errors, including failure of the fallback itself, still abort startup. The inference API's port policy
  is unchanged.
- **Alternatives:** aborting startup makes an optional interface block engine setup; continuing without
  admin loses that interface unnecessarily; scanning ports introduces a race before binding; rewriting
  config replaces the user's preference with a transient port.
- **Owner:** `team`.
- **Links:** `src/admin/server.ts`, `src/admin/server.test.ts`,
  `test/contract/daemon-admin-port.test.ts`, `test/e2e/admin-port-fallback.test.ts`,
  `test/contract/terminal-start-error.test.ts`.
