---
date: 2026-11-04
title: "Keep browser attachment validation local"
---

# 2026-11-04 — Keep browser attachment validation local

- **Context:** ATOMIC-CHAT-SERVER-Y reported an unexpected browser action on 0.2.12. Rebuilding commit 5b2211cf09ea94e2687c24cdc11e542f079c8364 reproduced the event's asset filename index-IlGEdQb_.js; normal and hidden-map builds produced identical JavaScript bytes. A local hidden source map resolved 454:15302 to ChatAttachments.tsx:61:25: the expected refusal to attach an image to a model without vision. Throwing a plain Error routed this validation through describeError and POST /api/client-errors.
- **Decision:** Show the existing attachment count, file size, vision, image format and disabled-document messages directly in local component state and stop the operation. Unexpected failures continue through describeError and the existing privacy-preserving reporter. Do not publish source maps or transmit error messages, filenames, attachment contents or new context.
- **Consequences:** Input refusals remain visible without generating defect reports; attachments are not partially appended when validation fails. Tests observe the real client-report POST boundary, including continued sanitized reporting of unexpected failures.
- **Owner:** `team`.
- **Links:** `packages/admin-ui/src/workspace/chat/ChatAttachments.tsx`, `packages/admin-ui/src/workspace/chat/ChatAttachments.test.tsx`, https://atomic-chat.sentry.io/issues/ATOMIC-CHAT-SERVER-Y.
