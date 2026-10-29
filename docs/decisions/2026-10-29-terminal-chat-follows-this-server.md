---
date: 2026-10-29
title: "Terminal chat follows this server, and saves it as no address of its own"
---

# 2026-10-29 — Terminal chat follows this server, and saves it as no address of its own

- **Context:** The 0.2.7 end-to-end retest, N02 (High): on a clean profile with API port 62732 set up from
  the Web, the terminal Playground answered HTTP 503, and its endpoint editor showed
  `http://127.0.0.1:1337/v1`. There were two causes. First, the terminal took this server's address only
  when `tui.endpoint` had the source `default`, but any config edit writes the whole file, defaults
  included, so the default endpoint read back from the file looked like a choice of port 1337. `atc chat`
  already treated a saved default as "this server". Second, the terminal resolved this server's address
  once, from its own config, and saved it as a literal `tui.endpoint` when a local model was chosen or
  setup finished. A later port change from another client (or a port set only in the server's
  environment) left that address behind. The 0.2.5 fixes (`2026-10-28-e2e-0.2.5-fixes.md`) named this
  drift as its own fix.
- **Decision:** "This server" is a choice of its own, not an address. `followsLocalServer` (terminal
  service) is the one rule: `tui.endpoint` at its default, unless an `ATC_TUI_ENDPOINT` names it. The
  terminal and `atc chat` both use it. The terminal keeps `endpointFollowsServer` in its state: while it is
  set, each workspace snapshot sets the endpoint to the address the server reports. A turn goes through
  the server (`chat.start`), this server's key lists its models, and readiness is this server's. Choosing a
  local model or finishing setup unsets `tui.endpoint` instead of saving an address. Typing an endpoint
  saves it as written and stops following.
- **Consequences:** A port change from the Web, `atc config set` or the server's environment reaches the
  terminal within one snapshot poll (2.5 s), with no restart and no reselection. An address saved by
  0.2.7 or earlier (a literal `tui.endpoint` written when a local model was chosen) is still read as a
  choice. It keeps working while the port stays the same; after a port change, choosing the local model
  again saves it the new way. `tui.endpoint` set to the default on purpose, to reach the Atomic Chat
  desktop app on 1337, means this server unless it comes from `ATC_TUI_ENDPOINT`, as it already did for
  `atc chat`.
- **Alternatives:** Treating any saved endpoint equal to the server's current address as this server would
  also have caught addresses saved by 0.2.7. It would silently turn an `ATC_TUI_ENDPOINT` that names this
  server on purpose into "follow it" and then unset a key the environment overrides. A new config value,
  such as an empty endpoint meaning "this server", would need a migration and would change `atc config
  list` output for every installation. Re-reading the terminal's own config before each turn would still
  miss a port set only in the server's environment, and an API not yet restarted on the new port.
- **Owner:** `team`.
- **Links:** `src/terminal-service/local-endpoint.ts`, `src/tui/workspace/runtime/shared-state.ts`,
  `src/tui/workspace/chat/model-selection.ts`, `src/tui/workspace/controller.ts` (`chat`).
