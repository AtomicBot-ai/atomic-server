---
date: 2026-11-12
title: "Preserve working legacy CLI flags"
---

# 2026-11-12 — Preserve working legacy CLI flags

- **Context:** Removing `--no-cors` and `--watch` from the advertised CLI also rejected the working `api start --cors` and `status --no-watch` forms. Existing scripts could fail before running either command.
- **Decision:** Keep the working forms as hidden options in their command specs. Help and shell completion omit them, while the normal parser still handles them. An attempt to disable CORS returns the original usage error.
- **Consequences:** Existing scripts still run, and help and generated command docs advertise only current options.
- **Alternatives:** Stripping legacy flags before parsing would duplicate argument handling and could change the interpretation of tokens after `--`.
- **Owner:** team.
- **Links:** PR #95, `src/cli/command.ts`.
