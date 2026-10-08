---
date: 2026-10-08
title: "Keep model selection in chat and make onboarding one-time"
---

# 2026-10-08 — Keep model selection in chat and make onboarding one-time

- **Context:** Composer pickers take users away from their draft, and adding another model reopens numbered first-run setup. Completing a later installation can overwrite the only record that onboarding was completed.
- **Decision:** Anchor compact, scrollable engine and model menus above the composer, with the current choice marked, short descriptions and secondary actions. Read real local models, endpoint models and compatible engine builds. Engine selection installs missing builds through Core and reloads a compatible current model; its preference lives separately from installation progress. Preserve a permanent `onboarded` flag when replacing an installation manifest, migrate existing completed manifests on the next install, and show subsequent downloads in Models without the onboarding stepper.
- **Consequences:** Drafts remain visible and intact; mouse, Tab/arrows and Enter share menu targets, with Escape or an outside click dismissing the menu. Standard and wide layouts show a Recents sidebar with a prominent New chat action. History remains accessible through Ctrl+P and the main menu. The composer uses filled terminal-cell blocks around its tinted surface. Ink negotiates the Kitty keyboard protocol for Shift+Enter, also accepting legacy modified-Enter signals; Alt+Enter remains supported. No global terminal settings are changed.
- **Validation:** Returning-user startup and restart-during-download tests, engine installation and selection tests against the Core link contract, popup bounds and scrolling tests, mouse/keyboard tests, and a Shift+Enter multiline-send test. Full CLI verification and Node/Bun runtime checks, plus actual PTY previews.
- **Links:** Claude desktop's live model menu was inspected as the interaction reference. [Terminal key behaviour](https://code.claude.com/docs/en/terminal-config) depends on the terminal reporting modified Enter distinctly.
- **Owner:** @plombeer31.
