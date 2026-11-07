---
date: 2026-11-07
title: "Show hidden choices and recognize Windows Terminal colors"
---

# 2026-11-07 — Show hidden choices and recognize Windows Terminal colors

- **Context:** Short terminal windows hide engine and model choices. The first-model scrollbar alone does not explain that more choices exist. Windows Terminal can omit `COLORTERM`, causing the TUI to select its limited-color fallback.
- **Decision:** Show ASCII up/down indicators with counts in existing spare rows of the engine intro and model selectors. Recognize `WT_SESSION` alongside `COLORTERM` for truecolor rendering; existing color opt-outs still apply.
- **Consequences:** Hints track the actual visible window without taking space from choices or moving action buttons. Unknown terminals retain the existing fallback. Terminal fonts and user preferences are unchanged.
- **Alternatives:** A permanent scroll hint would be misleading when everything fits. Unicode arrows and enabling truecolor for every terminal would assume unsupported rendering capabilities.
- **Owner:** team.
- **Links:** `src/tui/row-window.ts`, `src/tui/workspace/setup/first-model.ts`, `src/output/color.ts`.
