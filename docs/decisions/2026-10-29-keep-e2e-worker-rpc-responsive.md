---
date: 2026-10-29
title: "Keep E2E worker RPC responsive"
---

# 2026-10-29 — Keep E2E worker RPC responsive

- **Context:** The v0.2.9 Windows ARM run passed its CLI and server regressions but emitted two `onTaskUpdate` RPC timeouts. These tests execute synchronous command chains for 69–80 seconds, longer than Vitest 3's 60-second RPC deadline; the worker cannot consume the reply while blocked. The document journey also overrides the project's 120-second E2E ceiling with 30 seconds, despite mandatory permission checks and several separate cold command starts.
- **Decision:** Run the long CLI, server, document and service journeys with asynchronous child processes. Preserve exit-code/output assertions, command timeouts, environment overrides and MCP stdin. Inherit the document journey's normal 120-second ceiling and give E2E cleanup hooks the same bounded budget. A regression makes a child wait for its parent HTTP server: a blocking runner cannot complete this exchange. Also check missing programs and command termination.
- **Decision:** Keep the Windows service restart assertion. Capture the server log and Task Scheduler state/result/XML if restart fails, rather than declaring an unproven service failure flaky. Native Windows CI must supply the evidence before changing service behavior or removing the release exception.
- **Evidence:** The first native Windows ARM run completes the document journey in 33.992 seconds and reports no RPC timeout. It exposes a runner regression: merging the parent environment again reinstates the `PSModulePath` removed by the core ACL probe. Treat an explicit environment as complete; a regression first reproduces the inherited-variable leak and then passes with the correction. Keep the ACL server cleanup in `finally` even when an assertion fails.
- **Consequences:** The test runner changes no production behavior or dependencies. Native service diagnostics subsequently establish a separate Windows defect, addressed by [Supervise Windows service exits](2026-10-30-supervise-windows-service-exits.md). Vitest can process worker messages and enforce timeouts while commands run. The published v0.2.9 tag is untouched; its exception is removed from future workflows only after complete Windows ARM coverage passes.
- **Alternatives:** Increasing or ignoring RPC timeouts hides an unresponsive worker. Increasing every test limit does not restore event-loop progress. Dropping the document or restart assertion would remove behavior coverage.
- **Owner:** team.
- **Links:** [v0.2.9 Windows ARM log](https://github.com/AtomicBot-ai/atomic-server/actions/runs/40942350621/job/123689460663), [Node synchronous process creation](https://nodejs.org/docs/latest-v22.x/api/child_process.html#synchronous-process-creation).
