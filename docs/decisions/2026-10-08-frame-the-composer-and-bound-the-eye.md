---
date: 2026-10-08
title: "Frame the composer and bound the eye"
---

# 2026-10-08 — Frame the composer and bound the eye

- **Context:** The eye still dominates large empty views, and the editor's detached controls are visually disconnected from writing.
- **Decision:** Interpret the requested dimensions as a 4:3 visual eye, accounting for typical 2:1 terminal cells. Centre it inside no more than two-thirds of the available width and height in roomy regions; compact regions use the available rows for legibility without stretching the ratio. Share this fitting rule across chat, welcome and setup. Give the composer a pale grey-turquoise frame and near-white turquoise surface. Place Send inside at the right, with distinct engine and model controls inside the bottom edge.
- **Consequences:** Composer controls have separate mouse targets and remain keyboard reachable. The engine control opens the existing live engine/model installation chooser; the model control opens the current installed/endpoint library. A successful local model selection now returns to chat with the draft intact. Endpoint configuration remains available from Models and Settings. No inference Core changes or dependencies are needed.
- **Validation:** Full CLI verification, runtime checks, responsive bounds and visual-ratio checks, keyboard/mouse target checks, engine setup and model loading action tests, and real PTY previews at compact and large sizes.
- **Owner:** @plombeer31.
