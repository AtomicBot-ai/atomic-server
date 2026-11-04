---
date: 2026-11-04
title: "Classify selected image refusals as usage"
---

# 2026-11-04 — Classify selected image refusals as usage

- **Context:** The terminal image picker reported empty paths, directories, missing files, unsupported formats and oversized images as unexpected workspace failures. These are actionable user input refusals rather than application defects.
- **Decision:** Return ATC_USAGE with a specific instruction for those refusals and selected-path permission errors. Preserve unexpected filesystem/resource errors as reportable failures. Keep the existing byte limit and magic-byte format detection.
- **Consequences:** The UI can explain how to choose a readable supported image without sending an expected refusal to Sentry. Valid images still become bounded data URLs; unexpected disk failures remain visible.
- **Owner:** `team`.
- **Links:** `src/terminal-service/media.ts`, `src/terminal-service/media.test.ts`, PR #75.
