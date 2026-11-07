---
date: 2026-11-07
title: "Separate state labels from actions and own file-picker copy"
---

# 2026-11-07 — Separate state labels from actions and own file-picker copy

- **Context:** The active engine build looked like another action button. Native file inputs displayed browser-localized captions inside the English UI, even with `lang="en"`.
- **Decision:** Reuse a compact text-and-dot status indicator for active builds, loaded models, provider and connector connections, and default assistants. Keep build identity and status together, with activation/removal actions separate. Use one English file-picker trigger and filename display over a hidden native input. Format UI dates with an explicit English locale.
- **Consequences:** Status remains readable without color and does not add a keyboard stop. File selection retains native OS behavior, disabled states, asynchronous reads and same-file retries. Menus must keep the picker mounted until selection and exclude hidden inputs from keyboard navigation. OS dialogs, user filenames/content and external diagnostic text retain their original language.
- **Alternatives:** Styling a disabled button still suggests an action. Styling only `::file-selector-button` cannot control the browser's localized empty-file caption; setting the document language alone does not control native captions either.
- **Owner:** team.
- **Links:** `packages/admin-ui/src/workspace/StatusIndicator.tsx`, `packages/admin-ui/src/workspace/FileInput.tsx`.
