---
date: 2026-11-12
title: "Sign the server in to an Atomic Chat account"
---

# 2026-11-12 — Sign the server in to an Atomic Chat account

- **Context:** Atomic Chat accounts are live on `https://api.atomic.chat` (repository `atomic-chat-backend`):
  an email one-time code, Google through the service, and the RFC 8628 device flow with an `/activate`
  page, built from the start for a headless Atomic Server (`client_type: "server"`). Access tokens are
  EdDSA JWTs for 15 minutes; refresh tokens rotate, a reused one ends the session after a 60 s grace, and a
  new sign-in with the same `installation_id` replaces that install's session — and with it every remote
  access grant and the install's host. The desktop app signs in from its Rust process (Atomic-Chat ADR
  2026-11-10). atc had no account and no install id; its web admin listens on loopback only.
- **Decision:** The server process owns the account. `src/account/` keeps `account.json` (0600, written
  whole): a 32-byte base64url `installation_id` that survives sign-out, and the session. Sign-in is an email
  code (`account.signin.email.start` / `.verify`) or a device code (`account.signin.device.start`: the
  server shows the code and link, polls `/v1/auth/token` at the given interval, `slow_down` adds 5 s, and
  finishes the sign-in itself); Google works on the activate page, on any device. Every sign-in sends
  `client_type: "server"`, the machine name, `platform: atc-<os>` (as the model-ready email does) and the
  version. One refresh runs at a time, two minutes before expiry; a 401 gets one refresh and one retry;
  `invalid_grant` ends the session, a network failure keeps it. A sign-in over a live session is refused
  (`ATC_ACCOUNT_SIGNED_IN`, sign out first), because it would silently end every device's access. The
  commands are `atc login [--email] [--code]`, `atc logout` and `atc account`; the screens are Settings →
  Account in both clients. Everything sits behind `account.enabled` (config version 7, default off) and
  the commands stay hidden until accounts ship to everyone; `ATC_ACCOUNT_API_URL` points a test server at
  another backend (https, or http on loopback).
- **Consequences:** A server signs in without a browser of its own. The challenge and the device code live
  in memory, so a restart starts a sign-in over. Account operations run only in the server process: without
  the web admin the CLI's in-process workspace refuses them rather than keep a second copy of the session.
  Operations other than `account.status` are `secret`, so an agent reaches them only with
  `atc mcp --allow-secrets`. Errors from the service are mapped to atc codes; its own text is never shown or
  logged.
- **Alternatives:** Google with a loopback redirect on the admin port works only from a browser on the same
  machine or over `ssh -L`, and the activate page already offers Google. Holding the session in each client
  (CLI, terminal UI, web admin) would race refreshes, which the service punishes by ending the session.
- **Owner:** team.
- **Links:** `src/account/` (`session.ts`, `sign-in.ts`, `account-store.ts`, `client-info.ts`),
  `src/contract/operations/account.ts`, `src/commands/access/account.ts`; backend README "Accounts API";
  desktop Atomic-Chat `docs/decisions/2026-11-10-sign-in-to-an-atomic-chat-account.md`.
