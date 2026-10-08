---
date: 2026-10-08
title: "Emphasize the composer and unify terminal hints"
---

# 2026-10-08 — Emphasize the composer and unify terminal hints

- **Context:** The selected ornament needs a clearer header hierarchy, the eye still appears too flat, and the composer and inconsistent shortcut hints lack visual separation.
- **Decision:** Keep the repeating Quiet fangs. Separate the bold product title from bold navigation with exactly one black terminal row. Narrow the eye by a further 18%, raise its lid profile, and allocate more rows in welcome, chat and roomy setup layouts. Render the two-row composer with a light background and dark ink, including Unicode continuation cells. Format contextual hints and shortcut rows in dark grey with ` | ` separators; draw dialog hints from the visible dialog controls.
- **Consequences:** Existing navigation and composer hit targets stay in place. Compact welcome spacing tightens to give the eye five rows while keeping both choice plates visible. Chat gains eye height without moving the editor. Operational status and error messages remain distinct from tooltips. The inference Core is unchanged.
- **Validation:** Full CLI verification and runtime checks; existing layout coverage across terminal sizes; hint punctuation and Unicode surface regression checks; real PTY captures of welcome, composer, menus and tooltips.
- **Owner:** @plombeer31.
