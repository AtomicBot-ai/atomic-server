---
date: 2026-11-02
title: "Diagnose native segmenter failures without collecting text"
---

# 2026-11-02 — Diagnose native segmenter failures without collecting text

- **Context:** ATOMIC-CHAT-SERVER-N is one fatal Windows x64 event on atc 0.2.9. Ink's
  asynchronous renderer reaches string-width 8.3.0, then native `Intl.Segmenter.segment` throws
  TypeError. The process exits 1. Our privacy boundary removes its original message; no breadcrumbs
  identify the trigger. The frame identifies the native call, not its cause or the input text.
- **Decision:** Before scrubbing, map two exact TypeError messages from the WebKit revision embedded
  in Bun 1.3.10 to finite `native_failure` tags: `JSC_INTL_SEGMENTS_INIT_FAILED` and
  `JSC_INTL_SEGMENTER_BAD_RECEIVER`. Keep the scrubbed message, stack frames, fatal severity, consent,
  and exit behavior. Other messages, including messages with added content, receive no diagnostic.
  Exercise synthetic Unicode, combining characters, emoji and malformed UTF-16 through Ink under
  Node, Bun and a compiled probe with release flags. Windows x64 CI prepares both default and
  baseline compilers before tests; `ATC_TEST_BASELINE_BUN` supplies the local baseline executable
  through `--compile-executable-path`, so the test never downloads a cross-compilation runtime.
- **Consequences:** A future matching event distinguishes iterator/text initialization failure from
  an invalid receiver without uploading prompts or rendered text. Initialization still combines ICU
  clone and setText failures because WebKit gives them the same message. This is diagnostic work,
  not a crash fix: the historical message cannot be recovered, other errors remain unclassified,
  and the synthetic probe does not reproduce the user's session or the asynchronous debounce path.
  On macOS arm64, Bun 1.3.10 passed 65,536 sampled Unicode code points and 300,000 repeated synthetic
  width/segmentation probes with stable RSS after warmup. Native Windows qualification remains CI work.
- **Alternatives:** A Bun upgrade is unsupported by evidence: the similar upstream #32133 is a native
  segmentation fault on 1.3.14, unlike our reported TypeError. Replacing segmentation, retrying native
  failures or treating all renderer TypeErrors as expected would guess at recovery. Collecting arbitrary
  exception messages or screen contents would weaken the established privacy boundary.
- **Owner:** team.
- **Links:** [Sentry N](https://atomic-chat.sentry.io/issues/7824520682/),
  [pinned WebKit segment implementation](https://github.com/oven-sh/WebKit/blob/0ddf6f47af0a9782a354f61e06d7f83d097d9f84/Source/JavaScriptCore/runtime/IntlSegmenter.cpp),
  [pinned receiver check](https://github.com/oven-sh/WebKit/blob/0ddf6f47af0a9782a354f61e06d7f83d097d9f84/Source/JavaScriptCore/runtime/IntlSegmenterPrototype.cpp),
  [different upstream crash](https://github.com/oven-sh/bun/issues/32133).
