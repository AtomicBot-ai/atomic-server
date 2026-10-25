---
date: 2026-10-22
title: "Adapt the redesigned desktop flows to Atomic Server"
---

# 2026-10-22 — Adapt the redesigned desktop flows to Atomic Server

- **Context:** The user selected the new `atomic-chat-ui` desktop redesign as the canonical reference, including onboarding, server guides, contextual sidebars, settings and a secondary Playground. An earlier engine-first setup and navigation-only adaptation did not meet that requirement.
- **Decision:** Use model-first onboarding: welcome, installed/catalog models, optional permissions, cloud connections, optional media, agent/endpoint setup. Keep Back and Skip actions and server-owned background downloads. Engine-first setup remains an explicit Advanced setup path for managed runtimes and Foundry Local. The shared navigation and first-run descriptors name the same sections in both clients. Wide terminals use a contextual sidebar; compact terminals expose the same sections through a menu, with focus hints and keyboard actions.
- **Server guide:** Choose agent/endpoint → port or agent choice → model/engine review → load → API key → listener → real inference verification → connection details. The full desktop agent/editor catalog is present. Four existing supported launch profiles use `connection.profile`; other clients get manual endpoint/key/model handoff. Success means a prepared connection, never a claim that an external agent has launched. Retrying a failure returns to review.
- **Settings and remote access:** Web and terminal stage configuration edits and offer Save changes/Discard. Saving listener settings restarts a running API. LAN access changes the API host; public remote access uses the core's Cloudflare tunnel state, start/stop controls and URL. These are separate controls, not aliases.
- **Cloud:** Add `cloud.list`, `cloud.save`, `cloud.remove` to the typed operation registry and forward them to the core. The core owns provider registration and credentials. Forms mask keys and clear entered keys after saving; provider read views contain only `has_api_key`. The admin remains authenticated. No provider requests are made merely by saving a registration.
- **Desktop-specific adaptations:** There is no chat destination. OS microphone/file permissions belong to agents on their own devices; first-run permissions explain that and can be skipped. No simulated model transfers, made-up hardware, email reminders, or automatic external-agent installs are copied. Playground remains an explicit test workspace.
- **Consequences:** Existing jobs and configuration remain readable. No dependency or core implementation is copied. The source reference is the local desktop redesign based on `c9fa1e66`, including its working-tree preview changes; this is distinct from upstream desktop `784278ad`. Tests cover navigation, skip/back, reviewed downloads, interrupted transfers, endpoint validation, failed verification, cloud credential handling and config drafts.
- **Owner:** team.
- **Links:** `src/contract/desktop-flows.ts`; `src/contract/workspace-navigation.ts`; `packages/admin-ui/LIFTED.md`; `docs/desktop-flow-parity.md`.

## Simplification requested after review

First run opens model selection directly. The welcome and unavailable client-permission screens are removed. The default model dialog resolves its recommended file and download plan automatically, then shows size and one Download action; variants and technical details stay in optional disclosures. Errors and download authorization remain explicit. Terminal progress omits engine checklists, transfer-method explanations and rotating tips.

## Launch intro

At the owner's explicit request, each web workspace mount and interactive TUI launch opens an animated Atomic Chat intro with “Press any key” and “Local intelligence. On your terms.” This is a dismissible presentation screen, separate from onboarding and its saved state. Any ordinary key or click continues without forwarding that input into setup or a command. Ctrl+Q/Ctrl+C still quit the terminal. Browser reduced-motion preferences and the terminal motion setting disable animation. Returning from an external agent resumes the server without replaying the intro. Noninteractive CLI commands do not show an intro. The web uses the selected desktop's real logo; the terminal uses an ASCII interpretation of its eight-arm silhouette.
