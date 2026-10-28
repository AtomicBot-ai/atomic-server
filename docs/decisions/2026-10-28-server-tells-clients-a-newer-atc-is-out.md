---
date: 2026-10-28
title: "The server tells its clients when a newer atc is out"
---

# 2026-10-28 — The server tells its clients when a newer atc is out

- **Context:** The only way to learn about a release was `atc update --check`. The config field
  `update.checkOnStart` (default on, shown in the web admin's settings as "Check for updates on start")
  existed but nothing read it. Users of the terminal UI and the web admin never heard of a release.
- **Decision:** The daemon looks for a release itself — `ReleaseWatch` in `src/update/`, 15 s after its
  ready record and then once a day, only when `update.checkOnStart` is on, through the server's `fetch`
  and `ATC_GITHUB_API` — and publishes what it knows as the workspace snapshot's `atc` (the version, when
  it last looked, the newer release with the command that installs it). Both clients read that field:
  the terminal UI in the status line while nothing else is being said, the web admin as a notice bottom
  right (top right in the chat, whose composer owns the bottom) that Dismiss keeps away for that release. The notice only tells; it never runs the update.
- **Consequences:** One network call per day from the server, honouring the switch users already see.
  The clients need no network and no knowledge of GitHub; a client without a server shows nothing. A
  packaged atc is told its package manager's command, a source tree only the release page. Every test
  that starts a server turns the check off (`test/setup.ts`, the contract tests' explicit envs); one
  contract test drives the check against a faked `fetch`. The terminal UI has no dismissal: the status
  line is its notice channel and any later message replaces it.
- **Alternatives:** Each client checking GitHub itself — two code paths, a browser blocked by CORS, and
  the switch would have to be read in three places. An "Update now" button in the web admin — the
  server would have to replace its own binary and restart on a request from a browser, which the BFF
  never allows (`/shutdown` is not proxied); a later change on its own. A floating box in the terminal
  UI — Ink has no overlay layer and a dismissable box needs key handling for one line of text.
- **Owner:** `team`.
- **Links:** `src/update/release-watch.ts`, `src/daemon/release-check.ts`, `src/contract/workspace.ts`
  (`WorkspaceAtc`), `src/workspace-view/update/update-notice.ts`, `src/tui/workspace/frame.ts`,
  `packages/admin-ui/src/workspace/UpdateToast.tsx`, `test/contract/daemon.test.ts`.
