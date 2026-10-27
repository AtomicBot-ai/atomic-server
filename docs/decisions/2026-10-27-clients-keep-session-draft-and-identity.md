---
date: 2026-10-27
title: "The clients keep their session, their draft and a download's identity"
---

# 2026-10-27 — The clients keep their session, their draft and a download's identity

- **Context:** the second batch of 0.2.1 reports, each reproduced: `atc run` fetched upstream llama.cpp
  with the TurboQuant build installed, and the `--engine` hint named engines the machine lacks; a restart
  logged every browser out and a login link in an open tab did nothing; a catalog download registered
  under its file name (`LiquidAI/LFM2-1.2B-Q4_K_M` for `LiquidAI/LFM2-1.2B-GGUF`) was a second row in
  the Hub and still recommended by onboarding; an interrupted download read 0 B after a restart; "Open
  server" lost the chat draft; a filter's text did not toggle it; the web and terminal Server panels
  disagreed with nothing loaded. One report (the web jumping into onboarding by itself) did not reproduce.
- **Decision:** one rule for the engine a load goes to (`chooseLoadEngine`): the default when installed,
  else an installed engine the model lists or one of the default's family, used by `atc run`,
  `models.autoLoad` and the `--engine` hint, which names installed engines only. Admin sessions live in
  `atc/run/admin-sessions.json` (owner-only, beside the token), so a restart keeps browsers signed in;
  the SPA trades a `#token=` that arrives by `hashchange` too. A GGUF download records its `repository`
  in `model.yml`, `models.installed` exposes it, and `catalogModelMatches` ties a row to an installed
  model by it (or, for older downloads, by the `owner/name-GGUF` → `owner/name-<quant>` naming rule).
  An interrupted setup reports the bytes its file already has on disk (`bytesOnDisk`). The chat draft is
  kept per conversation outside the Chat component. The filter popover ignores a blur with no related
  target (a label activation). Both Server panels use `serverPanelSelection`: the running chat
  service, else the preferred engine and the last download.
- **Consequences:** a session id file is as sensitive as the admin token and sits in the same restricted
  folder; rotating the token does not revoke sessions yet. The naming rule for older downloads is a
  heuristic bounded to quantization suffixes. Two atc servers on one host still share the session cookie
  name and sign each other out.
- **Alternatives:** a cookie name per admin port (not in this batch); re-reading the setups journal to
  tie downloads to rows (lost when the record is removed); keeping the draft in `localStorage` (shared
  across servers on one host).
- **Owner:** `team`.
- **Links:** `src/workspace-view/engines/load-engine.ts`, `src/admin/auth.ts`,
  `packages/admin-ui/src/containers/AdminRoot.tsx`, `src/workspace-view/catalog/local-model-status.ts`,
  `src/downloads/on-disk.ts`, `packages/admin-ui/src/workspace/chat/chat-draft.ts`,
  `src/workspace-view/setup/connection-model.ts`, `test/e2e/v021-fixes.test.ts`.
