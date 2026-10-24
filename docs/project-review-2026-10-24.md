# Project review — 2026-10-24

## Executive assessment

**Overall: 7.5/10.** The engineering foundation is well above average: clear module boundaries, strict
TypeScript, a broad test strategy, and a deliberate release pipeline. The main blockers for privileged or
multi-user production use are two local privilege-escalation paths through a user-writable `atc` executable.
Documentation also needs to be brought back in sync with the implementation.

The review covered the architecture, maintainability, tests, CI/release automation, documentation, and a
static security review of the daemon, admin, host steps, services, updates, installers, credentials, and
related tests. The reviewed revision was `49c3f5d`. No exploit scenarios were executed.

| Area | Score | Assessment |
| --- | ---: | --- |
| Architecture | 9/10 | Clear process and module boundaries, shared contracts, separated policy and I/O |
| Maintainability | 8/10 | Rules are enforced, although parts of the TUI are becoming harder to change |
| Tests and CI | 8.5/10 | Six test layers, five operating systems in CI, useful behavioural coverage |
| Security | 6/10 | Strong admin/API controls, but privileged execution and session lifecycle need fixes |
| Documentation | 5/10 | Extensive and useful, but several pages describe an older implementation |
| Release and operations | 8/10 | Signed releases, attestations, packages, and smoke tests; platform gaps remain |

The repository contains approximately 29,000 lines of production TypeScript/TSX, 12,000 lines of tests,
150 test files, and 45 ADRs. These numbers describe scale, not quality by themselves.

## What is done well

### Architecture and code quality

- Module rules are enforced rather than merely documented: sibling imports go through `index.ts`, files
  are limited to 300 lines, `src/contract/` stays browser-safe, and runtime-specific code is rejected by
  lint and dedicated checks.
- The process model is coherent: short-lived CLI commands attach to one daemon, while the terminal UI,
  web admin, and MCP consume the same daemon-owned functionality.
- `src/main.ts` and `src/cli/` make command execution testable through injected I/O and dependencies.
  Policy code is generally separated from filesystem, process, network, and platform operations.
- The shared wire contract in `src/contract/` reduces type and behaviour drift between the CLI, TUI,
  browser, and MCP clients.
- The exactly pinned `@atomic-chat/core` dependency and the rule against copying core logic keep ownership
  of lock, engine, hardware, and model semantics explicit.
- Command specs drive help, completion, and generated command documentation. The stub registry is checked
  against the command tree instead of being maintained as an unrelated list.

### Security design

- The admin refuses non-loopback binding, checks the peer and `Host` header, requires a custom header and
  same-origin `Origin` for mutations, and exposes core operations through an allowlist.
- Admin tokens and session identifiers are cryptographically random. Token comparison is constant-time,
  and cookies are `HttpOnly` with `SameSite=Strict`.
- The browser never receives the core control token. Sensitive routes such as `/shutdown`, `/clients`, and
  host-step receipts are not exposed through the admin proxy.
- Host-step requests are bound to an operation revision, nonce, and digests. Request directories and files
  use restrictive permissions, and process execution uses argument arrays rather than shell interpolation.
- Updates use streamed checksum verification and atomic replacement. Signed macOS and Windows installations
  reject signature downgrades and signer changes.

### Tests and delivery

- Unit, contract, e2e, installer, runtime-compatibility, and browser UI tests have distinct responsibilities.
- Contract tests exercise a real `AtomicCore`; e2e tests exercise the built executable, including the TUI
  in a pseudo-terminal, daemon lifecycle, and self-update behaviour.
- Tests isolate data folders and avoid the network and real engines. Release downloads are simulated on
  loopback.
- CI covers Linux x64/arm64, macOS, and Windows x64/arm64. Runtime-compatibility tests run under both Node
  and Bun, and installer and workflow scripts have their own linters.
- The release pipeline uses native builds, pinned actions, signing, attestations, clean-package smoke tests,
  and staged publication.

## Priority findings

### High — a Windows system service can execute a user-writable file as SYSTEM

`serviceOptions()` passes the current `ctx.host.selfCommand` into the service definition
(`src/commands/service.ts:20-35`). `scheduledTaskXml()` writes that executable into `<Command>` and configures
a system task as `S-1-5-18` with `HighestAvailable` (`src/host/service-manager.ts:133-175`). The standard
installer places the executable under `%LOCALAPPDATA%\atc` (`scripts/install.ps1:50-52`).

If an administrator installs a system service from a user installation or source checkout, a later process
running as that user can replace the executable or script. The next boot or task restart executes the
replacement as SYSTEM. The executable's owner and ACL are not checked.

**Required direction:** run system services from an administrator-owned executable in a protected directory,
or refuse installation when the executable and its parent directories are not trusted. Add a regression test
for a user-writable executable path.

### High — elevation runs the current user-writable `selfCommand`

`elevatedCommand()` passes the current executable or script directly to `sudo`, `pkexec`, or Windows
`Start-Process -Verb RunAs` (`src/host/elevator.ts:88-116`), and `createElevator()` executes that command
(`src/host/elevator.ts:130-145`).

A process able to modify the user's `atc` installation can replace it before the user approves an expected
elevation prompt. The replacement runs with root/SYSTEM privileges before the helper's recipe and digest
checks are reached. The normal per-user installation locations satisfy the writable-path precondition.

**Required direction:** use a protected privileged helper, or reject elevation when the executable and its
parent directories are user-writable in an unsafe configuration. Checking only the request payload is not
sufficient because the executable runs first.

### Medium — Windows ACL restriction fails open

`startDaemon()` logs a `restrictToOwner()` failure and continues to initialize the keyring and admin token
(`src/daemon/daemon.ts:59-70,210-219`). On Windows, POSIX-style `0600` modes do not replace owner-only ACLs.
If the original directory has broad inherited permissions and ACL restriction fails, another local user may
be able to read API keys, the admin token, and chat data.

**Required direction:** fail daemon startup when private storage cannot be secured, with an actionable error.
A deliberately insecure mode, if ever added, should require explicit consent rather than being the fallback.

### Medium — logout and token rotation do not revoke issued sessions

`DELETE /api/session` only returns an expired browser cookie (`src/admin/bff.ts:188-190`); it does not remove
the server-side session. `SessionStore` has `revokeAll()` but no single-session revocation
(`src/admin/auth.ts:8-40`). `atc admin token --rotate` replaces the token without invalidating existing
sessions (`src/commands/admin.ts:58-68`).

A copied session cookie therefore remains usable after logout or token rotation, until daemon restart or
idle expiry. Successful requests continue to extend the idle window.

**Required direction:** revoke the presented session on logout and revoke all sessions on admin-token
rotation. Test both behaviours using a second client that retains the old cookie.

### Medium — Linux updates and bootstrap installation lack independent publisher authentication

The update and installer flows download a binary and `SHA256SUMS` from the same release source. On Linux,
both current and candidate binaries are treated as unsigned, and unsigned-to-unsigned replacement is allowed
(`src/update/trust.ts:20-38,42-52`). The shell and PowerShell installers verify the checksum but do not
independently authenticate the publisher.

An attacker who can replace release assets or control a configured trusted mirror can replace both the binary
and its checksum. This does not imply an ordinary HTTPS man-in-the-middle attack. Build provenance
attestations exist, but these flows do not verify them.

**Required direction:** verify a signature or attestation anchored in an independently configured trust root.
Keep checksums as integrity and corruption checks, not as the sole publisher-authentication mechanism.

### Low — daemon logs are not created with explicitly private permissions

`daemon.out.log` is opened without a restrictive mode (`src/daemon/spawn.ts:30-31`), and the daemon logger
creates its directory and files without one (`src/output/logger.ts:99,121`). The `atc` directory itself is
also created without an explicit POSIX `0700` mode (`src/daemon/daemon.ts:59`).

With a typical `022` umask and a traversable data-folder parent, other local users may read operational data,
paths, model names, host-step instructions, and error details. The review did not find evidence that admin or
control tokens are deliberately written to these logs.

**Required direction:** create private directories and logs with explicit modes and test their permissions.

## Documentation drift

Documentation is extensive, but several pages no longer describe the code:

- The README command table marks `models`, `engines`, `hardware`, and related commands as stubs, while
  `PLANNED` is empty (`src/cli/not-implemented.ts:19`). Only `config engine.*` remains in
  `PLANNED_PARTIAL`.
- `docs/roadmap.md` still lists API, service, update application, foreground start, and signing as future
  work even though implementations and tests exist.
- `docs/architecture.md` retains old iteration and hardware-override descriptions in some sections.
- `docs/admin-ui.md` and `packages/admin-ui/README.md` refer to a `src/routes/` structure that is absent;
  the current SPA is organised around `src/workspace/` and `src/containers/`.
- The CI table in `docs/testing.md` omits jobs and installer steps that exist in `.github/workflows/ci.yml`.

`docs/commands.md` was verified as current. Until the narrative pages are synchronised, command status should
be taken from the generated command documentation and the code rather than the README or roadmap.

## Maintainability risks

These are not release blockers, but they are useful next refactoring candidates:

- `src/admin/bff.ts` is close to the 300-line limit while route tables and handlers continue to grow. Split
  by route ownership before the limit forces mechanical movement of unrelated code.
- TUI actions use string identifiers dispatched across several modules. A mistyped identifier is primarily
  caught by tests, not the type system. A shared typed action registry would reduce that risk.
- TUI chat state and persistence are spread across immutable state updates and timed effects. This area is
  likely to become more expensive to modify as workflows grow.
- Coverage is reported but has no enforced thresholds, so a regression does not fail CI.
- Windows TUI behaviour remains a manual release check. Non-Linux service e2e is allowed to fail in CI, so
  launchd and Task Scheduler do not receive the same blocking guarantee as systemd.
- Release smoke tests cover startup and lifecycle rather than real inference. A small, explicit hardware-aware
  live-inference gate would validate the product promise without making ordinary tests download engines.

## Verification performed

The full `npm run verify` completed successfully using Node 22 and Bun 1.3.10:

- lint, runtime-agnostic checks, module-map check, TypeScript, and formatting;
- third-party notice and generated command-document checks;
- **866** unit and contract tests;
- **40** admin UI tests;
- TypeScript, SPA, and standalone-binary builds;
- **13** e2e tests;
- **5** runtime-compatibility tests under Node;
- **16** Linux installer tests.

The runtime-compatibility suite was also run directly under Bun: **5 passed**. Coverage for the unit and
contract projects was **83.74% lines, 80.02% branches, and 86.78% functions**.

The local Linux run skipped Windows installer tests, the opt-in service e2e that changes the machine, and
other platform-specific cases. Real model inference across operating systems and GPUs was not exercised.
These results demonstrate the tested plumbing, not universal hardware or inference correctness.

## Recommended order of work

1. **Before privileged production:** protect the executable used by system services and elevation; make
   Windows private-storage ACL failures fatal.
2. **Next security pass:** revoke sessions on logout and token rotation; add independent publisher
   authentication for Linux updates and bootstrap installers; make log permissions private.
3. **Restore a reliable project narrative:** synchronise README, roadmap, architecture, admin-ui, and testing
   documentation with the implementation.
4. **Reduce remaining regression risk:** add coverage thresholds and strengthen Windows TUI and non-Linux
   service automation. Add an explicit live-inference validation path for supported hardware.

## Conclusion

The project does not look like a disposable CLI prototype. Its boundaries, tests, operational tooling, and
release discipline provide a strong base for a maintained product. The current gap is not general code
quality: it is the combination of privileged-execution trust, a few session/storage edge cases, stale
narrative documentation, and incomplete platform-level validation. Fixing those issues would materially
improve production readiness without requiring an architectural rewrite.
