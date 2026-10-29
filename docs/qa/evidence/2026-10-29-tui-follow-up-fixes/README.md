# Follow-up TUI fix evidence

Final macOS arm64 binary identity is in `build.json`. These captures contain synthetic QA data only. The original failing runs remain in `../2026-10-29-pass-06-tui/`.

The standalone probes require Python with `pyte` (temporary tooling installed in `/private/tmp/atomic-qa-pyte`, not a project dependency), an isolated `atomic-qa-*` workspace and metadata containing `binary`, `base` and `data`. They reject a data folder outside that fixture root. Start the matching QA server before replaying; no token needs to be printed or supplied in metadata.

- `verify-recovery.py metadata.json`: requires installed MLX, the retained LFM2.5 checkpoint selected in TUI and synthetic `base/notes.txt`. Replays missing-document/URL feedback, corrects the attachment, unloads and reloads real MLX, saves a new endpoint before readiness and asserts it survives completion with the draft. It leaves the new endpoint selected, writes `B17-B18-result.json` under `base/fixed-evidence`, and exits nonzero on a failed assertion.
- `verify-full-id.py metadata.json`: first select MLX through `engines.select`, restore the local TUI model and unset its custom endpoint. A ready MLX service supplies the strongest precondition. The probe starts a fresh TUI and checks the full-ID preference's current marker. `B16-full-id-result.json` records both marker and service readiness; exit 0 means the marker passed.
- `verify-tools.py metadata.json 20`: creates/updates only twenty synthetic `qa-pass06-*` skills, enables them, and tries Tab/arrows/wheel in wide Tools plus Tab in a compact popup. The result reports every reachable label for both sizes. The original probe's exit condition covers the wide last skill; the retained final result separately confirms all twenty narrow labels as well.

Each probe exits its TUI and reaps its own child. The server remains running until explicitly stopped. Maintained tests do not depend on these scripts, pyte, this local folder or real engine downloads.
