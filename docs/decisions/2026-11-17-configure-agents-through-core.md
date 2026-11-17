---
date: 2026-11-17
title: "Configure agents through core"
---

# Configure agents through core

- **Context:** Atomic Server offered isolated launch profiles for four agents. Agents such as Hermes required manual configuration even though core already knew how to edit their settings.
- **Decision:** Use the core integration catalog, host detection, configuration writers and launch arguments. The connection guide invokes a host operation after verifying the loaded model. CLI and terminal launches use core's launch environment, including for agents that select providers at startup.
- **Consequences:** Agents are configured for the server account where they are installed. Clients on other hosts and editors without a core writer receive endpoint details for manual setup. The host operation returns status and a launch command with a key ID, never the key. The isolated profile export remains available to existing CLI clients.
- **Compatibility:** The patch to core 0.23.4 exposes its existing integration module and adds the Muse arguments for an embedding server. Remove the patch when pinning a core release with both changes.
- **Owner:** team.
