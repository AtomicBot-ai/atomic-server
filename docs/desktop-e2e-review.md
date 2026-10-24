# Desktop parity and end-to-end review — October 23, 2026

The reference was re-read from `atomic-chat-ui` at **5043013**, including its running preview. The earlier navigation and generic controls were replaced with the current desktop composition in both clients. [Screen mapping and capability limits](desktop-flow-parity.md).

The follow-up [keyboard and mouse review](keyboard-mouse-e2e.md) records interactive failure scenarios, waiting games, compact provider dialogs, and the additional fixes found through visible UI testing.

## Fixed during this review

- Returning profiles replayed the entrance; they now enter the saved workspace directly.
- Changing a model during agent setup could send the user backward; the selected agent and connection step now survive that choice.
- Onboarding completion did not update the prepared connection shown in Overview.
- Terminal connection setup lost its Launch agent action; supported profiles now launch through the existing terminal handoff without stopping the API.
- Launch is unavailable until first-run setup is verified. Cancelling launch preserves the connection draft and focus.
- Custom endpoint setup could leave an empty page after Connect or Cancel.
- Imported files and ready media/MLX variants could disappear or appear in the wrong category after removing the legacy Installed menu.
- Artifact job IDs were being confused with model IDs. Load, unload, deletion, and loaded-state display now use the correct identifiers.
- A failed media catalog prevented the other category from being used; successful results remain available, with Retry for failures.
- Invalid saved likes could crash the catalog.
- Managed and Foundry downloads opened an extra planning screen. Their controls now stay in the expanded model row, with one Download action and inline compatibility blockers.
- Importing from Images could hide the imported GGUF file. Import now returns to Text with the new model visible.
- Terminal media requests could overwrite the next screen after navigation. Dropdown wheel scrolling and focus after removal dialogs now stay with the selected card.
- Late web catalog responses could overwrite a newer search, category, format or section. Only the current request can update results, errors or loading state.
- Background download cards pushed the catalog out of view in a narrow browser window. Their compact strip keeps transfer details and actions visible above the catalog.
- Terminal connection model/engine controls still cycled on activation. They now open selectable menus; the expanded agent catalog scrolls as cards instead of using page buttons.
- Generic model import, old navigation, extra page chrome, and mismatched terminal Settings controls were replaced with the desktop controls.

## Latest control and composition pass

- Desktop typography and rich engine/model identity menus replace generic selectors.
- Onboarding providers use the desktop tile grid and inline credential panel, with
  connected/validating states, predictable focus and nested Escape handling.
- Sidebar collapse works at desktop widths; outgoing HTTPS proxy stays under Server.
- Switches and primary/secondary actions use consistent geometry. Busy actions keep
  their label and dimensions; connection review keeps Back left and Configure right.
- Catalog typing, clear-search, filter/sort keyboard navigation and focus return are
  consistent. Search remains active after a model starts downloading.
- Late model-install/provider-disconnect results cannot close a newer editor. Open
  model menus preserve the highlighted identity when download completion reorders rows.
- TUI provider grids, download strips, catalog rows, fields, switches, Save/Discard
  placement and centered connection dialogs now use the same control hierarchy.
- Visible terminal testing caught clipped card borders, truncated estimates and
  popup/background overlap; each was fixed and covered by regressions.

## Exercised journeys

| Surface | Checks |
| --- | --- |
| Browser, built application with disposable API state | Fresh engine selection and progress; automatic model download; pause/resume and ETA; provider check failure and retry; pending/connected styling; image/video queue and confirmation; agent model replacement; endpoint port validation and completion; returning entry; filters, sorting, inline variants, import, unload/delete confirmation, custom endpoint summary; Settings save/discard and persistence after reload |
| Automated real PTY, built macOS arm64 binary | Fresh engine gate; returning profile; 54×24 to 120×36 resize; Models Hub; provider/key editor and Back; Settings; Playground; Help; quit and terminal restoration |
| Mounted terminal and service contracts | Engine progress; durable model download and restart/resume; endpoint verification; agent handoff; media actions; failed saves; provider validation; keyboard/mouse targets at 54×24, 80×24, 120×36, 160×50 |
| Visual review | Latest desktop preview compared with web; terminal Canvas renders checked at wide and compact sizes; real bundled model/provider marks and ASCII terminal artwork |
| Existing review profile | Refreshed to the verified binary; responsive sidebar and catalog checked in the live browser; existing paused download records preserved |

## Final verification

`npm run verify` passed on macOS arm64: **1,955 tests passed; four platform-specific tests skipped**.

| Suite | Passed | Skipped |
| --- | ---: | ---: |
| Unit and service/CLI contracts | 1,663 | 0 |
| Web interface | 245 | 0 |
| Built executable and real PTY | 26 | 2 |
| Node runtime compatibility | 5 | 0 |
| Installers | 16 | 2 |

Lint, type checking, formatting, notices, the web build and the embedded executable build also passed. A separate Bun runtime compatibility run passed all five checks.

[Verification log](../../../outputs/atomic-desktop-verification.log) · [Web Models Hub, test profile](../../../outputs/atomic-web-models-hub-reviewed.png) · [Terminal Models Hub](../../../outputs/atomic-tui-models-hub-120x36.png) · [Terminal media, wide](../../../outputs/atomic-tui-media-onboarding-120x36.png) · [Terminal media, compact](../../../outputs/atomic-tui-media-onboarding-54x24.png) · [Live browser preview](../../../outputs/atomic-server-live-reviewed.png)

[Terminal connection dropdown](../../../outputs/atomic-tui-connection-model-menu-120x36.png) · [Compact dropdown](../../../outputs/atomic-tui-connection-model-menu-54x24.png) · [Expanded agent cards](../../../outputs/atomic-tui-agents-expanded-120x36.png) · [Agent cards scrolled at 54×24](../../../outputs/atomic-tui-agents-scrolled-54x24.png)

## Validation scope

Downloads and inference checks use deterministic fixtures and temporary data folders. No multi-gigabyte model download, live third-party API credential, external agent installation, or public tunnel was used for this review. These depend on the user's installed engines, credentials, hardware and network. Windows/PowerShell-only checks are skipped on this macOS host. This is not a claim that unsupported native desktop capabilities are available in the server.

The existing launcher remains available: run `outputs/eye-cli.command` to resume the review profile, or append `--fresh` to create a new isolated first-run profile. Existing model files and partial downloads are preserved.
