# Keyboard and mouse review — October 23, 2026

The web and terminal journeys below were operated through visible interfaces with mouse clicks, wheel scrolling, Tab, Enter, arrows, Escape and text entry. No application state was changed through browser scripts. Shell commands prepared isolated test environments and ran supplementary automated checks.

## Test environments

- **Real web server:** the built macOS arm64 executable, authenticated through the sign-in form, with a disposable profile and cached model catalog. Settings were saved to the real server and checked after reloading. Existing user profiles and servers were not restarted.
- **Web failure fixture:** the built React application against a local scripted service. Real UI controls started engine/model progress, provider rejection/retry and compatibility failures. Downloads, provider checks and inference responses were simulated; no external credentials were used.
- **Interactive terminal:** the actual `runTui`, Ink renderer, controller and input handlers running in a real Python PTY. A local xterm browser terminal forwarded keyboard/mouse input and resize signals. Only the server/runtime responses were fixtures. Each scenario used a new temporary profile.

Direct automation of the macOS Terminal app was denied by the computer-use tool. It was not accessed by an alternative automation mechanism. The browser terminal exercised the product's real terminal input/output, rather than static rendered screenshots. The browser did not forward Ctrl+U to the PTY (verified by control-byte metadata); that shortcut is covered by the input regression test, not claimed as an interactive pass.

## Interactive journeys

| Journey                               | Observed result                                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh web and TUI engine chooser      | Keyboard selection starts installation; progress appears; the entrance becomes available after installation                                    |
| Model selection                       | Starts download directly and advances to providers; no confirmation screen                                                                     |
| Provider key rejected, then corrected | Checking is visible; error preserves entered fields; valid retry produces Connected                                                            |
| Compact provider popup                | Fits its fields; Escape closes directly to the provider page; nested field Escape returns to its form                                          |
| Skip actions                          | Muted Skip setup appears immediately left of the primary Skip/Continue action                                                                  |
| Pending agent connection              | Selected model and engine remain visible; configuration waits explicitly                                                                       |
| Web model replacement                 | Blocked model shows its reason; Escape returns to the picker; choosing another model returns to the same Codex connection                      |
| Optional games                        | Minesweeper mouse reveal, arrow navigation and keyboard flag; Space Invaders movement, firing and pause; Escape preserves the connection draft |
| TUI resize                            | Live 120×36 → 54×24 resize keeps the game, connection controls and provider dialog usable                                                      |
| Paused/failed downloads               | Resume is available; warning changes in place; the selected agent/engine is retained                                                           |
| Download removal                      | Confirmation appears; Escape retains the download and returns to the same connection guide                                                     |
| Web completion                        | Ready appears without automatic configuration; explicit Configure completes the agent flow                                                     |
| Ready TUI model                       | Explicit Configure shows preparation then the connection details                                                                               |
| Failed TUI model load                 | Remains in the selected connection with Retry, rather than reporting success                                                                   |
| Endpoint validation                   | Port 70000 blocks continuation with an explanation; correcting it preserves the selected model and port in review                              |
| Real server settings                  | Save persists after reload; Discard reverts staged changes; Alt+3 opens Settings                                                               |
| Real server network settings          | Port 70000 shows a linked inline warning and disables Save; Discard retains saved values                                                       |
| Real server model import              | Missing local file shows readable server-path guidance; the path and retry action remain available                                             |
| Real server catalog                   | Filters, sort and import open from their controls; Escape dismisses their popup; Alt+2 returns to Models                                       |
| Empty Playground                      | Send stays unavailable without a model; Load a model remains available                                                                         |

## Bugs found and fixed through this review

- Pausing/resuming a TUI download closed the connection guide. Direct actions and their confirmation/detail dialogs now preserve the parent guide, draft and focus.
- A blocked TUI model kept animating as Preparing. Failure now stops the animation and shows the error with Retry and Back.
- Provider errors appeared both inside and underneath the TUI popup. The owning popup now shows the error once.
- Removing duplicate Cancel controls left a black rectangle. Clearing now preserves the popup surface.
- Single-line pasted terminal credentials could retain a carriage return. Control bytes are removed without submitting pasted Enter.
- Invalid server settings disabled Save without explaining why; empty fields silently became defaults. Draft text now remains editable, with explicit port/prefix validation. Port 0 remains valid for automatic allocation, as the schema allows.
- File import exposed raw filesystem errors, and TUI import errors could hide behind the editor. Both clients now retain the path and show specific file-not-found, permission or directory guidance inside the form.
- Connection errors were truncated at compact terminal widths. They now wrap above Retry.

Final code review and regression tests also fixed three timing cases: an older failed download could hide a newer attempt; completing a download while Minesweeper was open could leave keyboard focus outside setup; and delayed download actions could close a different terminal popup opened in the meantime. Resume now targets the current attempt, focus returns to the surviving setup dialog, and late actions preserve the user's current screen.

## Follow-up quality review

The main server journeys are coherent, and the web composition is closer to the desktop than the terminal presentation. The remaining weaknesses were mostly exceptional states and keyboard affordances. This is not a claim of pixel-perfect parity or fully verified external integrations.

The follow-up fixed:

- Empty or incompatible llama.cpp catalogs no longer throw an error that hides other available engines.
- Terminal onboarding downloads show keyboard focus on Pause and Remove. Failed preparation has a prominent Retry action and no stale cancellation instruction.
- Paused multi-part downloads retain completed engine/model bytes instead of appearing to lose progress.
- Failed installed-model checks preserve the agent, model and engine, disable configuration, and offer a direct retry. Unknown availability is not presented as a missing download.
- Provider completion returns keyboard focus to setup when the connected provider card becomes disabled. Repeated model-check failures keep focus on Retry; successful recovery focuses Model.
- Connection help cannot open another model/settings screen while preparation is running.
- Numeric settings show field-level validation. Listener ports reject fractions, and scrolling a focused numeric setting does not change its value.

The model-check failure/recovery and fractional-port scenarios used the built web application with visible local fixture controls. Repeated failure kept focus on Retry; recovery focused the same Model field and left Configure available for explicit activation. Wheel scrolling moved the page while preserving the invalid port and warning. Provider completion returned focus inside onboarding. The actual terminal at 54×24 showed highlighted Pause/Remove controls; Enter paused without leaving onboarding. Automated regressions separately cover incompatible engine catalogs, multi-part transfer accounting and delayed response cases.

## Supplementary restrictions and failure checks

Automated component/service/contract tests additionally cover provider discovery being offline, provider model-list incompatibility, unavailable remote models, missing/invalid URLs, embedded URL credentials, query/fragment restrictions, missing compatible engines, managed/Foundry download shapes, removed downloads, permission-denied imports, invalid prefixes, and reduced-motion game startup. These are separate from the interactive journeys above.

Live paid-provider authentication, large model transfers, external agent installation, public tunnels and Windows-only behavior were not exercised. The test fixtures establish UI behavior under those responses, not that every external integration succeeds on the user's machine.

## Evidence

- [Web provider failure](../../../outputs/atomic-web-provider-failure.png)
- [Web skip actions](../../../outputs/atomic-web-skip-actions.png)
- [Web waiting game](../../../outputs/atomic-web-waiting-game.png)
- [Web missing-file warning](../../../outputs/atomic-web-import-warning.png)
- [TUI load failure and recovery](../../../outputs/atomic-tui-load-warning.png)
- [Web port validation](../../../outputs/atomic-web-port-warning.png)
- [TUI waiting game at 54×24](../../../outputs/atomic-tui-keyboard-game.png)
- [TUI paused connection retained](../../../outputs/atomic-tui-paused-connection.png)
- [TUI provider warning](../../../outputs/atomic-tui-provider-failure.png)
- [TUI unavailable-engine warning at 54×24](../../../outputs/atomic-tui-engine-warning.png)
- [TUI download keyboard focus](../../../outputs/atomic-tui-download-focus.png)
- [Web model-check failure and Retry](../../../outputs/atomic-web-model-check-recovery.png)
- [Web port warning after wheel scrolling](../../../outputs/atomic-web-port-wheel-warning.png)
- [Complete verification log](../../../outputs/atomic-desktop-verification.log)

## Desktop control parity replay

The October 23 follow-up compared the current `atomic-chat-ui` preview at `5043013`
with the rebuilt web app. The terminal was operated through a real PTY displayed
in xterm, using mouse clicks, scrolling and keyboard input. Fixture controls only
selected isolated server responses; product flows were exercised through the UI.

- Web: engine selection, direct model download, provider grid and inline editor;
  invalid-key checking returns focus to the key field, Connected cards become
  unavailable, Escape closes the inner confirmation before the provider editor.
- Web: media queue, removal confirmation, Escape cancellation, removal and
  continuation; a different model returns to the same Codex review with its engine
  selected and an explicit waiting state. The ready endpoint flow completes and
  returns to the running server. Reload skips the entrance on that saved profile.
- Web: rich model dropdown keyboard selection/Escape, sidebar collapse/reopen,
  Configuration switches, fractional-port warning and blocked Save, Discard,
  Server HTTPS proxy route, model search/clear, keyboard Filters/Sort dismissal.
- TUI: fresh engine selection by keyboard and mouse; direct model download;
  provider card arrows, wheel navigation and Escape; 54×24 and 120×36 resizing;
  ready agent configuration, model menu, explicit Configure and successful handoff.
- Visual replay found and corrected clipped model-card borders, truncated compact
  download estimates, and background fragments around the terminal connection
  dialog. The dialog now clears the previous screen and fits its content.

Automated regressions additionally verify late installation/disconnection responses
cannot dismiss a later editor, catalog search survives a download, and an open
model menu retains the highlighted identity when download completion reorders rows.
These timing cases are separate from the visible interaction checks above.

[Updated web overview](../../../outputs/atomic-web-desktop-parity.png) ·
[Updated terminal connection](../../../outputs/atomic-tui-desktop-parity.png)

## Annotation pass: shared settings and document ingestion

This pass uses `atomic-chat-ui` at `807b4d9` as the desktop reference. The following
are implemented product capabilities, with automated service/component evidence;
this section does not count them as keyboard-and-mouse journeys.

| Area           | Implemented behavior                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assistants     | Create, edit and delete presets, select the default, configure instructions and sampling, and select an assistant for a conversation. Saved selections persist; only the inference request receives generated instructions.                                                                                                                                           |
| Skills         | Create or import instructions, select a skill in the split list/detail view, enable or disable it, edit it, download a portable `.skill` archive, delete it, and try it in a fresh conversation. Only selected, enabled skills enter the prompt.                                                                                                                      |
| MCP connectors | Browse catalog templates, configure HTTP/SSE/stdio connections, edit/import JSON, test the connection, inspect returned tools and approve or decline tool calls in a conversation. OAuth includes discovery, PKCE, callback validation, refresh and an explicit client-ID fallback. Saving a configuration alone does not launch a process or establish a connection. |
| Attachments    | Shared enable/size/chunk/retrieval settings, file selection, removable attachment chips and configured text preparation at send time. Web uploads and TUI file paths use the same parser. Embedding retrieval calls a running core embedding model; unavailable models produce an error.                                                                              |
| Shared state   | The server owns saved settings and local conversation jobs. Web and TUI use the same feature operations and snapshots. Keys and OAuth tokens are excluded from public snapshots.                                                                                                                                                                                      |

The [feature-service tests](../src/workspace-service/features.test.ts) exercise
persistence across service instances, assistant prompt enrichment, selected-skill
behavior, connector checks/calls, masked secrets, attachment restrictions, package
resource retention and OAuth credential revocation. Separate
[terminal profile tests](../src/tui/workspace/server/profile-layout.test.ts) cover
compact/wide layouts, offscreen keyboard navigation, the menus, default selection
and Try in chat. Connector transport and OAuth tests use local test endpoints and
processes; they do not establish successful authentication with each catalog vendor.

The compiled macOS arm64 server passed the
[packaged-document E2E test](../test/e2e/workspace-documents.test.ts) on October 23.
That test starts the actual executable in an isolated temporary profile, extracts
the text of a PDF through `attachments.parse`, imports a skill, exports it as a
`.skill` ZIP and reimports that exported data, checking that its instructions are
preserved. This is a command-driven binary integration check, supplementary to UI
testing. It does not simulate the parser or use a separate parser-only bundle.

[Parser tests](../src/document-import/document-import.test.ts) additionally cover
multi-page PDF text, DOCX paragraphs, XLSX shared/inline strings and cached formula
values, PPTX slide text, skill resources, malformed/truncated archives, unsafe
paths, expansion and entry limits, invalid XML and entity rejection. The
[runtime compatibility test](../test/runtime-compat/documents.test.ts) exercises
the same PDF and portable-skill path without native rendering or external workers.

### Capability limits

- Attachment parsing extracts text, not document layout. PDF requires selectable
  text and must be unlocked; OCR, visual table reconstruction and image extraction
  are not provided. PDF processing is limited to 1,000 pages, a 30-second
  cancellation timer and bounded extracted text.
- DOCX imports the main document's paragraph text, without headers, footers or
  comments. XLSX uses stored cell values without recalculation or display-format
  conversion. PPTX imports slide text without speaker notes. Worksheet and slide
  files are read in numeric filename order, rather than custom workbook or
  presentation ordering. Legacy `.doc`, `.xls` and `.ppt` require conversion.
- Uploaded documents must fit the configured 1–100 MB limit; extracted text must
  fit 16 MB. Office and skill archives have a 256-entry and 64 MB expanded-data
  limit; encrypted, split and ZIP64 archives are unsupported. Skill packages and
  their retained resources have additional 10 MB limits.
- Skill import reads `name` and `description` as single-line frontmatter fields.
  It retains resource files for export but does not execute scripts or make those
  resources available as model tools. Selecting a skill adds its instructions.
- Automatic document mode uses a character-based threshold for inline text;
  larger input requires embeddings. Retrieval uses exact cosine search, not a
  vector index; explicit lexical retrieval remains a separate choice. This is not
  token-accurate budgeting against the loaded model's context size.
- Shared assistant/skill enrichment and cancellable jobs apply to the local
  server endpoint. The terminal's separately configured remote-endpoint fallback
  remains a direct stream. Browser image resizing is local to the browser.

The approved, pinned parser dependencies and the Node/Bun compatibility decision
are documented in the
[shared-feature ADR](decisions/2026-10-23-shared-workspace-features.md). Live vendor
OAuth, external credentials and large production documents have not been claimed
as verified by these local tests.

### Annotation pass: interactive verification

The production Web renderer and terminal frame renderer were exercised using
keyboard and mouse, with deterministic local fixtures for download, provider,
model, permission, and failure states. The updated prototype keeps those captures
separate from live-backend evidence. Initial engine selection, model selection,
permissions, cloud providers, media downloads, and the two server destinations
follow the same route order in both clients.

Interactive checks covered provider checking/connected presentation, download
pause/removal confirmations, completed downloads, inline engine settings/builds,
model loading confirmations, endpoint lists, invalid inputs, failed imports,
chat/media failure recovery, Help, nested Escape/outside-click dismissal, and
settings editors. Skills Create and Actions menus were opened; Try in chat
opened a fresh conversation with the selected skill checked. The native file
chooser reached Import 1 conversation without submitting the import.

An isolated compiled macOS arm64 server with real core 0.19.0 was also operated
through the Web app and a real PTY displayed in xterm:

- A new assistant saved in Web appeared in TUI. Its name was edited and saved
  with terminal keyboard/mouse input, and the Web list updated automatically.
- Starting the local API through the Web command controls changed the TUI to
  Stop server. Stopping it with the TUI's confirmation changed Web to Start
  server. The background server and both frontends remained available.
- Terminal mouse navigation opened settings and server routes; an engine menu
  closed on an outside click. The terminal was resized from 120×40 to 90×32.
- A regression check caught a separate 80×24 layout issue: the taller grouped
  server controls displaced sidebar agents. Compact controls now leave visible
  agent rows, and arrow navigation keeps each focused agent on screen. The built
  TUI was then resized to 80×24 and operated with the mouse wheel and Down/Enter:
  the final Xcode item remained visible and opened its connection screen.

[Live TUI state](../../../outputs/atomic-shared-state-tui.jpg) and
[live Web state](../../../outputs/atomic-shared-state-web.jpg) show the shared
server after stopping the API. This pass did not download a large model, run
live inference, authenticate a vendor account, or launch an external agent.

[Compact terminal keyboard check](../../../outputs/atomic-compact-sidebar-keyboard.jpg)
records the final sidebar item at 80×24. The full verification command passed
2,215 tests with four platform-specific skips; subsequent final Web changes passed
all 334 Web tests plus lint, typecheck and formatting. Bun runtime checks passed
all six cases. Logs are retained in the screenshot prototype's verification folder.

## Approved artwork and navigation pass

The latest comparison continues to use `atomic-chat-ui` at `807b4d9`. Web uses
the approved Monument entrance and white H3 header; TUI uses the approved Draft D
ASCII outline. Both entrances are titled Atomic Server. Status eyes are green
while running, amber while starting, turquoise X-shaped while stopped, and red with the
whole mark on error.

On entering the TUI intro, neutral X eyes open once through a half-open pose over
1.2 seconds; arms stay still until that wake-up finishes. Reduced motion shows
open eyes immediately. Both header sizes use the owner’s exact three-row mark
with a top cap and no bottom cap, preserving its 13-column shape. Its four ink
rows align with the full wordmark; the compact title shares the eye row. The
header outline stays still; its adjacent eyes sit one column farther right and
blink occasionally while running or welcoming. All eight intro arms curl
independently with irregular pauses; body, eyes, stems and arm roots stay anchored. Its opaque body masks a dark offset
ASCII shadow, so the shadow appears only outside the moving contour; the header
has no shadow. Reduced motion freezes the arms and blink while retaining the
status color. These are implemented controls and artwork, not screenshots painted
over the application. Draft D in the gallery uses the bundled production Canvas
renderer; fixed HTML bounds prevent movement of the whole mark. The adapter
omits redundant ground backgrounds so underscore contours remain visible. The
[final gallery proof](../../../outputs/atomic-server-prototype/design-review/atomic-server-final.png)
records the accepted 13×4 header aligned with the wordmark.

Keyboard-and-mouse checks of the production Web renderer covered the fresh
Choose engine entrance, explicit engine selection and progress, return to Press
any key, and deliberate entry into model setup. On the final embedded build,
Escape from the engine picker returned to the initial hero and focused Choose
engine without starting installation; the real TUI matched this behavior.
[Web proof](../../../outputs/atomic-server-prototype/verification/web-real-intro-escape-fixed.png)
and [TUI proof](../../../outputs/atomic-server-prototype/verification/tui-real-intro-escape-fixed.png)
record that return state. The approved header was inspected
at 855 and 1280 pixels wide. The chat settings icon opened the right-side panel;
Escape closed it and returned focus to its trigger. The model and New chat
controls retain consistent height.

A real TUI at 90×32 was operated through the browser PTY: Settings then Escape
returned directly to Server; opening the Codex connection and pressing Escape
returned directly to Server; attempting to start an unconfigured server opened
the model catalog with a warning. These interactive checks are separate from
the generated screenshot frames.

Final onboarding uses Minesweeper in both frontends. The TUI also retains a
separate optional Space Invaders popup while preparing an agent connection.
The Web waiting fixture was observed completing its download: the floating card
disappeared and Continue replaced Continue in background without dismissing the game.

The latest pass places the shared brand at the left and download status at the
right, stacking them at narrow widths. Popup backgrounds remain visible and
dimmed. Approved Beacon/Rover card art, immediate model selection, loading/retry
controls, and mixed engine/model queues are present in the real TUI. Focused tests
cover keyboard/mouse actions at 60×20 and normal sizes. Saved screenshots were
visually checked at all six requested terminal dimensions; the viewer now fits
large frames without clipping the footer. Email confirmation saves locally; it does not deliver email.

The final inventory contains 397 images and 74 paired routes, with no missing
files, hash errors, source-mapping errors, warnings, or duplicate captures. All
219 TUI captures match current frame payloads and sources. Web has 41 current
captures, including all 31 primary pages; 137 earlier variants remain explicitly
marked Earlier capture, including 41 paired dialog/flow/state views. This is a
partial Web refresh, not a claim that every variant was recaptured. Exact IDs
are listed in the prototype's `verification/web-monument-h3-refresh.json` and
`verification/final-inventory-audit.json`. Generated frames alone do not count
as captures. Fixture images do not prove live inference, real large downloads, email delivery, or external provider authentication.
