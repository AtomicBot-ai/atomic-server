---
date: 2026-10-09
title: "Require a key from the keyring for every API client"
---

# 2026-10-09 — Require a key from the keyring for every API client

- **Context:** The core checks the public API against the keyring `atc` hands it
  (`publicApiKeys: () => keys.current()`), or, when that returns `undefined`, against its legacy
  `server.api_key`, and checks nothing when both are empty. `client-keys.json` was created only by the
  terminal UI, so on a server where nobody had opened it, `POST /server/start` with `host: 0.0.0.0` and
  no key — allowed through the admin and the control API — opened the API to the network with no key.
  `api.requireKey` did not prevent it (it guarded only `atc api start`, and refused loopback too).
  Separately, the admin allowlisted write routes by prefix, which let a page post a host-step receipt,
  and on Windows the 0600 modes of the keyring, the admin token and the chats are ignored.
- **Decision:** The server creates the keyring before the core starts (seeded from `ATC_API_KEY`), so
  every client on every address needs a key; `atc api start --api-key` adds its key to the keyring.
  `api.requireKey` is removed (config 3 → 4 drops it). The admin allows writes only on exact routes
  (`WRITE_ROUTES`), without the desktop's settings import/acknowledge and without
  `host-step-result`. On Windows the server sets an owner-only ACL on `<data>\atc` at start (this user,
  SYSTEM and Administrators by SID; no inherited entries).
- **Consequences:** No configuration leaves the API open. Local clients need a key too: the terminal UI
  and the agent launcher already used the keyring; scripts take it from `client-keys.json`, `--api-key`
  or `ATC_API_KEY`. Downgrading `atc` after the config migrated refuses the version-4 file (the hint says
  so). A key from `ATC_API_KEY` stays in the keyring after the variable is gone, as `server.api_key` did.
  The lifted admin runtime's `ctx/increase` and `recreate` are not on the allowlist until a page uses them.
- **Alternatives:** Fail closed only (`current()` returns `[]` when the file is missing): the API would
  refuse every client until the terminal UI ran, with no way to get a key from the CLI. Keeping
  `api.requireKey` as "loopback without a key": the core cannot check keys per address, so it would be a
  switch that does nothing.
- **Owner:** `team`.
- **Links:** `src/daemon/daemon.ts`, `src/terminal-data/keys.ts` (`ensure`), `src/commands/terminal.ts`,
  `src/config/migrations.ts`, `src/admin/bff.ts`, `src/host/acl.ts`, `test/contract/daemon.test.ts`,
  `test/e2e/cli.test.ts`.
