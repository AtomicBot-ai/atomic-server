# B02 — An accepted API prefix can break every endpoint with HTTP 404

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P2.
- **First observed:** [2026-10-29, pass 01](../sessions/2026-10-29-pass-01.md).
- **Reproduction evidence:** confirmed by live request and differential browser chat.
- **Environment:** Atomic Server 0.2.8, core 0.19.1, product commit `41cc1f776e31`, admin build `8c7fb29570b81ff1`; macOS 26.6.2 arm64, Apple M4 Max, 48 GiB; Codex in-app browser.

## Reproduce

1. Set Server > Configuration > API prefix to /qa v1.
2. Save changes; start API and load a model.
3. Send a chat request.
4. Restore /v1 and regenerate the same prompt.

## Expected

Reject an unusable prefix, or consistently encode/decode and serve it.

## Observed and impact

Save reports success. The authenticated /models endpoint and Playground return HTTP 404. Restoring /v1 makes the same model answer successfully.

## Mechanism

The browser only checks that the prefix starts with /. The saved literal space does not match the encoded request pathname.

## Source pointers

- [packages/admin-ui/src/workspace/server/ServerConfiguration.tsx:70](../../../packages/admin-ui/src/workspace/server/ServerConfiguration.tsx#L70)

## Evidence

- [prefix-chat-404.png](../evidence/2026-10-29-pass-01/prefix-chat-404.png)
- [chat-real-success.png](../evidence/2026-10-29-pass-01/chat-real-success.png)

## Resolution

No fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed.

The implementation is in [api-prefix.ts](../../../src/workspace-view/api-prefix.ts); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
