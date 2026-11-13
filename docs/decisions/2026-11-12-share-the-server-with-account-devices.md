---
date: 2026-11-12
title: "Share the server with the account's devices"
---

# 2026-11-12 — Share the server with the account's devices

- **Context:** Remote access was manual: a Cloudflare quick tunnel through the system `cloudflared`, or the
  API on the LAN, and a key copied by hand into another device. The tunnel URL is new on every start, so a
  restart broke every device. The account service now brokers remote access (backend README "Remote access
  API", reference crypto in `tests/remote_protocol.py`): hosts — desktop or server — and devices of one
  account, one confirmation per device (a code, a QR link whose secret the service never sees, or "Allow"
  with a 6-digit check code on both screens), and sealed mailboxes, so the service never holds a key or an
  address. The desktop app plays both roles (Atomic-Chat ADR 2026-11-12); a mobile client comes later.
  atc's public API already checks a keyring of its own, read on every request (`publicApiKeys`).
- **Decision:** atc is a host. `src/account/remote/` registers this install's X25519 device key and the
  host, then long-polls `POST /v1/remote/host/sync` (25 s), reporting the tunnel (`online|off|error`) and
  whether the API listens on the network, and wakes early on the core's `remote-access:status`/`server:*`
  events and on the person's actions. It checks a code pairing's proof against the code and QR secret it
  showed (and denies a mismatch), issues each device its own key in the keyring's format with an HPKE
  envelope (and the MAC for code pairings), and sends every active device a sealed copy of its addresses —
  the tunnel URL plus `api.prefix`, then each LAN address while `api.host` is every interface — with a
  higher sequence number whenever they or the set of devices change. Device keys live in
  `remote-access.json` (0600) and join the keyring's in `publicApiKeys` while sharing is on; they are never
  written to `client-keys.json`. Turning sharing on starts the API and the tunnel (`ATC_REMOTE_UNREACHABLE`
  when neither the tunnel nor the LAN can work); off pauses (keys refused, grants kept); off with `--forget`
  removes the host and every grant. Sign-out, a lost session or a removed host end access: no sharing, no
  keys. The crypto uses hpke-js (`@hpke/core` 1.9.0, `@hpke/dhkem-x25519` and `@hpke/chacha20poly1305`
  1.8.0, `@hpke/common` held at 1.10.1 by an override) and node:crypto for HMAC, HKDF, SHA-256 and the X25519
  public key; QR codes come from `uqr` 0.1.3 (terminal half-blocks, SVG for the web admin). The owner
  approved these dependencies on 2026-11-12.
- **Hardening (security review before the first commit):** the host never takes the account service's word
  for a decision. A request gets a key only when the person allowed it here: `decide` writes the grant, the
  device and the key its check code covered to `allowed` first, and a grant the service reports `approved`
  without that record, with another key, or with an unknown method is denied. A used pairing code is
  cleared only once its device holds the key. Device keys count only while sharing is on for the account
  signed in now, so a file another session left opens nothing; every change counts in memory before it is
  written, so a failed write never keeps a removed key alive; sharing can be turned off signed out. Sign-out
  refreshes an expired token before `POST /v1/auth/logout` and says when the service did not confirm it; a
  refresh that lands after a sign-out is dropped. Names and codes from the service or other devices lose
  control characters before a terminal prints them; the device-code page must be https; the service's
  intervals and lifetimes are clamped (polls at least 5 s apart, rounds at least 1 s apart, `Retry-After`
  honoured). `account.status` is `secret` too: a waiting device code shown to an agent would let whoever
  approves it first own the server.
- **Consequences:** A desktop signed in to the same account sees the server under "Your other computers"
  and pairs by "Connect" + `atc remote allow <check code>`, by typing the code, or by pasting the link
  `atc remote add-device` prints; it keeps the server's current address across restarts. A phone will scan
  the QR code. Devices get inference only: a key for `/v1`, never the admin or control API. Revoking is
  immediate, since the keyring is sampled on every request. The same protocol vectors as the backend and
  the desktop are unit tests; the crypto also runs under `bun test` (`test/runtime-compat`). The pinned
  versions were the newest at least two weeks old; newer releases need a deliberate bump. Quick-tunnel
  limits (no SLA, Cloudflare sees the traffic) stay as before. LAN addresses are plain `http://`: a device
  that uses one sends its key in clear on that network, as any LAN client of the API does; LAN is offered
  only while `api.host` listens on every interface. A device revoked while this server was off or offline
  keeps working over the LAN until its next successful sync. The 6-digit check code resists a casual swap,
  not a backend that grinds keys; the QR link is the strong path.
- **Alternatives:** The core's `PUT /server/client-keys` (core 0.23.0) serves an app without a keyring; the
  core ignores it when the embedder has one, as atc does. HPKE written by hand on node:crypto avoids a
  dependency but rolls our own construction, and Bun's `chacha20-poly1305` cipher support is not
  guaranteed. A pairing code without the QR secret would let an actively compromised service intercept the
  first exchange; the link carries the secret for a paste or a scan.
- **Owner:** team.
- **Links:** `src/account/remote/` (`protocol.ts`, `sealed.ts`, `host-plan.ts`, `host-round.ts`,
  `remote-host.ts`), `src/daemon/device-keys.ts`, `src/workspace-service/account-wiring.ts`,
  `src/commands/access/remote.ts`; desktop Atomic-Chat
  `docs/decisions/2026-11-12-share-and-use-models-through-the-account.md`.
