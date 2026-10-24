# Lifted files

Files copied from the desktop app (`Atomic-Chat`, commit `f71e2280b`) so they can be lifted again 1:1 later.
Every source file carries a header comment `// Lifted from Atomic-Chat/<path> @ f71e2280b; adapted: <what changed>`;
the JSON configs and `eslint.config.js` are listed here only. They are Apache-2.0, Copyright Atomic Chat and
Menlo Research, as the rest of this repository; the attribution is in the root `NOTICE`.

| Here                                  | From                                          | Adapted                                                                  |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `src/lib/utils.ts`                    | `web-app/src/lib/utils.ts`                    | `cn()` only; the rest is chat, model and markdown code                   |
| `src/components/ui/button.tsx`        | `web-app/src/components/ui/button.tsx`        | none (formatted with this repo's prettier)                               |
| `src/components/ui/card.tsx`          | `web-app/src/components/ui/card.tsx`          | none (formatted with this repo's prettier)                               |
| `src/components/ui/input.tsx`         | `web-app/src/components/ui/input.tsx`         | none (formatted with this repo's prettier)                               |
| `src/index.css`                       | `web-app/src/index.css`                       | theme tokens and the base layer only; no fonts, markdown, katex, animations |
| `src/hooks/useServiceHub.ts`          | `web-app/src/hooks/useServiceHub.ts`          | `ServiceHub` is a type-only import                                       |
| `src/services/atomic-core-runtime.ts` | `extensions/shared/atomicCoreRuntime.ts`      | none, verbatim (prettier skips it: `requirePragma` override in `.prettierrc`) |
| `src/main.tsx`                        | `web-app/src/main.tsx`                        | renders the admin root, no router; no Sentry, migrations, mobile or zoom handling |
| `tsconfig.app.json`, `tsconfig.node.json` | `web-app/tsconfig.*.json`                 | `lib` ES2023 / target ES2022 (the contract's type imports reach Node code); `@contract` path |
| `eslint.config.js`                    | `web-app/eslint.config.js`                    | tests linted, `components/ui` may export variants                        |

Mirrored in shape, not copied: `src/services/index.ts` (the `ServiceHub` name and the getter shape),
`src/stores/*` (zustand `create`).

Written for the admin (no counterpart in the app): `src/containers/*`, `src/workspace/*`,
`src/services/{admin-api,core-bridge,events,session}.ts`, `src/stores/status-store.ts`,
`src/hooks/{useAdminStatus,useTheme}.ts`.

## Redesigned desktop flow reference (2026-10-22)

The following flow adaptations use the owner's local `atomic-chat-ui` redesign (base `c9fa1e66b8c6df744637e90c8278aacdf3b958d0` plus its working-tree preview). They replace mock side effects with authenticated server operations. The reference was not the upstream release UI.

| Here | Reference | Adaptation |
| --- | --- | --- |
| `src/workspace/setup/SetupWizard.tsx`, `FirstModel.tsx` | `web-app/src/preview/onboarding/Onboarding.tsx` | Server-only destination, live catalogs/downloads, explicit unsupported OS permissions |
| `src/workspace/server/ConnectionGuide.tsx`, `ConnectionHelp.tsx` | `web-app/src/containers/server-concept/Setup.tsx`, `SetupEndpoint.tsx`, `SetupSuccess.tsx`, `SetupHelp.tsx` | Real inference verification, client profiles and manual endpoint handoff |
| `src/workspace/WorkspaceNavigation.tsx` | `web-app/src/components/left-sidebar/NavigationRail.tsx`, `containers/ServerSidebar.tsx`, `SettingsMenu.tsx` | Server sections and a secondary Playground |
| `../../src/contract/desktop-flows.ts` | `web-app/src/constants/integrations.ts` | Agent names/order shared with TUI; existing Claude wire ID retained |

The intro logo `src/workspace/intro/atomic-logo.png` is copied from the selected desktop redesign's `web-app/public/images/transparent-logo.png` at `c9fa1e66` plus local preview changes. `IntroScreen.tsx` documents its provenance; animation and layout are local CSS.

Cloud connection cards and their editor in `src/workspace/library/CloudProviders.tsx` follow
`web-app/src/preview/onboarding/Onboarding.tsx` at `1c01e2a`, with real server validation replacing the
prototype's timer. `CloudProviderMark.tsx` uses the same logo mapping as `web-app/src/lib/utils.ts`.
`src/workspace/library/provider-logos/` copies the corresponding `web-app/public/images/model-provider/`
marks and `web-app/public/svg/deepseek-color.svg` from that revision, without changing their artwork.

## Connection guide refresh (2026-10-23)

The selected desktop prototype at `1c01e2a` supplies `web-app/src/containers/server-concept/Setup.tsx` for `src/workspace/server/ConnectionChoices.tsx`, and `web-app/src/containers/AgentIcon.tsx` for `src/workspace/server/AgentIcon.tsx`. The latter's inline marks and referenced local images are bundled in `public/images/agents/`; the server keeps its existing `claude` ID. Model selection runs inside the current connection draft, with live download readiness replacing the prototype's simulated state.

## Server shell refresh (2026-10-23)

The latest selected desktop redesign at `5043013` supplies the server composition and controls below. Live server operations replace prototype state mutations. Prepared tool profiles are labeled as prepared in the current session; the server has no agent process tracking or disconnect registry.

| Here | Reference | Adaptation |
| --- | --- | --- |
| `src/workspace/server/Server.tsx` | `web-app/src/containers/server-concept/ServerExperience.tsx` | One guide within Overview, shared live pages |
| `src/workspace/server/ServerOverview.tsx`, `agent-descriptions.ts` | `server-concept/Overview.tsx`, `constants/integrations.ts` | Searchable tool cards, prepared connection state, live activity |
| `src/workspace/server/ServerControlPanel.tsx`, `../WorkspaceNavigation.tsx` | `containers/ServerControlPanel.tsx`, `components/left-sidebar/index.tsx`, `containers/ServerSidebar.tsx` | Actual start/stop, engine/model/connections shortcuts, responsive drawer |
| `src/workspace/server/Connections.tsx` | `server-concept/Connections.tsx` | Live endpoint/key details and verified inference; prepared tools instead of fabricated connections |
| `src/workspace/server/ServerConfiguration.tsx`, `ServerKeyField.tsx` | `server-concept/Settings.tsx` | Persistent listener settings, named keyring and exact dirty save/discard |
| `src/workspace/server/ServerModel.tsx`, `ConnectionModelFields.tsx` | `server-concept/EngineModelFields.tsx` | Native accessible engine/model dropdowns; compatible installed models and real loading |
| `src/workspace/server/server-desktop.css`, `server-settings.css`, `server-sidebar.css` | `server-concept/desktop.css`, `containers/server-control-panel.css` | Existing theme variables, responsive 900px sidebar drawer |

The server has no configurable local HTTPS listener or tunnel auto-start setting, so those prototype controls are omitted. The outbound proxy stays in Settings under Proxy. Model loading preserves other active services supported by this multi-model server.

The settings refresh at `5043013` also adapts `containers/Card.tsx` and `routes/settings/{general,interface,shortcuts}.tsx` into `src/workspace/server/{Settings,RuntimeSettings,RuntimeSettingRow}.tsx` and `settings-desktop.css`. Available server settings use the same labeled rows and switches, with isolated drafts, pending locks and explicit saving. `HardwareSettings.tsx` follows `routes/settings/hardware.tsx`, using real core facts and MiB units. Unsupported desktop-only appearance, passkey, language and chat preferences are omitted.

`src/workspace/library/ImportModel.tsx` adapts `containers/hub/ImportLocalFile.tsx` at `5043013`: the current server operation registers one existing GGUF path and does not upload files or accept a chosen engine. The dialog states this restriction and retains the entered path on error. `CustomProviderSummary.tsx` keeps the dedicated endpoint page navigable after checking or cancellation; it reports only server-returned connection states.

## Desktop parity audit — 2026-10-23 (`atomic-chat-ui` @ `5043013`)

- `workspace/setup/FirstModel.tsx`, `OptionalMedia.tsx`, `SetupWizard.tsx`, `onboarding.css`: `preview/onboarding/Onboarding.tsx`; live hardware, catalog, provider checks, background jobs, fixed footer, server destination.
- `workspace/library/CatalogToolbar.tsx`: `containers/hub/HubSearchToolbar.tsx` and `HubFilters.tsx`; separate filter/sort popovers and actual engine choices.
- `workspace/library/CatalogTable.tsx`, `CatalogBrowse.tsx`, `CatalogModelOptions.tsx`, `catalog-desktop.css`: `containers/hub/LocalModelTable.tsx`; live metadata, expandable variants, imported models, server load/delete controls. Unknown metadata is not invented.
- `workspace/library/CatalogMedia.tsx`: `containers/hub/MediaHub.tsx` and `MediaFamilyRow.tsx`; installed/available family rows and inline live artifact operations.

- `workspace/styles/desktop-parity.css`: final rail/sidebar, Models Hub spacing and responsive drawer composition from the desktop shell @ `5043013`. Web-only sign-out and advanced commands live in Help.
- `workspace/library/model-logos.ts`, `ModelMark.tsx`, and `public/model-brands/`: model-family logo rules and bundled brand artwork from `lib/model-logo.ts`, `containers/ModelLogo.tsx`, and their referenced public assets @ `5043013`. Monochrome marks use the prototype's mask treatment; no remote avatar requests.
- `workspace/library/CatalogRuntimeOptions.tsx`, `ManagedModelInstall.tsx`, `FoundryModelInstall.tsx`: expanded model download controls from `containers/hub/LocalModelTable.tsx` @ `5043013`; managed compatibility and Foundry variants remain inline, Download checks the real plan and starts immediately when unblocked, and host engine/accelerator preparation returns to the same row. `ModelInstallFrame.tsx` shares these controls with setup dialogs.

- `src/workspace/library/CloudProviderDialog.tsx`: Atomic-Chat preview/onboarding/Onboarding.tsx @ `5043013`; compact provider dialog, focus containment, and Escape dismissal.

- `src/workspace/games/mines.ts`, `DownloadGame.tsx`: `web-app/src/preview/onboarding/Mines.tsx` @ `5043013`; first-click-safe board and flood reveal adapted into a keyboard-accessible classic Minesweeper dialog and final onboarding panel; pure rules now shared with the terminal through `src/workspace-view/mines.ts`. Visual treatment is local classic Windows styling; server downloads and explicit connection actions remain independent.

## Desktop control and typography parity (2026-10-23)

`src/workspace/server/{DetailPicker,ConnectionModelFields,ServerModel,ConnectionReviewSummary}.tsx`
and `detail-picker.css` follow `web-app/src/containers/server-concept/{EngineModelFields,Setup}.tsx`
and `desktop.css` at `5043013`. Rich choice rows retain actual server identities and download status;
keyboard navigation, typeahead, selection, and dismissal use a local listbox instead of adding Radix dependencies.
`model-choices.tsx` reuses the reference engine descriptions and existing model identity marks, with no invented model specifications.
`public/engine-brands/{llamacpp.svg,mlx.png}` are copied from `web-app/public/images/model-provider/` at that revision.

`public/fonts/{Inter-Regular.ttf,Inter-SemiBold.ttf,StudioFeixenSans-Medium.otf}` are the desktop's
`web-app/public/fonts/{inter/Inter_18pt-Regular.ttf,inter/Inter_18pt-SemiBold.ttf,StudioFeixenSans-Medium.otf}`
at `5043013`. They are bundled locally and declared in `desktop-parity.css` so the shared workspace uses the actual desktop typography.
Server control-panel tint, running-border animation, agent-card rhythm and settings/connection composition
follow `containers/server-control-panel.css` and `containers/server-concept/{desktop,setup-details}.css` at the same revision.

- `workspace/library/CloudProviderEditor.tsx`, `CloudProviderDialog.tsx`, `onboarding-providers.css`, `workspace/setup/OptionalMediaDownload.tsx`: desktop `preview/onboarding/Onboarding.tsx` and `onboarding.css` @ `5043013`; inline onboarding credentials, scrollable provider tiles, live validation and separate media pause/remove actions. `workspace/library/catalog-table.css` follows `containers/hub/LocalModelTable.tsx` at the same revision; native responsive table styling split from `catalog-desktop.css`.

`workspace/styles/desktop-controls.css` adapts the native control geometry in
`web-app/src/containers/server-concept/desktop.css` @ `5043013`: pill actions,
40×24 switches, 18px checkboxes, visible focus and reduced-motion treatment.

## Current desktop screen structure — 2026-10-23 (`atomic-chat-ui` @ `807b4d9`)

- `workspace/WorkspaceNavigation.tsx`, `server/{Settings,GeneralSettings,InterfaceSettings,WorkspaceSettings}.tsx`: the current `components/left-sidebar/index.tsx`, `containers/SettingsMenu.tsx`, and settings/workspace routes. Five primary Settings entries and the three Workspace entries share the desktop order; server configuration stays under General disclosures. The annotation implementation below replaces the initial unavailable states with shared server-owned attachment retrieval, assistants, MCP clients, and skills. Browser theme changes use the existing persisted theme store.
- `workspace/media/{MediaStudio,MediaParameters,MediaModelPicker,MediaGallery}.tsx` and `media-{studio,gallery}.css`: `containers/images/{ImageGenerationPage,ImagePromptForm,ImageModelPicker,ImageViewer}.tsx` and `containers/videos/VideoPromptForm.tsx`. The fixed form column, prompt card, Generate/Stop slot, separate viewer/gallery, negative prompt and Advanced disclosures use real workspace capabilities/jobs/artifacts. Gallery save uses authenticated artifact downloads; native file reveal and unsupported gallery deletion are omitted. All model loads address actual downloaded artifact IDs.

The `807b4d9` onboarding refresh also supplies `setup/FirstModel.tsx` and `onboarding-model.css` from `preview/onboarding/ModelSelection.tsx` and `onboarding.css`, and `setup/{SetupWizard,Permissions,Purpose}.tsx` from `preview/onboarding/Onboarding.tsx`. Browser permission requests replace simulated grants; the terminal opens the actual web permission flow. Real server catalogs replace static recommended-model data. The later annotation removes the everyday-chat destination and routes directly to the two server choices; decorative step counters and filler remain omitted.

- `workspace/library/CatalogCategory.tsx` and `catalog-category.css`: current `containers/hub/HubCategorySelect.tsx` + `containers/images/MediaModeSelect.tsx` @ `807b4d9`; compact icon/title trigger, rich category rows and selection marker. Reuses the accessible local `DetailPicker` for arrows, typeahead, Escape and scroll instead of a native OS select.

## Annotation implementation — 2026-10-23 (`atomic-chat-ui` @ `807b4d9`)

- `workspace/HelpMenu.tsx`, `help-menu.css` and `WorkspaceNavigation.tsx` follow `components/left-sidebar/NavigationRail.tsx`: the actual Discord, issue and mail destinations, labelled two-line rail controls, Server/Playground/Models above Help/Web/Settings. Support messages are never sent automatically.
- `workspace/server/ServerControlPanel.tsx` / `server-sidebar.css` use `containers/ServerControlPanel.tsx` and `server-control-panel.css`: one grouped surface and actual start/stop/restart states, with reduced-motion support.
- `workspace/chat/{ChatMessages,ChatComposer,ChatModelPicker}.tsx` and `chat-desktop.css` follow `containers/{MessageItem,ChatInput}.tsx`: user bubbles, inline assistant responses, compact accessible icon actions and a single composer with attachments/model/tools below the input. Shared server operations retain conversation and tool state.

| `workspace/server/WorkspaceSettings.tsx`, `FeatureEditor.tsx`, `AttachmentSettings.tsx` | `atomic-chat-ui/web-app/src/routes/settings/assistant.tsx`, `routes/skills/index.tsx`, `routes/settings/attachments.tsx` @ `807b4d9` | Shared server-owned assistant, skill and attachment controls; terminal equivalents use the same operation contract. |

| `src/workspace/server/ConnectorsSettings.tsx` | `atomic-chat-ui/web-app/src/routes/connectors/index.tsx` @ `807b4d9` | Shared server catalog, real connection status and OAuth, JSON configuration. |
| `src/workspace/server/ConnectorCard.tsx` | `atomic-chat-ui/web-app/src/containers/connectors/ConnectorCard.tsx` @ `807b4d9` | Installed/catalog cards, toggles, actions, tools. |
| `src/workspace/server/ConnectorDialogs.tsx` | `atomic-chat-ui/web-app/src/containers/connectors/ConnectorSecretDialog.tsx` and `EditJsonMCPserver` @ `807b4d9` | Keyboard-trapped key and JSON dialogs. |
| `../../src/contract/mcp-catalog*.ts`, `public/images/connectors/*` | `atomic-chat-ui/web-app/src/constants/mcp-connectors.ts`, English MCP strings and public connector assets @ `807b4d9` | Exact catalog templates and branding shared with TUI. |

- `workspace/library/CustomProviderSummary.tsx` and `custom-endpoints.css` follow `atomic-chat-ui/web-app/src/routes/endpoints.tsx` @ `807b4d9`: centered bordered empty state, compact endpoint cards and a separate heading action. Copy is reduced to the necessary endpoint choice.
