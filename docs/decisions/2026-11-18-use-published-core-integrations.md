---
date: 2026-11-18
title: "Use the published core integrations API"
---

# Use the published core integrations API

- **Context:** Atomic Server initially exposed core's integrations and Muse launch arguments through a patch to the npm package.
- **Decision:** Pin the published core 0.24.2, which exports the integrations module and accepts the embedding endpoint in the Muse launch planner.
- **Consequences:** Bun installs the upstream package directly. Agent setup and launch keep using that package's integration logic.
- **Links:** [Configure agents through core](2026-11-17-configure-agents-through-core.md).
- **Owner:** team.
