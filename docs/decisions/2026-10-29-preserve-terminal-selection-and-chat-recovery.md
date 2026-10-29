---
date: 2026-10-29
title: "Preserve terminal choices and recover refused chat turns"
---

# 2026-10-29 — Preserve terminal choices and recover refused chat turns

- **Context:** TUI QA found three independent client defects (B14–B16): returning from Permissions recreated the first-model view and reset its radio choice; a rejected stale chat turn left an optimistic message that blocked reopening and normal exit; the engine picker omitted MLX and retained the previous engine after selecting an MLX model.
- **Decision:** Keep the first-model key in the workspace state, outside the disposable setup view, and reconcile a catalog key with its installed model when a background download completes. Roll back a failed turn only when no answer or tool call arrived, restoring the submitted draft and attachments. Treat the loaded/saved conversation as the full persistence baseline: skip unchanged writes and replace the baseline with the canonical saved object after each successful save. Reopening that same chat retains the draft. Include MLX only when core registers it, update and persist the engine with a successful local model choice, and use the core-reported active build to mark a provider-only preference.
- **Consequences:** Back/Continue preserves intent; a stale refusal can recover without overwriting another client's history; MLX is selectable and accurately marked. A genuinely unsaved partial transcript still uses revision-checked persistence and refuses conflicting writes. Wizard selection is retained during the current UI session, not as a new durable setup document. Core remains responsible for engine availability, build activation and model compatibility.
- **Alternatives:** Keeping the choice inside `SetupView` loses it whenever that view is recreated. Retaining the optimistic user turn makes a failed send look like an unsaved transcript; bypassing history revision checks would instead reintroduce data loss. Guessing a llama.cpp build or writing core settings directly would duplicate core policy and skip activation semantics.
- **Owner:** team.
- **Links:** [B14](../qa/findings/B14-tui-back-resets-first-model.md), [B15](../qa/findings/B15-tui-stale-chat-cannot-reopen-or-exit.md), [B16](../qa/findings/B16-tui-engine-picker-cannot-represent-MLX.md), [shared chat policy](2026-10-29-chats-reach-the-other-client.md).
