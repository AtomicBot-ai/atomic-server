---
date: 2026-11-02
title: "Keep managed-model compatibility refusals local"
---

# 2026-11-02 — Keep managed-model compatibility refusals local

- **Context:** Sentry ATOMIC-CHAT-SERVER-J on atc 0.2.9 points to the final refusal in
  `managedChoice`. When a safetensors model or a repository without GGUF files has no accepting
  managed engine, the TUI threw an ordinary error containing the verdict explanations. The action
  boundary consequently reported a successful compatibility check's refusal as an unexpected
  `workspace.action` failure.
- **Decision:** Write the existing refusal explanation to workspace state, clear `busy` and return
  a handled action. Preserve the fallback explanation when no verdicts are returned. Keep check
  exceptions propagating to the existing reporting boundary. Engine compatibility policy and the
  compatible-engine installation and model planning paths are unchanged.
- **Consequences:** Users can read why the model was refused and continue using the catalog without
  starting an installation. Refusals send no error report; genuine failures still do. The action
  regression covers incompatible and empty verdicts. An Ink contract checks both refusals and a
  real exception at the action reporting boundary; the built-program test uses an incompatible
  local Hub fixture, the core's fake managed host, a real pseudo-terminal and a local Sentry
  collector. POSIX-only pseudo-terminal execution is skipped on Windows; the Ink contract runs
  there in normal CI.
- **Alternatives:** Ignoring every `models.check` exception would hide actual check failures.
  Changing an engine verdict or automatically installing another engine would change compatibility
  policy without evidence. A direct state message matches other TUI precondition refusals.
- **Owner:** team.
- **Links:** [PR #60](https://github.com/AtomicBot-ai/atomic-server/pull/60),
  [Sentry issue](https://atomic-chat.sentry.io/issues/7823737425/).
