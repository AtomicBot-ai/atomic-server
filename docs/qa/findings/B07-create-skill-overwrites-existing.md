# B07 — Creating a skill with an existing name silently replaces its instructions

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P2.
- **First observed:** [2026-10-29, pass 02](../sessions/2026-10-29-pass-02.md).
- **Environment:** Atomic Server 0.2.8, core 0.19.1, product commit `41cc1f776e31`, admin build `8c7fb29570b81ff1`; macOS 26.6.2 arm64; interactive Codex in-app browser; fresh isolated workspace.

## Reproduce

1. Open Settings > Skills > Create new skill > Write skill instructions.
2. Create `qa-skill-beta` with instructions `BETA_ORIGINAL`.
3. Use Create new skill > Write skill instructions again.
4. Enter the same name, `qa-skill-beta`, and instructions `BETA_REPLACED_BY_CREATE`.
5. Save without using the existing skill's Edit action.

## Expected

Creating a new skill must reject an existing name or explicitly confirm replacement before overwriting saved instructions. Editing an existing skill is already available as a separate action.

## Observed and impact

The Add skill dialog closes without warning. Only one `qa-skill-beta` remains, now containing `BETA_REPLACED_BY_CREATE`; its original instructions are gone from the durable feature document. Repeated with `qa-skill-alpha`, where the description was also overwritten.

Ordinary Edit > Cancel correctly preserves the saved body and Enabled state; the defect is specifically the create/name-collision path.

## Mechanism

The shared `skills.save` handler accepts create and edit as the same upsert. It removes existing entries whose names match `next.name` and appends the new value, without requiring an existing ID or confirmation of replacement.

## Source pointers

- [Feature document mutation](../../../src/workspace-service/features/feature-document.ts#L124).

## Evidence

- [Original beta skill](../evidence/2026-10-29-pass-02/B07-original-beta.png).
- [Repeated replacement of beta](../evidence/2026-10-29-pass-02/B07-overwritten-beta.png).
- [Replacement of alpha](../evidence/2026-10-29-pass-02/B07-overwritten-skill.png).
- [Saved skill records](../evidence/2026-10-29-pass-02/B07-saved-skills.json).

## Resolution

No fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed twice.

The implementation is in [feature-document.ts](../../../src/workspace-service/features/feature-document.ts); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
