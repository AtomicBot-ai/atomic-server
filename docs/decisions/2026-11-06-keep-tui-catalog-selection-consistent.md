---
date: 2026-11-06
title: "Keep the TUI catalog selection consistent"
---

# 2026-11-06 — Keep the TUI catalog selection consistent

- **Context:** reopening Models reset its format to GGUF, Refresh used the wrong source for variant catalogs, installed rows bypassed most format filters, and older requests could overwrite a newer selection. Audio and diffusion engines were also offered as text/GGUF filters.
- **Decision:** keep category, text format, text filters, sort and query in `tui-catalog.json` beside the terminal's other client documents. Category selects the model type; text format is exact; engine further restricts that format. Audio and diffusion belong to their category selector. Text-only filters and engine preferences do not affect media. GGUF remains the initial format when no choice has been saved.
- **Decision:** use one catalog reader for entry, refresh, search and format changes. Only the current request may publish rows, errors or completion. Detail reads and preparation use the same generation guard. Trust server search semantics for remote results and apply local search only to injected installed rows. Without an engine restriction, merge managed catalogs by repository and retain their providers.
- **Decision:** the Server model picker's Download a model action is an explicit engine selection for the catalog. Use the staged server engine before the saved one, select Text and that provider's format and filter, and clear the old query and restrictive flags. Preserve sort and the unsaved server draft; browsing does not apply the server selection. Ordinary Models navigation still restores the user's catalog choice.
- **Consequences:** navigating or restarting preserves the choice, and installed models obey the same format filter as remote models. Selecting another category preserves the text choice for returning later. Obsolete reads can finish in the background but cannot replace current UI state. This does not address FLM registry hashing or change web-admin filtering.
- **Alternatives:** caching only the rendered rows leaves request races and loses choices on restart; resetting filters on navigation hides symptoms while discarding user intent.
- **Owner:** team.
- **Links:** `src/tui/workspace/library/catalog-read.ts`, `catalog-filters.ts`, `catalog-preferences.ts`.
