---
date: 2026-10-23
title: "Preserve setup choices and verify connections"
---

# 2026-10-23 — Preserve setup choices and verify connections

- **Context:** Changing a model inside agent setup reopened the initial onboarding stage. Saved provider settings looked connected without a check, and transfer controls were hidden behind a general menu.
- **Decision:** Keep model selection inside the current connection draft in both clients. Selecting an installed model, starting a download, cancelling selection, or retrying a failed plan returns to the same connection step with the agent and endpoint preserved. Use direct per-model download and deletion controls with explicit removal confirmation.
- **Consequences:** Pause retains partial files. Removing a download waits for its worker to stop, discards only files owned by that job, and preserves shared or installed assets. Installed models use separate deletion actions; running models must first be unloaded. Controls identify the durable job rather than its position in a changing list.
- **Connection checks:** `cloud.connect` requests the supplied OpenAI-compatible endpoint's model list with the supplied credential and checks the requested model IDs before registration. Pending requests show checking and prevent repeat submissions. A successful check stores only a public configuration fingerprint and timestamp. Older or changed registrations remain Configured; `cloud.save` and `cloud.remove` invalidate the receipt. The core does not expose saved credentials, so checking a protected connection again requires key re-entry. Native provider OAuth remains outside the core's supported registration protocol.
- **Progress and presentation:** Engine bars use the core's task-scoped progress events or snapshots, and show installation after byte transfer. Unknown totals remain indeterminate. Shared primary actions use a larger inverted surface. Terminal choice cards contain animated ASCII illustrations, respect the motion preference, and collapse at narrow terminal widths.
- **Alternatives:** Restarting onboarding discards context; optimistic Connected labels misrepresent validation; treating cancellation as deletion confuses resumable work with removal.
- **Owner:** team.
- **Links:** `docs/desktop-flow-parity.md`; desktop prototype `atomic-chat-ui` at `1c01e2a`.
