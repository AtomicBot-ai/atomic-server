---
date: 2026-11-06
title: "Keep web catalog selection and requests consistent"
---

# 2026-11-06 — Keep web catalog selection and requests consistent

- **Context:** the catalog parent owned request parameters while its child owned engine filters. Remounts reset one side independently; category changes reset format; Audio appeared as a GGUF engine. Refiltering remote search results discarded valid matches. Snapshot polling restarted installed-model reads before previous scans completed.
- **Decision:** the catalog parent owns category, text format, query, filters and sort, persisted together in browser local storage. Explicit Browse models navigation overrides saved selection for that visit and expires when leaving Models. Media categories preserve the text choice without applying hidden text filters. Audio and diffusion are category choices, not text engine filters.
- **Decision:** one request path uses the current selection, debounces typed searches and ignores stale results/errors. Engine identity participates even when two engines share a format. All engines merges managed catalogs by repository and preserves their providers. Remote search results retain server matching semantics; added local rows are searched locally.
- **Decision:** installed-model polling uses the existing shared polling clock, permits one scan per workspace executor across remounts, and retains its slot until both chat and media reads settle. A post-mutation refresh waits for an older scan then starts a fresh one. Raw chat rows are preserved for the Installed tab so distinct stores sharing an ID remain manageable.
- **Consequences:** filter controls, queries and results agree across tabs and ordinary reentry; storage denial falls back to session state. Snapshot-only renders do not launch scans. This bounds concurrent reads but does not change core's per-scan SHA-256 behavior. Preferences are browser-local and are not synchronized with the TUI.
- **Alternatives:** independently persisting child filters still allows request/filter divergence. An effect keyed to snapshot timestamps causes repeated scans; dropping the in-flight guard on the first failed subrequest permits overlap.
- **Owner:** team.
- **Links:** `packages/admin-ui/src/workspace/library/catalog/catalog-preferences.ts`, `useCatalogResults.ts`, `installed-model-read.ts`, `packages/admin-ui/src/workspace/useCatalogNavigation.ts`.
