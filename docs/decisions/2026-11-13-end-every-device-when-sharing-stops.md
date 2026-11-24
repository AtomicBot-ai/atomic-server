---
date: 2026-11-13
title: "End every device's access when sharing stops, and say when a device disconnects"
---

# 2026-11-13 — End every device's access when sharing stops, and say when a device disconnects

- **Context:** ADR 2026-11-12 "Share the server with the account's devices" made turning sharing off a pause:
  the keys stopped working here, but the grants stayed `active` on the account service. Tested against a real
  desktop, that read as broken: the server said sharing was off while the desktop still showed "Connected",
  because nothing told it otherwise. The server also said nothing when a device's access ended from the
  other side (the device pressed Disconnect, another device revoked it, it signed out).
- **Decision:** Supersedes the "off pauses (keys refused, grants kept)" part of ADR 2026-11-12. Turning sharing
  off (TUI `s`, the web switch, `atc remote share off`, `account.remote.share {enabled:false}`) ends every
  device's access: the keys, allowed requests and the pairing code go from the file first (memory first, so a
  failed call never leaves a key working), then every pending request is denied and every approved or active
  grant revoked on the account service — from its own list when it answers, else from what this server knew.
  The backend marks those grants `revoked_by_user`, which the desktop turns into "access ended". The host
  record stays, so sharing again sends no new "new computer" email; devices pair again. `--forget` now means
  "also remove this server from the account's computers". Every client asks first while devices have access.
  A key a sync drops because its grant ended elsewhere becomes an entry in the snapshot's
  `account.remote.ended` (newest first, five minutes, at most five; never the person's own Revoke or stop):
  the terminal says "<device> disconnected from this server" once in its status line, the web admin shows a
  toast in the corner stack until dismissed. The desktop (Atomic-Chat PR #410) follows the same rules.
- **Consequences:** "Off" now means what it says on both ends. Turning sharing back on no longer restores the
  old devices: each pairs again, which is the price of the clear rule. A revoke that fails (no network) is
  reported, and the next time sharing is on, the sync revokes any active grant this server holds no key for.
  The ended list lives in memory: a restart forgets it, which is fine for a notice.
- **Alternatives:** Keep the pause and only change the wording (the desktop would still show "Connected");
  a separate "pause" next to "stop" (two switches for one idea, and a paused device cannot tell it is
  paused); persist the ended list (a notice does not need to survive a restart).
- **Owner:** team.
- **Links:** `src/account/remote/host-stop.ts`, `host-ended.ts`, `remote-host.ts`; ADR 2026-11-12
  "Share the server with the account's devices"; PR AtomicBot-ai/atomic-server#97; Atomic-Chat PR #410.

<!--
Supersedes: 2026-11-12-share-the-server-with-account-devices.md (the "off pauses" part only)
-->
