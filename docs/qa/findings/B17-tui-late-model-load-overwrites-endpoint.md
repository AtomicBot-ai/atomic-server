# B17 — A late local-model load overwrites the endpoint selected afterward

- **Status:** Fixed locally and verified — [follow-up fix validation](../sessions/2026-10-29-tui-follow-up-fixes.md).
- **Priority:** P2.
- **Session:** [Pass 06](../sessions/2026-10-29-pass-06-tui.md).
- **Build:** Atomic Server 0.2.8, core 0.19.1; base `ec52295` plus uncommitted B14–B16 fixes, binary SHA-256 `b4bdce187c0e45bd2e51c9889428fc84ec91bbe532d8def6157b9aae45450653`.

## Minimal reproduction

1. Have an installed MLX checkpoint that takes several seconds to load. In Playground, choose it through the model picker.
2. While Loading model is visible, reopen the model picker and choose Connect an endpoint.
3. Save a different valid endpoint (the isolated repro uses `http://127.0.0.1:9/<unique-run>`).
4. Verify `tui.endpoint` contains that address and `tui.model` is empty immediately after Save.
5. Wait for the earlier local load to finish and inspect the config again.

The tested checkpoint is `mlx-community/LFM2.5-1.2B-Instruct-4bit`; it is unloaded before each attempt to ensure the load remains in progress while the endpoint is saved. The closed loopback port is deliberate: saving an endpoint is independent of whether its server is online.

## Expected and observed

The later explicit endpoint choice should win. Instead, completion of the older load saves the MLX model and resets `tui.endpoint` to the default local address (`http://127.0.0.1:1337/v1`). The current screen still says Choose model for the newer endpoint, while the durable settings now restore a local model on the next TUI launch. The old completion also replaces the connection-saved notice with Model loaded.

## Mechanism and scope

Evidence: [run 1 before](../evidence/2026-10-29-pass-06-tui/B17-1793288666-before.json), [after](../evidence/2026-10-29-pass-06-tui/B17-1793288666-after.json), [run 2 result](../evidence/2026-10-29-pass-06-tui/B17-1793288780-result.json), [screen after Save](../evidence/2026-10-29-pass-06-tui/B17-1793288780-saved-during-load.txt), [screen after completion](../evidence/2026-10-29-pass-06-tui/B17-1793288780-after-load.txt), [standalone PTY reproduction](../evidence/2026-10-29-pass-06-tui/B17-reproduce.py).

`selectLocalModel` has a freshness token invalidated by another model/engine selection. Saving an endpoint in `activate('save-edit')` does not invalidate it. The old load consequently reaches `persistModelSelection`, saves its model and unsets the newer endpoint. Relevant sources: `src/tui/workspace/chat/model-selection.ts` and `src/tui/workspace/actions.ts`.

This is independent of B16's missing MLX row/incorrect engine marker. No product code was changed for this finding. No known-good historical version was established, so no introducing commit or bisect result is claimed.

## Follow-up fix verification

Saving a validated endpoint starts a new selection revision and uses the same serialized preference queue as model choices. The new selection clears obsolete loading feedback; stale load callbacks and already-started writes cannot overwrite the final endpoint/model pair. Invalid URL input does not invalidate a valid pending load. Tests cover a deferred load, an already-started preference write and reverse completion order. On the final macOS binary, the endpoint was saved while real MLX was still loading; MLX subsequently became ready while the address, empty model choice and draft remained intact. [Passing result](../evidence/2026-10-29-tui-follow-up-fixes/B17-B18-result.json).
