---
date: 2026-10-29
title: "The server sends the model-ready email"
---

# 2026-10-29 — The server sends the model-ready email

- **Context:** The connection's last wait screen, in the web admin and the terminal UI, asked for an email
  "when it is ready" and only pretended to save it (ADR 2026-10-24-keep-waiting-controls-and-navigation-reachable).
  The Atomic Chat desktop app now delivers the same reminder through Atomic's reminder service
  (`https://api.atomic.chat`, repository `atomic-chat-backend`): `PUT /v1/reminders` with an install token,
  then `POST /v1/reminders/notify` once the model is ready. The service allows only the desktop's webview
  origins over CORS, so the web admin cannot call it, and a browser tab or a terminal may be closed long
  before a large download finishes.
- **Decision:** The server owns the reminder. A new workspace operation, `setup.reminder { email, model?,
  model_name? }`, registers the address for the latest text model download (or the named model's) and
  answers once the service returned `204`. The server keeps `email-reminder.json` in its data folder (mode
  0600): a random install token and what it waits for, never the address. Every 30 s, after a start and after
  a registration it checks that download and sends the notification when it is done. The snapshot's
  `reminder` (setup, model, name, status) lets both clients say "Reminder set." for the download they show.
  The form shows the desktop's consent ("one email when this model is ready… used only for this reminder")
  and only while the model is still downloading.
- **Consequences:** The email arrives whether or not a client is open, as long as the server runs. Retries
  follow the desktop: the attempt and its backoff are saved before the notification is sent (2, 4, 8, 16,
  then every 30 minutes), `429` waits for `Retry-After`, `404` expires the reminder, another 4xx (but 408)
  fails it, a 5xx or no answer retries; a reminder older than 30 days expires, matching the service.
  A new address first drops the old reminder, so an uncertain answer asks for a retry instead of notifying a
  replaced address; the same token is reused, so the service replaces the address it had. A failed
  registration says why (`ATC_USAGE` for a refused address or too many requests, `ATC_INTERNAL` for no
  answer), never with the address in it. Registrations carry `app_version` (the atc version) and `platform:
  atc-<os>`; the service's email itself still says "Open Atomic Chat on your computer", which is the
  service's copy to change. Agents with write access see the operation over MCP like any other `configure`.
- **Alternatives:** Calling the service from the web admin needs a CORS origin per server address and loses
  the reminder with the tab; from the terminal UI it is lost when the terminal closes. Keeping the address
  on the server would let it re-register, but the service already keeps it, and a server's data folder is
  the wrong place for a personal address.
- **Owner:** team.
- **Links:** `src/workspace-service/reminders/`, `src/contract/operations/models.ts` (`setup.reminder`),
  `src/workspace-view/setup/reminder.ts`, `packages/admin-ui/src/workspace/setup/WaitingSetup.tsx`,
  `src/tui/workspace/setup/waiting-reminder.ts`; desktop Atomic-Chat ADR
  2026-10-28-deliver-model-ready-email-reminders.

<!--
Supersedes: 2026-10-24-keep-waiting-controls-and-navigation-reachable.md   (its local email confirmation only)
-->
