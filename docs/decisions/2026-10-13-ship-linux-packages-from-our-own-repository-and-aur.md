---
date: 2026-10-13
title: "Ship Linux packages from our own repository and the AUR"
---

# 2026-10-13 — Ship Linux packages from our own repository and the AUR

- **Context:** On Linux `atc` came only from `install.sh` into `~/.local/bin` and updated itself by
  renaming over its own file. Server users expect `apt install` / `dnf install` and updates with the rest
  of the system; Arch users expect the AUR. A package manager owns the files it installs, so a binary that
  replaces itself under `/usr/bin` would leave dpkg's or rpm's database out of step with the disk.
- **Decision:** Build a deb and an rpm per architecture with nfpm from the very binaries the release
  ships (x64 packages carry the baseline build: a package cannot pick by CPU), serve them from our own
  signed apt/dnf repository at `packages.atomic.chat` (Cloudflare R2, rebuilt from the newest ten
  releases on every release), and publish `atc-bin` to the AUR. A packaged install carries
  `/usr/lib/atc/install-source`; with the binary at `/usr/bin/atc`, `atc update` refuses and names the
  package manager. One RSA key (`packaging/atomic-chat.asc`) signs the repository metadata and the rpms.
- **Consequences:** `apt upgrade` / `dnf upgrade` / `yay -Syu` update `atc`; the repository costs nothing
  but storage within R2's free tier, and GitHub Releases stay the source of truth (the bucket is a mirror
  any re-run rebuilds). The README's install commands are what the release smoke runs, before publishing
  against the draft on loopback and after against the live repository. We now hold a signing key whose
  expiry or leak affects every user (renewal and rotation in `docs/release.md`); the repository keeps ten
  versions; `repo` and `aur` are the only steps that run after a release is public, so they are
  idempotent.
- **Alternatives:** Cloudsmith — its free open-source plan is granted by hand and may be refused to a
  company; the free Core plan (500 MB / 1 GB) is too small. openSUSE OBS — builds from source without
  network (Bun and npm need it), a second packaging next to nfpm, one repository per distro release, and
  packages our smoke never saw. A flat apt repository in GitHub Releases plus dnf metadata on Pages —
  only the latest version in apt, two mechanisms. Gemfury — its setup turns signature checks off.
  packagecloud — too small free, too dear paid. Flathub — refuses console software, and the sandbox breaks
  services and GPU engines. Release assets only — no updates through the package manager. A separate
  package build with the install source baked in — the packaged binary would no longer be the attested,
  checksummed release binary.
- **Owner:** `team`.
- **Links:** `packaging/`, `scripts/linux-packaging.mjs`, `scripts/linux-packages.mjs`,
  `scripts/linux-repo.mjs`, `scripts/smoke-linux-package.sh`, `src/update/install-source.ts`,
  `.github/workflows/release.yml`, `docs/release.md#linux-packages-and-the-repository`.
