# B18 — Generic TUI editors hide save failures and can reveal a stale error after recovery

- **Status:** Fixed locally and verified — [follow-up fix validation](../sessions/2026-10-29-tui-follow-up-fixes.md).
- **Priority:** P2.
- **Session:** [Pass 06](../sessions/2026-10-29-pass-06-tui.md).
- **Build:** Atomic Server 0.2.8, core 0.19.1; macOS arm64; `ec52295` plus B14–B16 fixes.

## Minimal reproduction

1. Playground → + Files → + Document.
2. Enter a nonexistent short path such as `/private/tmp/atomic-qa-missing-document-pass06.txt` and press Enter.
3. Observe the editor. Replace the path with an existing synthetic text file and press Enter again.

Independent variant: Choose model → Connect an endpoint → enter `not-a-url` → Enter.

## Expected and observed

A failed confirmation should explain the error beside the retained input. Instead, the document editor remains open with the entered path and generic instructions, but no error. The invalid URL produces the same silent refusal. The underlying operations throw concrete errors (`ENOENT` and `Invalid URL`), verified by invoking the same exported helpers with the same inputs.

After correcting the document path, the attachment is successfully added (`Files 1`), but the previously hidden ENOENT message appears on the main chat screen. That warning now refers to the failed earlier input rather than the successful attachment. The short-path repeat rules out clipping as the cause of missing feedback.

## Mechanism and scope

Evidence: [document refusal](../evidence/2026-10-29-pass-06-tui/B18-after-invalid-document.txt), [successful attachment with stale error](../evidence/2026-10-29-pass-06-tui/B18-valid-document-recovery.txt), [URL refusal](../evidence/2026-10-29-pass-06-tui/B18-after-invalid-endpoint.txt), [underlying helper errors](../evidence/2026-10-29-pass-06-tui/B18-helper-errors.json), [result summary](../evidence/2026-10-29-pass-06-tui/B18-result.json), [PTY probe](../evidence/2026-10-29-pass-06-tui/B18-reproduce.py).

`WorkspaceApp` catches action failures into `state.message`. The normal status line in `workspaceFrame` renders that message only when no overlay is open. The generic endpoint/document editor in `drawOverlay` displays messages only for selected special cases (local model import and media), omitting these failures. Successful `documentAction` does not clear the stale message before closing the overlay.

This finding concerns feedback and recovery, not an accepted invalid endpoint or missing-file import. Valid document attachment works. No product code, maintained test or historical bisect was added in this discovery pass.

## Follow-up fix verification

The generic editor renders its action error inside the overlay, including document, image, endpoint and config edits. Pointer movement no longer clears that editor message. Opening an attachment editor and successfully adding a document clear the old message. Tests cover both terminal sizes, real Ink/service failures and a maintained binary PTY journey. Live missing-document and malformed-URL repros now show their errors; correcting the document path adds the file without the old ENOENT warning. [Passing result](../evidence/2026-10-29-tui-follow-up-fixes/B17-B18-result.json).
