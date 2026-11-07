---
date: 2026-11-07
title: "Separate model selection from runtime diagnostics"
---

# 2026-11-07 — Separate model selection from runtime diagnostics

- **Context:** FastFlowLM catalog cards repeated source warnings, hid known download sizes and used a full selector for a single variant. Managed model cards exposed raw diagnostic lines as their primary compatibility UI.
- **Decision:** Keep variant, size and download/setup action together. Show a selector only when variants differ, separate capabilities into labeled facts and keep licenses expandable. Preserve unknown capability values. Project the default FLM variant's known size and context into the catalog table. Show managed engine results as individual status cards with the core's reason, visible warnings and expandable diagnostics.
- **Consequences:** Users can distinguish missing setup, failed checks, rejected models and compatible engines awaiting installation. Compatibility and installation decisions remain owned by core; no inferred hardware support or extra catalog requests are introduced. Table metadata describes the default variant; the expanded panel describes the selected variant.
- **Alternatives:** Hiding failures entirely would conceal the reason a model cannot run. Guessing parameters or sizes from model names would present unreliable facts. Keeping the single-option selector would suggest a choice that does not exist.
- **Owner:** team.
- **Links:** `packages/admin-ui/src/workspace/library/install/GenieModelInstall.tsx`, `ManagedCompatibility.tsx`, `../catalog/catalog-data.ts`.
