---
date: 2026-11-24
title: "Turn Atomic Chat accounts on for everyone"
---

# 2026-11-24 — Turn Atomic Chat accounts on for everyone

- **Context:** Signing the server in to an Atomic Chat account and sharing it with the account's devices
  (ADRs 2026-11-12 and 2026-11-13) shipped behind `account.enabled`, off by default since config version
  7, with `atc login`, `logout`, `account` and `atc remote …` hidden from help. The backend is live, the
  desktop app pairs with the server, and the mobile guide documents the protocol. `atc config set` writes
  the whole field table to `config.json`, so every file saved since version 7 carries `account.enabled:
  false` whether or not anyone chose it.
- **Decision:** `account.enabled` defaults to on and the account commands are listed in help like any
  other. Config version 8: migration 7 → 8 drops a stored `account.enabled: false` (the old default; the
  commands were hidden, so nobody could have meant it) and keeps an explicit `true`. Turning accounts off
  stays possible with `atc config set account.enabled false` and a restart, as before.
- **Consequences:** After the update every server shows the Account section, the setup's last step hints
  `atc login`, and `atc --help` lists the account and remote commands. Nothing is shared until someone
  signs in and turns sharing on. A config migrated to version 8 is refused by an older atc that understands
  only version 7; that is how every config migration behaves. Someone who turned accounts off by hand before
  this release gets them back on once and can turn them off again.
- **Alternatives:** Flipping only the default would have left accounts off on every server whose config had
  ever been saved. Keeping the flag and announcing `atc config set account.enabled true` would keep the
  feature practically invisible.
- **Owner:** `team`.
- **Links:** AtomicBot-ai/atomic-server#97; `src/config/schema.ts`, `src/config/migrations.ts`,
  `src/commands/access/`.

<!--
Supersedes: none. Amends 2026-11-12-sign-in-to-an-atomic-chat-account.md (default off, hidden commands).
-->
