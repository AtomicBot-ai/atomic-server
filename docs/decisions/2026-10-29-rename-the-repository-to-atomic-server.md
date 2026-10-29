---
date: 2026-10-29
title: "Rename the repository to atomic-server"
---

# 2026-10-29 — Rename the repository to atomic-server

- **Context:** The product is Atomic Server, but its source and releases use `AtomicBot-ai/eye-cli`.
  The updater, both installers and the Linux publishing scripts embed that repository name.
- **Decision:** Use `AtomicBot-ai/atomic-server` for source and releases. Update the active defaults,
  package metadata, documentation and release contract test together. Keep the command `atc`, private
  package `@atomicbot-ai/atc`, binary and Linux package names, signing identities, package-hosting URL
  and `atomic-chat-cli` data folder scope unchanged. Historical decisions and QA evidence retain their
  original names and paths. This changes the repository part of the 2026-10-09 installer decision.
- **Consequences:** The existing GitHub repository must be renamed; creating another repository and
  copying its contents would not preserve its identity and redirects. Released binaries and installers,
  and workflows rerun from old tags, still address `eye-cli`, so that name must not be reused in the
  organization. Keep old release assets intact. After the rename, update local remotes, check external
  integrations and workflow callers, and verify old/new download URLs and an update from a previously
  released binary. The local checkout directory can keep its current name.
- **Alternatives:** Rely only on redirects: leaves every future release dependent on an obsolete URL.
  Rename runtime paths and packages too: requires unrelated user-data and installation migrations.
- **Owner:** `team`.
- **Links:** [GitHub repository renames](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository),
  [previous installer decision](2026-10-09-publish-baseline-and-musl-builds-and-pick-them-in-the-installers.md),
  [release procedure](../release.md), `src/update/release.ts`, `scripts/install.sh`,
  `scripts/install.ps1`, `scripts/linux-packages.mjs`, `scripts/linux-repo.mjs`.
