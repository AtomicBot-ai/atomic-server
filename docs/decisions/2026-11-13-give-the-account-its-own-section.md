---
date: 2026-11-13
title: "Give the account its own section, as the desktop app does"
---

# 2026-11-13 — Give the account its own section, as the desktop app does

- **Context:** The first cut of the account (ADR 2026-11-12, sign-in and sharing) put signing in under
  Settings → Account and the account's devices at the top of Server → Remote access, above the Cloudflare
  and local network cards. The desktop app (Atomic-Chat PR #410, its ADR 2026-11-11 "Give the account its
  own section and an onboarding step") moved the account out of Settings into its own rail section with an
  Overview and a Remote models tab. The same account now looked and behaved differently in the two products,
  and on the server the devices were split from the sign-in across two unrelated pages.
- **Decision:** In the terminal UI and the web admin, Account is its own section, as in the desktop app: a
  rail item at the top of the bottom group (above Help), shown only while `account.enabled`, with the
  account's initial once signed in. Its sidebar lists `ACCOUNT_SECTIONS` (`src/contract/workspace-navigation.ts`):
  **Overview** (sign in, who is signed in, sign out) and **Remote models** (share the server with the
  account's devices: the switch, Add a device, devices asking for access, devices with access). Remote models
  shows the sign-in while nobody is signed in. Settings no longer lists Account; the `account.enabled`
  switch stays in Settings → General. Server → Remote access keeps the tunnel and the local network, and
  while accounts are on it ends with one line on how sharing stands and a way to Remote models. The access
  request notice opens Account → Remote models.
- **Consequences:** The account reads the same on the desktop and the server, and everything about
  devices is on one page next to the sign-in. Alt+1…4 keep their pages: Account is reached from the rail
  (and in the terminal's compact top row) without a number, because it is not always there. Turning
  accounts off while the Account page is open falls back to Server. The tab is named "Remote models" for
  parity with the app, although the server only shares (it has no "other computers" to use).
- **Alternatives:** Keep Settings → Account and only move the devices (still two places, unlike the app);
  put Account in `WORKSPACE_NAVIGATION` (would renumber Alt+4 and show an empty page while accounts are
  off); name the tab "Remote access" (clashes with Server → Remote access, the tunnel).
- **Owner:** team.
- **Links:** `src/contract/workspace-navigation.ts`, `packages/admin-ui/src/workspace/account/`,
  `src/tui/workspace/account/`, ADR 2026-11-12 "Share the server with the account's devices", PR
  AtomicBot-ai/atomic-server#97.
