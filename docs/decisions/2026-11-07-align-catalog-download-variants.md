---
date: 2026-11-07
title: "Align model variants across the web catalog"
---

# 2026-11-07 — Align model variants across the web catalog

- **Context:** Media and GGUF variants showed sparse identifiers and detached download buttons. A flex rule expanded the action wrapper as well as the filename. Media quant metadata already included labels, file sizes and recommendations, but rendering discarded them.
- **Decision:** Use compact grid rows with separate variant, file-size and action columns. Preserve catalog labels and recommendations while sending the original identifiers to the existing download flow. Media cards expose engines and variant counts; long descriptions expand with the model. Narrow screens put size below the filename and retain the action beside it.
- **Consequences:** Catalog byte counts are explicitly model-file sizes, never claimed to be complete bundle sizes. Missing sizes remain unknown. The existing planning step still resolves dependencies and full download requirements. No model files or engine selection rules change.
- **Alternatives:** A single variant dropdown would hide side-by-side size comparisons. Fetching every plan before showing options would add unnecessary network work and delay browsing.
- **Owner:** team.
- **Links:** `packages/admin-ui/src/workspace/library/catalog/CatalogModelOptions.tsx`, `CatalogMedia.tsx`.
