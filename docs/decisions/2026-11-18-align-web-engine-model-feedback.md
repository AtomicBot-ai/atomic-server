---
date: 2026-11-18
title: "Share desktop engine marks and align model feedback"
---

# 2026-11-18 — Share desktop engine marks and align model feedback

- **Context:** The Web engine picker used one generic icon for several engines. A catalog verdict sat against the variant card, and the loaded label aligned with the top of its neighboring button.
- **Decision:** Use Atomic Chat's engine marks and initial-letter fallback in the picker and onboarding. Add breathing room below the variant controls and show model load progress and success in the same inline status slot.
- **Consequences:** Engine identities match across the two Web entry points. Compatibility reasons still come from the server and the loaded label still follows its service snapshot.
- **Alternatives:** Drawing new engine marks would diverge from Atomic Chat. Moving the loaded label to a separate line would move the content as model state changes.
- **Owner:** team.
- **Links:** `packages/admin-ui/LIFTED.md`, `packages/admin-ui/src/workspace/server/ServerModel.tsx`.
