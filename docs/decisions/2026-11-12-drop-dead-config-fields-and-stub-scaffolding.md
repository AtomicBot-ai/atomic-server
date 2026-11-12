---
date: 2026-11-12
title: "Drop the dead config fields and the stub scaffolding"
---

# 2026-11-12 — Drop the dead config fields and the stub scaffolding

- **Context:** the config schema carried six fields nothing read (`api.cors`, `admin.openOnStart`,
  `engines.autoInstall`, `managed.mode`, `managed.image`, `update.channel`), and settings surfaces
  (the terminal UI's CORS toggle, the CLI's `--no-cors` refusal, the admin's labels and hints) kept
  advertising them — `atc api start --no-cors` existed only to fail, and the CORS toggle always
  failed to save. The command tree also carried a stub registry (`src/cli/not-implemented.ts`) with
  an empty `PLANNED` map, scaffolding kept alive only by its own sync test.
- **Decision:** config version moves 6 → 7; one migration strips the six fields and preserves every
  sibling key. The stub machinery, `status --watch` (advertised, never implemented), and the
  daemon's `InProcessEvents` (the daemon listens on `core.events.onAny` directly) are deleted;
  `HttpCoreLink`'s `events` is optional and set only by the client link factory (`attach`).
- **Consequences:** settings screens show only fields that work; a v6 config file migrates silently
  on first read. `link.events` consumers assert non-null — a future daemon-side subscriber must
  construct its own event source instead of reaching for the link's.
- **Alternatives:** implementing `--watch` and the CORS toggle — new feature surface, not a fix for
  slop; keeping the fields for forward compatibility — nothing wrote them from real flows, so there
  was nothing to stay compatible with.
- **Owner:** team.
- **Links:** `src/config/migrations.ts` (the 6 → 7 step), `src/core-link/link.ts`, `AGENTS.md` §1.
