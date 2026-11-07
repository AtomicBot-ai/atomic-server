---
date: 2026-11-06
title: "Guide manual NPU driver installation while keeping automatic memlock"
---

# Manual NPU driver setup

- **Context:** The operator chose Lemonade-style driver setup instead of qualifying automatic Windows and Linux driver installation. Memory-limit preparation is already automatic and remains so.
- **Decision:** Core selects display-only guidance from server hardware and OS facts. Windows links to AMD; Linux offers distro-specific commands or diagnostics and the upstream guide. Atc renders this same optional `driver_setup` probe field in CLI, TUI and admin. Check again only probes; it never runs the displayed commands. New driver operations do not select recipes; pinned legacy operations remain recoverable.
- **Consequences:** Driver setup can involve a vendor wizard, a system update (explicitly disclosed for Arch), reboot or Secure Boot enrollment. The server is ready only after its own probe succeeds. Memlock still uses the normal single-authorization helper. No driver downloads or installs run on the browser computer.
- **Alternatives:** Copying OS rules into each client would drift and could select commands for the wrong machine. Publishing unqualified automatic recipes would misrepresent the tested scope.
- **Validation:** Core policy/API tests cover distro routing, blocked state and recipe suppression; client tests cover links, commands and read-only recheck. Compiled CLI e2e covers the host probe. Driver package installation itself is deliberately manual and is not claimed as tested.
- **References:** [Linux NPU guide](https://lemonade-server.ai/flm_npu_linux.html), [Windows guide](https://lemonade-server.ai/driver_install.html).
