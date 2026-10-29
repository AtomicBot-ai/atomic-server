# B08 — PTY test helper lets inherited TERM=dumb disable the terminal UI

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P2 — test infrastructure; not an end-user terminal UI defect.
- **First observed:** [2026-10-29, pass 02](../sessions/2026-10-29-pass-02.md), during repository validation.
- **Environment:** macOS 26.6.2 arm64, Node/Vitest, Python pseudo-terminal, built Atomic Server 0.2.8 / core 0.19.1 / build `609ce03db0f1`; parent `TERM=dumb`. Product source is unchanged from the interactive QA build `41cc1f776e31`.

## Reproduce

1. Build the binary with the normal repository build steps.
2. Run `TERM=dumb npx vitest run --project e2e test/e2e/tui-flows.test.ts`.
3. Compare `TERM=xterm-256color npx vitest run --project e2e test/e2e/tui-flows.test.ts` on the same binary without source changes.

## Expected

The PTY helper configures the promised xterm-compatible pseudo-terminal independently of the noninteractive parent shell. Both journeys should enter the terminal UI.

## Observed and impact

With inherited `TERM=dumb`, both journeys receive the CLI help instead of the terminal UI, and both fail. Repeated separately after the full e2e run with the same result. With parent `TERM=xterm-256color`, both pass (2/2) without source or binary changes. This makes verification fail for an environment reason unrelated to the behaviors under test.

## Mechanism

`runPty` constructs `env: { TERM: 'xterm-256color', NO_COLOR: '1', ...env }`. The caller's environment is spread last and overwrites TERM with `dumb`. The application correctly declines to open the terminal UI in that environment. The other terminal journey helper sets TERM after spreading the inherited environment and passes in the same overall test run.

## Source pointers

- [PTY environment construction](../../../test/helpers/pty-driver.ts#L108).
- [Journeys passing the parent environment](../../../test/e2e/tui-flows.test.ts#L19).
- [Intended application behavior for TERM=dumb](../../../src/cli/default-command.ts#L17).

## Evidence

- [Repeated two-test failure](../evidence/2026-10-29-pass-02/B08-inherited-dumb-failure.log).
- [Same two tests pass with explicit terminal type](../evidence/2026-10-29-pass-02/B08-explicit-terminal-pass.log).

## Resolution

No fix applied. Setting TERM for a diagnostic run is a control, not a fix to the helper. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed by repeated failure and a passing environment control.

The implementation is in [pty-driver.ts](../../../test/helpers/pty-driver.ts); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
