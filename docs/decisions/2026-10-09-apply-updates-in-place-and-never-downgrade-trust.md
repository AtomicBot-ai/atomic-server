---
date: 2026-10-09
title: "Apply updates in place and never downgrade trust"
---

# 2026-10-09 — Apply updates in place and never downgrade trust

- **Context:** `atc update` could only check. Reinstalling by hand replaced the binary under a running
  server, which then could not be reached (see "Replace a server another build left running").
  atomic-agent updates by running the installer from its `main` branch, which installs whatever `main`'s
  installer resolves rather than the version that was checked, and trusts a checksum published next to
  the binary it checks.
- **Decision:** `atc update` downloads the asset of its own baked-in triple beside the executable, checks
  it against `SHA256SUMS`, then against the signature of the installed binary — a Developer ID or
  Authenticode-signed `atc` is replaced only by one signed by the same team or signer, an unsigned or ad-hoc
  one by any intact signature — and runs it with `--version`, before an atomic swap (`planReplace`, with a
  rollback on Windows). It then restarts the service, or the server, onto the new binary. The global
  `--version` flag counts only before a command, so `atc update --version 1.2.3` reaches the command.
- **Consequences:** Updates need no installer and keep the variant. The signature rule only protects
  once releases are signed (WS7b); until then the checksum is the only check, as with the installers. An
  update cannot change the variant (baseline → default) — the installer can. Moving a running Windows
  binary aside leaves an `.old-*` file until the next update.
- **Alternatives:** Re-run the installer (atomic-agent): installs `main`'s idea of the release, and a
  second code path for the same job. Verify a detached signature of `SHA256SUMS`: needs a key to manage
  and ship; the OS code signature already names who built it.
- **Owner:** `team`.
- **Links:** `src/update/apply.ts`, `src/update/trust.ts`, `src/update/node-files.ts`,
  `src/commands/update.ts`, `src/cli/flags.ts`, `test/e2e/update.test.ts`.
