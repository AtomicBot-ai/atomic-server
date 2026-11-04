---
date: 2026-11-04
title: "Classify selected package file refusals as usage"
---

# 2026-11-04 — Classify selected package file refusals as usage

- **Context:** The TUI skill import/export flow used untyped Errors for invalid selected files and an existing export target, producing ATOMIC-CHAT-SERVER-A. An earlier automated proposal failed validation and never changed main; the corresponding issue still described the patch as ready to release.
- **Decision:** Use ATC_USAGE for empty paths, non-files, bounded read limits, missing/invalid selected paths, permissions and exclusive-write EEXIST. Preserve the exclusive write and existing-file contents. Unexpected disk/resource failures retain the original error and remain reportable. Match the existing selected-document and image policy.
- **Consequences:** The person still sees the refusal and can correct their input. Only known input/path cases leave defect reporting; unrelated I/O failures are not hidden. Tests assert both telemetry exclusion and continued EIO reporting, and verify existing exports are not overwritten.
- **Owner:** `team`.
- **Links:** `src/terminal-service/files.ts`, `src/terminal-service/documents.test.ts`, https://github.com/AtomicBot-ai/atomic-server/issues/49.
