---
date: 2026-10-08
title: "Confirm choices and open installed models"
---

# 2026-10-08 — Confirm choices and open installed models

- **Context:** Engine selection only changed a radio value; its saved default retained an accent after focus moved away. Model selection required a second file-picker action, completed downloads required another action to load, and Enter could disagree with hover or a focused Cancel button.
- **Decision:** Use Enter and click as the same confirmation. Engine confirmation opens models; model confirmation opens progress and installs the balanced default quant, while Versions allows an explicit alternative. Start the first model automatically after all downloads verify, retaining a retry action on a load error. Give each page an explicit primary focus. Engine rows use neutral colours with inversion only for actual focus/hover. Apply the requested near-black, dark grey, white and turquoise palette; retain the eye's interpolated shades and remove its flanking towers.
- **Consequences:** The ordinary setup path has no separate Continue, Download or Open workspace confirmation. Model downloads remain explicit user choices and may be large; the model-row hint explains the default and Versions alternative. Core still validates requirements and owns resumable transfers. Server mode never starts the public API implicitly. Composer Enter sends; Alt/Shift+Enter adds a line.
- **Alternatives:** Retaining radio-only confirmation and an extra Open workspace action made setup appear inert. Treating hover as purely decorative while rendering it as selection made Enter unpredictable.
- **Owner:** @plombeer31.
- **Links:** `src/tui/workspace/setup-actions.ts`, `src/tui/workspace/input.ts`, `src/tui/workspace/data-effects.ts`, companion Core remote-header preparation change.
