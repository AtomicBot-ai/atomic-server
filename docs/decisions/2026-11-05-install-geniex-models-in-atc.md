---
date: 2026-11-05
title: "Install GenieX models in Atomic Server"
---

# 2026-11-05 — Install GenieX models in Atomic Server

- **Context:** Desktop and the server embed a core that runs GenieX on supported Snapdragon hosts. The server previously treated its catalog as ordinary GGUF, which selected a different model registry.
- **Decision:** Commands, the terminal and the web admin share server operations for selecting a GenieX device or chip bundle and installing the reviewed files. Core 0.21.4 owns hardware detection, compatibility checks, build installation and the host process. The server follows Desktop's catalog and file-selection rules, and downloads pinned files through its resumable downloader. Qualcomm ZIPs use the existing streaming ZIP dependency, with regular files in an isolated staging directory and the shared top folder removed.
- **Consequences:** Weight transfers and registration survive a client disconnect. Installation checks the bytes and core verdict before publishing a model under GenieX. The request journal pins its plan for retries. Tests simulate the core and model sources on hosts without Snapdragon hardware.
- **Owner:** team.
