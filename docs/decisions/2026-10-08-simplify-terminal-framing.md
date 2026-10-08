---
date: 2026-10-08
title: "Simplify terminal framing and compare header ornaments"
---

# 2026-10-08 — Simplify terminal framing and compare header ornaments

- **Context:** The eye appeared too flat, repeated header tiles were visually heavy, and long dashed dividers and duplicate workspace labels added clutter without helping navigation.
- **Decision:** Narrow the eye's horizontal coordinates by 10% and raise its lid profile by about 16%, retaining the palette, fibres and gaze. Remove the composer/footer rules and duplicate Personal terminal / Personal workspace labels. Use a contrasting modal surface in place of modal divider rules. Preserve meaningful intro selection frames, progress bars, keyboard hints and server state. Provide four responsive ASCII ornament studies; the pike crown is provisional until a direction is chosen.
- **Consequences:** Layout and mouse targets remain stable. The eye fills its existing vertical allocation more fully. Ornaments use complete, centred motifs instead of clipped repeating tiles. The comparison can render all four choices at compact, medium and wide sizes without adding navigation or settings to the product.
- **Validation:** Existing layout and input checks plus bounds checks across every ornament style. Actual PTY captures cover the cleaned welcome/chat/server/modal layouts. The inference Core and download recovery are unchanged.
- **Owner:** @plombeer31.
