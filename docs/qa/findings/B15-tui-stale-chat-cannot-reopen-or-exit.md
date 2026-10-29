# B15 — A refused stale TUI turn cannot recover by reopening, New chat or Quit

- **Status:** Fixed locally on `ec52295` plus uncommitted TUI fixes; see [fix validation](../sessions/2026-10-29-tui-fixes.md).
- **Priority:** P2 (recovery blocked; newer durable messages remain safe).
- **Session:** [Pass 05](../sessions/2026-10-29-pass-05-tui.md).
- **Build:** Atomic Server 0.2.8, core 0.19.1, binary `add2a30be85b`, macOS arm64, 120×40 PTY. [Identity](../evidence/2026-10-29-pass-05-tui/build-identity.json).
- **Related finding:** B03's stale overwrite is prevented; this is failure to recover from its expected refusal.

## Reproduce

1. Open a saved conversation in the TUI with a ready local model and API.
2. Type a new draft. Through another authenticated client, append and save a turn.
3. Before the TUI's next history poll, send the typed draft.
4. After the conflict error, click the same conversation in Recents, try New chat, and press Ctrl+Q.

The repeatable [PTY repro](../evidence/2026-10-29-pass-05-tui/B15-reproduce.py) requires an already onboarded, disposable `atomic-qa-*` data folder and a loaded `mlx-community/LFM2.5-1.2B-Instruct-4bit` model. Run with `python3 B15-reproduce.py --binary /absolute/path/to/atc --data-folder /absolute/path/to/atomic-qa-fixture/data`. Exit 1 means its recovery oracle failed; setup/driver failures are distinct exceptions. It creates its own synthetic conversation and closes only its own terminal child. No product fix or maintained regression test was added during discovery; subsequent fixes are documented in the validation link above.

## Expected

The refusal should preserve the draft and offer a working route to the newer saved chat. Following “Reopen it before retrying” should load the latest revision; New chat and normal Quit should remain usable without overwriting another client's work.

## Observed and impact

The draft is restored, but the failed user message remains appended to the local transcript. Polling consequently treats the transcript as an unsaved local edit and never adopts the newer saved revision. Reopen, New chat and Ctrl+Q all try to persist that same stale transcript before proceeding, fail with the same conflict, and leave the terminal in place. The normal exit path is blocked; forced process termination discards the unsaved draft. The backend correctly preserves the newer durable history in every repetition.

## Evidence and mechanism

- [Ten-run results](../evidence/2026-10-29-pass-05-tui/B15-repeat-results.json): each run has `reopen_shows_newer=false`, `new_chat_opened=false`, `quit_exited=false`, `durable_history_unchanged=true`, `draft_visible=true`.
- [First run conflict](../evidence/2026-10-29-pass-05-tui/B15-run-1/01-conflict.txt), [reopen](../evidence/2026-10-29-pass-05-tui/B15-run-1/02-reopen.txt), [New chat](../evidence/2026-10-29-pass-05-tui/B15-run-1/03-new-chat.txt), [Quit](../evidence/2026-10-29-pass-05-tui/B15-run-1/04-quit.txt), [unchanged newer history](../evidence/2026-10-29-pass-05-tui/B15-run-1/durable.json). The tenth run is retained alongside it.

`failedTurn` drops only the empty assistant, retaining the locally appended user turn; `savedConversationChange` keeps an unsaved transcript; `persistConversation` precedes history navigation, New chat and normal Quit. Together they make the error's recovery advice unreachable. Source: `src/tui/workspace/chat/failed-turn.ts`, `src/workspace-view/chat/saved-conversation.ts`, `src/tui/workspace/server/data-actions.ts`, `src/tui/workspace/actions.ts`, `WorkspaceApp.tsx`.

No known-good release was established and no historical bisect was attempted. These are live reproductions against the QA-fix binary, not a claim that the underlying overwrite still occurs.
