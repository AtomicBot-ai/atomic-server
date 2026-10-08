# Engineering Decisions (ADR)

One decision per file. Append-only: never edit or delete an existing record — if a decision is reversed,
add a new one that says which record it supersedes.

**Adding a record**

1. Copy `_TEMPLATE.md` → `docs/decisions/YYYY-MM-DD-short-slug.md` and fill it in.
2. Add one line to this index.
3. Do **not** paste the record body into `AGENTS.md`.

## Records

- **2026-09-24** — [Adopt atomic-chat-core as an embedded library and single binary](2026-09-24-adopt-atomic-chat-core-as-an-embedded-library-and-single-binary.md) — the core is an exactly pinned dependency compiled into `atc`; never copy its logic, request an export.
- **2026-09-24** — [Embed the admin UI as a generated module](2026-09-24-embed-the-admin-ui-as-a-generated-module.md) — gzipped assets in `static-assets.generated.ts`, a placeholder when the SPA is not built.
- **2026-09-24** — [Hand-rolled command specs on parseArgs](2026-09-24-hand-rolled-command-specs-on-parseargs.md) — help, docs and completion render from one spec; stubs exit 3.
- **2026-09-24** — [Copy and adapt the desktop web app for the admin UI](2026-09-24-copy-and-adapt-the-desktop-web-app-for-the-admin-ui.md) — provenance headers instead of a shared package, with the trigger for revisiting.
- **2026-09-24** — [The CLI is the host for managed runtimes](2026-09-24-the-cli-is-the-host-for-managed-runtimes.md) — the helper is the same binary, file-based request and result, elevation strategies, never the control API.
- **2026-09-24** — [Add an optional terminal UI](2026-09-24-add-an-optional-terminal-ui.md) — `atc tui` on Ink as a second front end over the daemon, plain commands stay primary; narrows the TUI exclusion in the parseArgs record.
- **2026-09-24** — [Use Bun as the package manager](2026-09-24-use-bun-as-the-package-manager.md) — `bun.lock` and `bun install --frozen-lockfile` as in the core; Node 22 still runs the tests, scripts stay `npm run`.
- **2026-09-25** — [Open the terminal UI by default on a terminal](2026-09-25-open-the-terminal-ui-by-default-on-a-terminal.md) — bare `atc` on an interactive terminal opens the Ink UI (Overview, Logs, Config, Doctor now; more screens per iteration), help everywhere else; supersedes the optional-TUI record.
- **2026-09-25** — [Name the product Atomic Server and align the commands with the app](2026-09-25-name-the-product-atomic-server-and-align-the-commands-with-the-app.md) — `atc` is the command, Atomic Server the product; `run`/`unload` a model, `start`/`stop` the server; `serve`, `setup`, `models load`/`unload` removed; `docs/concepts.md` is the vocabulary.
- **2026-10-08** — [Shared terminal chat and API operations](2026-10-08-shared-terminal-operations.md) — public model discovery and streaming, explicit API lifecycle, and terminal preferences.
- **2026-10-08** — [Responsive terminal workspaces](2026-10-08-responsive-terminal-workspaces.md) — four primary destinations, shared keyboard/mouse geometry, and adaptive character art.

- [Gate terminal entry on real model setup](2026-10-08-gate-terminal-entry-on-real-model-setup.md)
- **2026-10-08** — [Browse Atomic Chat models and bound setup waits](2026-10-08-browse-models-and-bound-setup-waits.md) — curated discovery, Atomic quant priority, TurboQuant, immediate progress, and cancellable preparation.
- **2026-10-08** — [Confirm choices and open installed models](2026-10-08-confirm-choices-and-open-models.md) — direct confirmation, automatic loading, consistent focus and the turquoise theme.

- **2026-10-08** — [Simplify terminal framing and compare header ornaments](2026-10-08-simplify-terminal-framing.md).
- **2026-10-08** — [Emphasize the composer and unify terminal hints](2026-10-08-emphasize-composer-and-unify-hints.md).
- **2026-10-08** — [Frame the composer and bound the eye](2026-10-08-frame-the-composer-and-bound-the-eye.md).
