# Engineering Decisions (ADR)

One decision per file. Append-only: never edit or delete an existing record — if a decision is reversed,
add a new one that says which record it supersedes.

**Adding a record**

1. Copy `_TEMPLATE.md` → `docs/decisions/YYYY-MM-DD-short-slug.md` and fill it in.
2. Add one line to this index.
3. Do **not** paste the record body into `AGENTS.md`.

## Records

- **2026-10-24** — [Show engine update results before offering installation](2026-10-24-show-engine-update-results.md) — shared update feedback, explicit install offers, and Save only for changed settings.

- **2026-10-24** — [Separate model selection from load status](2026-10-24-separate-model-selection-from-load-status.md) — qualified local badges and immediate terminal selection with pending/error feedback inside the composer.

- **2026-10-24** — [Keep waiting controls and navigation reachable](2026-10-24-keep-waiting-controls-and-navigation-reachable.md) — local email confirmation, shared header download status, and focus-following compact terminal controls.

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
- **2026-10-08** — [Simplify the header and animate the eye](2026-10-08-simplify-header-and-animate-eye.md).
- **2026-10-08** — [Keep model selection in chat and make onboarding one-time](2026-10-08-keep-model-selection-in-chat.md).
- **2026-10-09** — [Order recent chats by message activity](2026-10-09-order-recents-by-message-activity.md).
- **2026-10-09** — [Replace a server another build left running](2026-10-09-replace-a-server-another-build-left-running.md).
- **2026-10-09** — [Run the server under the OS service manager](2026-10-09-run-the-server-under-the-os-service-manager.md).
- **2026-10-09** — [Require a key from the keyring for every API client](2026-10-09-require-a-key-from-the-keyring-for-every-api-client.md).
- **2026-10-09** — [Keep error reports on and say so once](2026-10-09-keep-error-reports-on-and-say-so-once.md).
- **2026-10-09** — [Publish baseline and musl builds and pick them in the installers](2026-10-09-publish-baseline-and-musl-builds-and-pick-them-in-the-installers.md).
- **2026-10-09** — [License atc under Apache-2.0 with generated notices](2026-10-09-license-atc-under-apache-2-0-with-generated-notices.md).
- **2026-10-09** — [Apply updates in place and never downgrade trust](2026-10-09-apply-updates-in-place-and-never-downgrade-trust.md).
- **2026-10-09** — [Build natively, sign, then smoke the draft before publishing](2026-10-09-build-natively-sign-then-smoke-the-draft.md).
- **2026-10-09** — [Run host steps through the core executor](2026-10-09-run-host-steps-through-the-core-executor.md).
- **2026-10-13** — [Ship Linux packages from our own repository and the AUR](2026-10-13-ship-linux-packages-from-our-own-repository-and-aur.md).
- **2026-10-13** — [Shared server workspaces and agent controls](2026-10-13-shared-server-workspaces.md) — daemon-owned operations, three workspaces, manual setup, CLI and permission-scoped MCP.
- **2026-10-14** — [Goal-based setup and explicit download review](2026-10-14-goal-based-setup.md).
- **2026-10-14** — [Agent and command setup](2026-10-14-agent-and-command-setup.md) — agent-focused default, command-focused technical setup, engine before model and progressive details.
- **2026-10-14** — [Playground workflows](2026-10-14-playground-workflows.md) — cancellable generation, conversation branches and transfer, browser preferences and grouped engine settings.
- **2026-10-15** — [Lift the wire contract out of the admin](2026-10-15-lift-the-wire-contract-out-of-the-admin.md) — `src/contract/`, shared by every client.
- **2026-10-15** — [Retire the pre-workspace screens](2026-10-15-retire-the-pre-workspace-screens.md) — the old tab screens and the SPA router go.
- **2026-10-15** — [Describe every workspace operation](2026-10-15-describe-every-workspace-operation.md) — the `operation()` builder and real MCP tool descriptions.
- **2026-10-15** — [Enforce the module rules in lint](2026-10-15-enforce-the-module-rules-in-lint.md) — deep imports, 300 lines, the generated module map, `verify:fast`.
- **2026-10-15** — [Group workspace files by area](2026-10-15-group-workspace-files-by-area.md) — one folder per area in both workspaces.
- **2026-10-15** — [atc downloads its own models](2026-10-15-atc-downloads-its-own-models.md) — `src/downloads/` and atc-owned GGUF setups on core 0.17.0; ranges written in place; supersedes the core-owned downloads of the 2026-10-08 gate record.
- **2026-10-19** — [Take hardware facts from the core](2026-10-19-take-hardware-facts-from-the-core.md) — the daemon no longer probes or pushes `PUT /hardware/override`; doctor shows the core's facts.
- **2026-10-19** — [The core applies engine builds](2026-10-19-the-core-applies-engine-builds.md) — install, activate and the default build through `/engines/*`; `atc` never writes `version_backend`.
- **2026-10-19** — [Keep media where the core lists it](2026-10-19-keep-media-where-the-core-lists-it.md) — image and video files in `diffusion/models`, moved from `workspace-models` on start.
- **2026-10-20** — [Take the last core gaps from the core](2026-10-20-take-the-last-core-gaps-from-the-core.md) — core 0.18.4: `foundry-host` handed to the core, PrismML build from the catalog's `recommended`, setting schemas from `./settings`, the Windows ACL read back by SID.
- **2026-10-20** — [Install managed engines from atc](2026-10-20-install-managed-engines-from-atc.md) — `engines.plan|operate|operation|resume|cancel|diagnostics`; the whole plan, consent bound to its digest (`--yes`, `--approve`), following in the command with `--detach`/`--resume`/`--cancel`, `rm --keep-models`, sign-in instructions instead of `SupplementaryGroups`.
- **2026-10-20** — [Download managed models in atc](2026-10-20-download-managed-models-in-atc.md) — the app's HF resolver lifted, `models.check`, durable `managed.plan|install` into the core's store with a second allowed root, `model.yml` (JSON) last, `atc models pull|catalog|search --engine`, the store in `models list|rm`.
- **2026-10-20** — [Download and run Foundry Local models in atc](2026-10-20-foundry-local-models-in-atc.md) — accelerators prepared after the install, conf's list then Microsoft's catalog, durable `foundry.plan|install` NPU → GPU → CPU with a fresh link on 403, the chat template repaired once at download, removal by the client, `proxy.*` for engine builds.
- **2026-10-20** — [Enforce the core boundary in lint](2026-10-20-enforce-the-core-boundary-in-lint.md) — only the core's `exports`; core-owned names need a `core-boundary` reason; `core-workaround` expires with the core pin.
- **2026-10-21** — [Report atc's server errors to its own Sentry project](2026-10-21-report-atc-server-errors-to-its-own-project.md) — the core's `ErrorReporter` with atc's DSN baked at release; one consent; uncaught throws, start-up, admin 5xx and failed downloads, tagged by `component`.
- **2026-10-21** — [Turn Foundry Local's 1DS upload off on Linux](2026-10-21-foundry-local-1ds-off-on-linux.md) — `TF_BUILD=True` in the core's environment on Linux, since the library's v2.1.0 `ProcessInfo` upload crashes its host (microsoft/Foundry-Local#1182); drop it with a later library build.

- **2026-10-22** — [Adapt the desktop structure to a server-first workspace](2026-10-22-server-first-desktop-structure.md) — server overview and connections, dedicated settings, shared terminal/web navigation, setup ends at Server, secondary Playground.

- **2026-10-23** — [Terminal onboarding and direct downloads](2026-10-23-terminal-onboarding-cards.md) — engine-first intro, automatic checked downloads, contextual footer, provider/media cards and catalog filters.
- **2026-10-23** — [Preserve setup choices and verify connections](2026-10-23-preserve-setup-and-check-connections.md) — nested model selection, checked providers, engine progress, direct pause/removal and consistent primary actions.
- [2026-10-23 — Follow the current desktop composition in both server clients](2026-10-23-follow-current-desktop-composition.md)

- **2026-10-23** — [Keep pending connections in place](2026-10-23-keep-pending-connections-in-place.md) — preserve pending engines, explicit readiness, optional waiting games and predictable compact provider dialogs.
- **2026-10-23** — [Update the embedded core to 0.19.0](2026-10-23-update-embedded-core-to-0-19.md) — exact core pin, native LiteRT host dispatch, and rebuilt web/TUI backend.

- **2026-10-23** — [Keep the browser and terminal on one live workspace](2026-10-23-share-live-state-between-clients.md) — shared onboarding, API and panel status; preserve local navigation, drafts and the current connection result.
- [Share the latest desktop screen structure](2026-10-23-align-desktop-screen-structure.md)

- [Keep engine controls and completed downloads together](2026-10-23-unify-model-hub-dialogs.md)

- [Apply prototype annotations to both real frontends](2026-10-23-apply-prototype-annotations.md) — engine-first onboarding, shared choices, labelled navigation, support and desktop conversation composition.

- [Share assistants, connectors, skills and document settings](2026-10-23-shared-workspace-features.md) — shared feature state and runtime, with binary parser dependency approval recorded separately.

- [Require intentional intro input and restore navigation origins](2026-10-23-require-intentional-intro-and-return-navigation.md) — explicit first-run entry, terminal report filtering, and direct Escape returns for Settings and existing-server connections.

- [2026-10-23 — Gate inference and keep downloads visible](2026-10-23-gate-inference-and-keep-downloads-visible.md) — includes local-only email confirmation and waiting-screen exits.
- **2026-10-24** — [Drafting terminal brand and server-status eyes](2026-10-24-drafting-terminal-brand.md) — approved ASCII artwork, authoritative status colors, and compact header bounds.
- **2026-10-24** — [Symmetric Drafting header and restrained contour motion](2026-10-24-symmetric-drafting-motion.md) — balanced lower contour, anchored status eyes, and reduced-motion-aware arm movement.

- **2026-10-24** — [Own engine downloads in the shared server queue](2026-10-24-share-background-engine-downloads.md) — background engine jobs, selection intent, shared progress and supported recovery controls.

- **2026-10-24** — [Shade dialogs and keep short terminals usable](2026-10-24-shade-dialogs-and-fit-short-terminals.md) — consistent modal backdrops, functional60×20 status layout, and approved Beacon/Rover card artwork.
- **2026-10-24** — [Share semantic colors between Web and the terminal](2026-10-24-share-interface-colors.md) — one palette for matching navigation, composer, action and download controls.
