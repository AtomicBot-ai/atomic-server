---
date: 2026-10-19
title: "Take hardware facts from the core"
---

# 2026-10-19 — Take hardware facts from the core

- **Context:** The daemon probed the machine itself (`nvidia-smi`, `/proc/cpuinfo`, `sysctl`,
  `Win32_VideoController`) and pushed the result with `PUT /hardware/override` on every start. That was
  meant to last until the core could probe on its own. Since core 0.17.0 it does, and better: DRM sysfs,
  Vulkan ICDs and `vulkaninfo`, `nvidia-smi` with a fallback for old drivers, CIM and the registry on
  Windows, real CPU flags. An override replaces the probe wholesale and is never merged with it, so the
  push made the engine choice worse: AMD and Intel GPUs vanished on Linux, an NVIDIA driver older than 470
  refused atc's query and left no GPU, Windows x64 claimed `avx`/`avx2` on any CPU, and `atc hardware
  refresh` could not undo any of it. The desktop app stopped pushing for the same reason (its ADR
  2026-09-27, "the core is the only source of hardware facts and backend decisions").
- **Decision:** `atc` sends no hardware facts. The daemon does not probe; `src/host/hardware-prober.ts`
  is gone; a page in the admin can no longer `PUT /hardware/override` (it can still `DELETE` one). `atc
  doctor` shows the running core's `GET /hardware/info` and its warnings, and skips when no server runs.
- **Consequences:** The engine build is chosen from one description of the machine, the core's. A host
  the core probes badly is fixed in the core, for the desktop app and `atc` at once. Without a running
  server `atc doctor` says nothing about the GPU.
- **Alternatives:** Keep the push behind a flag as an escape hatch — rejected: nobody needs it today, and
  a stale override is exactly the failure being removed. Merge atc's view into the core's — the core
  refuses to merge on purpose (a third description matching neither side).
- **Owner:** `team`.
- **Links:** `src/doctor/checks.ts`, `test/contract/daemon-hardware.test.ts`; core
  `src/hardware/override.ts`, `docs/decisions/2026-09-27-the-core-probes-hardware-with-shell-tools.md`.
