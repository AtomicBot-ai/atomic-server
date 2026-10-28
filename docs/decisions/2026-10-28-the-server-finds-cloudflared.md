---
date: 2026-10-28
title: "The server finds cloudflared, and says how to install it"
---

# 2026-10-28 — The server finds cloudflared, and says how to install it

- **Context:** Public remote access is the core's Cloudflare quick tunnel: the core runs `cloudflared`
  and proves the URL. The core looks for the program only where its host says (`cloudflaredPath`), in
  `ATOMIC_CLOUDFLARED_BIN`, or in the host's resources folder, never on PATH. The desktop app bundles a
  pinned `cloudflared` beside itself and passes its path; atc passed nothing. On every atc install, Start
  access therefore ended in `error` with `cloudflared_unavailable`, which the terminal UI printed as that
  code at the bottom of the screen and the web as "cloudflared unavailable", with no word on what to do.
- **Decision:** The server looks for `cloudflared` once, at start (`src/host/cloudflared.ts`): the core's
  variable when it names a file there, else PATH, then where the program's installers put it (Homebrew's
  two folders, `/usr/local/bin`, `/usr/bin`, `~/.local/bin`, `<Program Files>\cloudflared`). It hands the
  path to the core. While the core reports `cloudflared_unavailable`, the server adds `cloudflared` to the
  `remote.status`, `remote.start` and `remote.stop` answers (`RemoteAccessSetup`): the commands that
  install it on this system, Cloudflare's page, and `atc restart`. The family of a Linux comes from the
  package that installed atc (deb, rpm, AUR), else `/etc/os-release`. The terminal UI and the web show
  those steps, through one view (`remoteSetupView`), in place of Start and the raw code. The AUR package
  lists `cloudflared` (Arch's `extra`) in `optdepends`.
- **Consequences:** Remote access works wherever `cloudflared` is installed the usual way, including a
  launchd job, whose PATH has no Homebrew, and a server started before the MSI added its PATH entry. A
  program installed while the server runs is picked up only by a restart, which the steps say; the core
  looking at every start would remove that step (a `core:` task). The Debian and Fedora commands are
  Cloudflare's repository setup copied from pkg.cloudflare.com; they change when Cloudflare changes them.
- **Alternatives:** Bundling `cloudflared` like the desktop app: atc ships no programs inside its one
  binary, and every platform would carry about 40 MB more. A hard package dependency: Debian, Ubuntu and
  Fedora have no `cloudflared`, so the deb and the rpm would not install without Cloudflare's repository;
  `Recommends` is silently skipped there and helps no one. Carrying `cloudflared` in our own apt/dnf
  repository: its security updates would become ours, for the one program that opens the machine to the
  internet. Downloading it on demand from atc: the core owns finding the program, so that is the core's
  to do, not a copy here.
- **Owner:** `team`.
- **Links:** `src/host/cloudflared.ts`, `src/daemon/cloudflared.ts`, `src/workspace-service/remote-setup.ts`,
  `src/workspace-view/remote/remote-setup.ts`, `packaging/PKGBUILD.in`; the desktop app's
  `Atomic-Chat/docs/decisions/2026-09-17-expose-the-local-api-server-through-a-cloudflare-tunnel-and-on-the-lan.md`.
