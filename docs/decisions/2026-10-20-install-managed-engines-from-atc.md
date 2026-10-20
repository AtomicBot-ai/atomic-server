---
date: 2026-10-20
title: "Install managed engines from atc"
---

# 2026-10-20 — Install managed engines from atc

- **Context:** core 0.18.5 installs TensorRT-LLM, vLLM and SGLang (Docker on Linux, its own WSL
  distribution on Windows) as durable operations, but leaves three things to its client: the person's
  consent to the plan (`approved_plan_digest`), the privileged step, and the models. `atc engines install
  vllm` refused with "use `environments.probe`", so a server could set one up only through raw
  `atc control call environments.*` with the digest copied by hand. OpenSpec change
  `add-cli-engine-parity` (design D2–D5).
- **Decision:**
  - **Workspace operations above `environments.*` (D2).** `engines.plan {engine}` answers the engine's
    whole state — the core's probe, the descriptor's notices, the installation, its operation in
    progress, another engine's operation, the last failed setup, the update offer (`ManagedEngineState`,
    `src/contract/managed.ts`). `engines.operate {engine, kind: setup|remove, request_id,
    approved_plan_digest?, retain_models?}`, `engines.operation`, `engines.resume`, `engines.cancel`,
    `engines.diagnostics`. The daemon names the target (`runtime`, one installation per engine), the
    environment and the descriptor (the installation's active one, else the engine id, which the core
    resolves to its newest). `engines.install` for a managed engine answers its plan, starts the core's
    reinstall when `update.needed`, or says it is ready. The raw `environments.*` operations stay for
    scripts.
  - **Consent is bound to a digest, and only a person or an explicit flag gives it (D3).** The command
    prints the plan whole (system changes, download and disk, elevation, sign-in or restart, blockers
    with their commands, warnings, the descriptor's notices, the digest). On a terminal it asks; `--yes`
    agrees to the plan this call printed; `--approve sha256:<d>` goes to `begin` as it is. Without a
    terminal and without a flag it is a usage error and nothing begins. When the core then offers
    another plan (`MANAGED_PLAN_CHANGED`), `--approve` and `--yes` stop with that error and the new plan;
    a terminal is asked again. A removal is agreed to before it begins and approved as the core offers
    it: core 0.18.5 has no route that returns a removal plan.
  - **Following in the command, work in the daemon (D4).** The command follows `environment:operation`
    from its own process (`src/commands/follow.ts`) and polls `engines.operation` every 2 s while the
    event stream is down. Ctrl-C and `--detach` only stop the following and print `atc engines install
    --resume <op>`; `--cancel <op>` asks the core, which stops at its next safe boundary. Another
    engine's operation is shown and waited for: the core changes one managed engine at a time.
  - **Sign-in and restart: instructions for the way the server runs, never `SupplementaryGroups` (D5).**
    `atc` never ends a session or restarts the machine; after `atc restart` (or the service's restart)
    the core probes again and continues.
  - `atc engines rm <managed> [--keep-models]` is a `kind: remove` operation; the daemon keeps the shared
    model store while another managed engine is installed, whatever the flag. `atc engines status
    [engine]` and `list` show the state (`engineView`, `src/workspace-view/engines.ts`, the same words the
    terminal UI and the admin use).
- **Consequences:** a server sets up and removes managed engines with one command, unattended with a
  pinned digest. The e2e runs the built `atc` against the core's fake Linux machine
  (`ATOMIC_MANAGED_TEST_HOST`; its harness is copied into `test/helpers/fake-managed-machine.ts` and
  `test/fixtures/managed/`, to be copied again when the core's changes). Found on the way: the Bun binary's
  `process.exit` dropped what a pipe had not taken yet (a `--json` cut at 64 KiB); `bin.ts` now waits for
  `drain` first.
- **Alternatives:** the command assembling `environments.begin` itself — the target and descriptor rules
  would live in three clients. `SupplementaryGroups=docker` in the unit — systemd refuses to start a
  service whose group does not exist yet (`216/GROUP`), and a `systemd --user` service takes its groups
  from the user manager anyway. Aborting `ctx.signal` on every Ctrl-C — a command that does not listen
  would no longer stop; `AtcIo.onInterrupt` is held only while following.
- **Owner:** `team`.
- **Links:** `src/workspace-service/managed-engines.ts`, `src/workspace-service/engine-install.ts`,
  `src/commands/managed-engine.ts`, `src/commands/managed-session.ts`, `src/commands/engine-status.ts`,
  `src/commands/follow.ts`, `src/workspace-view/engines.ts`, `test/contract/engine-*.test.ts`,
  `test/e2e/managed-engines.test.ts`; `../atomic-chat-spec/openspec/changes/add-cli-engine-parity/`.
