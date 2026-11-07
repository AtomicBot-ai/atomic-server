---
date: 2026-11-07
title: "Clarify chat tools, assistant settings and model selection"
---

# 2026-11-07 — Clarify chat tools, assistant settings and model selection

- **Context:** Chat tools mixed headings, controls and empty states without spacing. Assistant settings separated the create action from the heading and exposed an unusable delete action for the built-in profile. The chat model menu nested a second selector and a separate load button, without explaining which engine would load a model.
- **Decision:** Give the tools dialog distinct sections and a fixed completion footer; keep long assistant choices in the scrollable body. Give assistant settings a dedicated heading, default control and saved-profile list. Show active and downloaded models as separate lists under one search; each downloaded row names its engine and directly requests loading, with pending, failure and read-retry feedback.
- **Consequences:** The existing workspace operations remain unchanged. Loading does not silently select a different ready model; users select the requested model once it becomes available in the session list. The model menu scrolls as one surface on short screens and uses viewport bounds when there is insufficient space beside its trigger. Styles are scoped to these surfaces, with consistent 12/14/18/24 px text and 8/16/24 px spacing.
- **Alternatives:** Increasing global heading margins would affect unrelated screens and leave the model selection flow ambiguous. Replacing every settings page was outside this change.
- **Owner:** team.
- **Links:** `packages/admin-ui/src/workspace/chat/FeatureDialog.tsx`, `packages/admin-ui/src/workspace/chat/ChatModelPicker.tsx`, `packages/admin-ui/src/workspace/chat/InstalledLoad.tsx`, `packages/admin-ui/src/workspace/server/features/AssistantsSettings.tsx`.
