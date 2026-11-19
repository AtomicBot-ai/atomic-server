---
date: 2026-11-18
title: "Filter the Strata catalog on the server"
---

# 2026-11-18 — Filter the Strata catalog on the server

- **Context.** Web and terminal clients can connect to a server with a different GPU. The Strata catalog contains separate Metal and CUDA recipes.
- **Decision.** Filter by the active or installable backend reported by the embedded core, then group the matching quantizations. Keep exact variant IDs in plans and retain the core's disk and memory verdicts.
- **Consequences.** Clients see the same variants for the server they are connected to. If the core has no active or installable backend, there are no browse results. Saved plans and their resume flow still use the pinned variant.
- **Owner.** Team.
