---
date: 2026-10-20
title: "Take the last core gaps from the core"
---

# 2026-10-20 — Take the last core gaps from the core

- **Context:** On core 0.17.0 `atc` still reached around the core in four places: it chose the PrismML
  build itself (`choosePrismBuild`, which filtered `min_prism_build` but not the capabilities a file
  needs, so a Bonsai file could get a build it then failed on), imported the provider setting schemas
  from the core's sources with a made-up `core_version`, judged its Windows data folder by parsing the
  localized text of `icacls`, and could not move to 0.18 at all: the core starts its Foundry Local host
  as `<this binary> foundry-host …`, which `atc` did not know.
- **Decision:** Pin core 0.18.4 and use what it exports for exactly this (OpenSpec change
  `close-cli-core-gaps`): `src/bin.ts` hands `foundry-host …` to `@atomic-chat/core/foundry-host`
  before any command parses it; the GGUF plan asks `POST /backends/atomic-prism/catalog` with the
  verdict's `requires`/`min_build` and runs on its `recommended` (`BACKEND_BUILD_UNAVAILABLE` →
  `no_engine_build`); `settings.schema` serves `settingsSchema` of `@atomic-chat/core/settings` with
  `CORE_VERSION` for every `LOCAL_PROVIDER_IDS`; after `icacls` the folder is read back with
  `readWindowsAcl` and must pass the core executor's `judgeWindowsAcl` plus atc's own "nobody else may
  even read" rule.
- **Consequences:** No copy of a core rule and no deep path into the core package is left. The binary
  carries the core's FFI module (an e2e proves it); a Foundry Local host process also evaluates atc's
  module graph before its fork (about 7 MB). `foundry-local` and `sglang` gain a settings screen. A
  folder that fails the ACL check is still only a warning in the server's log. A Windows folder owned
  by someone other than this user (created from an elevated session) is refused, as the core's
  executor would refuse it.
- **Alternatives:** keep `choosePrismBuild` and add the capability filter here — a second copy of the
  core's choice; a separate host binary next to `atc` — a second artefact to sign and ship; make an
  ACL failure fatal — a broken `icacls` would leave the machine without a server.
- **Owner:** `team`.
- **Links:** `atomic-chat-spec/openspec/changes/close-cli-core-gaps/` (design D1–D5, `rulings/cli.md`),
  `src/bin.ts`, `src/workspace-service/{gguf-facts,gguf-plan,settings}.ts`, `src/host/acl.ts`,
  `test/e2e/foundry-host.test.ts`.
