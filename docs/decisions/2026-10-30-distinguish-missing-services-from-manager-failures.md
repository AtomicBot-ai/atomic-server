---
date: 2026-10-30
title: "Distinguish missing services from manager failures"
---

# 2026-10-30 — Distinguish missing services from manager failures

- **Context:** `atc service start|stop|restart|uninstall` used `ATC_SERVICE_FAILED` when no service was installed, so an expected refusal reached Sentry as an unexpected command failure. On Windows every failed `schtasks /Query` also appeared to mean the task was absent, hiding access errors and timeouts.
- **Decision:** Keep absent-service control commands failing with exit 1, but use the expected `ATC_SERVICE_NOT_INSTALLED` code and preserve a custom service name in the installation hint. Keep `ATC_SERVICE_FAILED` operational. Query Windows Task Scheduler through its COM API from the existing trusted Windows PowerShell executable: only `GetTask` returning `HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND)` means absent. Connection, folder, access, process, timeout and malformed-response failures remain operational. Read the numeric `TASK_STATE` rather than localized `schtasks` output; unknown state means installed with `running: null`.
- **Consequences:** JSON consumers must recognize the new refusal code. Commands never stop the server or modify the task after a failed status query. Windows status starts one bounded PowerShell process; no dependency is added. Unit and contract tests cover classification and failures; the read-only binary e2e checks absence on each CI OS, and the existing opt-in real-service journey covers installed tasks.
- **Alternatives:** Making uninstall idempotent changes the existing CLI contract. Excluding all service failures from telemetry hides real manager failures. Matching translated `schtasks` error messages or treating every nonzero exit as absence cannot distinguish missing tasks reliably.
- **Owner:** `team`.
- **Links:** [Issue #43](https://github.com/AtomicBot-ai/atomic-server/issues/43), [Task Scheduler retrieval errors](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-tsch/528539ab-2678-4184-9573-cd624916ef9a), [TASK_STATE](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/ne-taskschd-task_state), `src/host/service-task-status.ts`, `test/contract/service.test.ts`, `test/e2e/service-refusals.test.ts`.
