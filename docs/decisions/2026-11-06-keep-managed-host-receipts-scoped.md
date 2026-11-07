---
date: 2026-11-06
title: "Keep managed host receipts scoped to Docker and WSL"
---

# 2026-11-06 — Keep managed host receipts scoped to Docker and WSL

- **Context:** Linking the FastFlowLM core 0.22.0 SDK widens the privileged executor result with `service-restart-required`. The existing atc host-step journal posts Docker/WSL receipts, whose contract does not accept that outcome.
- **Decision:** Keep the existing result reader typed to managed receipts and reject outcomes outside that protocol before journaling or posting them. FastFlowLM integration must use the core's separate request and receipt helpers, including request SHA binding and service activation validation.
- **Consequences:** The local SDK can typecheck without expanding the Docker/WSL API. This change does not implement FastFlowLM preparation or qualify service startup; the FLM adapter remains part of the feature tasks.
- **Alternatives:** Widening the managed receipt or mapping service restart to completion would either send an invalid receipt or claim readiness before the service has restarted. Reimplementing the FLM receipt checks would duplicate core policy.
- **Owner:** team.
- **Links:** `src/host/elevator.ts`, `src/host/host-step.ts`, `src/host/host-step-result.test.ts`; OpenSpec `add-fastflowlm-runtime`, tasks 7.1–7.2.
