# Desktop flow mapping

Reference: the owner-selected `atomic-chat-ui` redesign at **5043013**, inspected on October 23, 2026. Paths below are relative to the reference's `web-app/src`. The reference remains read-only. The running preview and its source were compared because responsive screenshots hide some table columns that remain present in `LocalModelTable.tsx`.

## Reference screens and controls

| Reference | Atomic Server web | Atomic Server terminal |
| --- | --- | --- |
| `preview/onboarding/Onboarding.tsx`: model-first setup | Installed models and model choices; selection starts the checked download without a confirmation screen | Installed choices scroll with focus; model cards start the recommended download; Versions is a control on each card |
| Onboarding download strip above the heading/content | Live model/status/progress/ETA strip at the top | ASCII download frame above the heading/content on cloud and media steps; direct pause/resume and removal remain clickable |
| Onboarding fixed footer | Back and Skip setup; forward Skip/Continue above the footer | Bottom Back and Skip setup, with a larger inverted Skip/Continue action above them |
| Cloud step | Scrollable provider cards with marks; selected provider form; key-first connection check; muted Connected state | Scrollable ASCII provider cards; masked key editor; checking animation; muted Connected tag; optional Connection options |
| Optional image/video step | Image/video cards with model selection and Add to queue; confirmed queue removal | Two image/video cards with ASCII animation, model dropdowns and Add to queue; confirmed queue removal. Side by side when wide; stacked or scrollable when compact |
| Purpose/handoff | Configure an agent, configure an endpoint, or manual setup | Agent and endpoint ASCII choice cards, manual setup action, and agent marks |
| `containers/server-concept/Setup.tsx`: agent/model/endpoint configuration | Supported agent catalog, model and engine selection, port, configure/retry/success | Scrollable agent cards and model/engine dropdowns; download frame above the content; changing a model returns to the preserved connection step |
| Server overview | Searchable Agents & tools grid, Configure actions, endpoint shortcut, collapsible activity | Searchable agent cards, keyboard/mouse scrolling, endpoint shortcut, activity/log controls |
| Server side navigation | Primary rail, server start/stop, engine/model selectors, Connections, server sections, agents | Primary rail and contextual sidebar; section menu on compact terminals; engine/model selectors and separate connection view |
| Server configuration | Model/engine settings and explicit Save/Discard; address/port/key controls | Same settings operations, staged selection dropdowns and explicit Save/Discard; fields remain selectable at compact sizes |
| Models Hub navigation | Downloads; Local models, Cloud providers, Custom Endpoint, Inference engines | Same sections. Local models is the default. Custom Endpoint opens its editable provider/URL form directly |
| `containers/hub/HubSearchToolbar.tsx` and `HubFilters.tsx` | Category dropdown, search, separate Filters/Sort menus, Import | Same top toolbar, keyboard-accessible menus, engine/format radios, liked/installed/uncensored filters |
| Catalog engine/format behavior | Selecting an engine selects its format; selecting a format clears the engine; Clear filters preserves format/sort | Same behavior; category changes clear hidden text-only filters |
| `containers/hub/LocalModelTable.tsx` | Responsive metadata table with expandable model details and version/download controls | Responsive ASCII rows and sortable metadata columns; inline expanded version picker and direct Download; download controls stay in the expanded family |
| Table metadata | Available catalog metadata, installed state, unknown fields left empty | Model, Parameters, Format, Context, Capabilities, Download size, This device, Engines as space allows. Missing metadata is `—`; This device means downloaded, not a guessed memory-fit verdict |
| `containers/hub/MediaHub.tsx` | Category/search/import toolbar and inline media family controls | Same toolbar composition; bordered family rows with developer details, Installed/Available sections, expandable quant choices and load/delete actions |
| Foundry Local catalog | Model families with variant selection and accelerator preparation | Inline family/variant selection; required accelerator preparation returns to the same catalog; compatible variants download directly |
| Installed models | Direct deletion with confirmation | Direct deletion with confirmation. Imported files absent from the remote catalog remain listed in Local models |
| Settings and Playground | Settings sections use supported server configuration; Playground remains secondary | Dedicated settings cards, switches and enum dropdowns with staged Save/Discard; Hardware loads System/Processor/Graphics facts. Playground remains a secondary rail destination |

## Server-specific behavior

- First use starts with Choose engine. Installation shows real transfer progress; Press any key becomes available after installation. Returning or resumable profiles go directly to the saved workspace.
- The server owns downloads. Switching screens or closing a client does not cancel them. Pause retains partial files; Remove requests confirmation and discards that download's unshared partial assets. Delete is distinct and requires confirmation.
- Provider connection is checked before a Connected state appears. Model IDs can be discovered from the provider's compatible model-list endpoint; endpoint/model overrides are optional. Native-only provider APIs need a compatible gateway.
- Agent/endpoint preparation loads the model, prepares credentials, starts the API and tests inference. Failures remain on the same flow with a retry. A new model selection preserves the agent, endpoint and connection step.
- While a selected model downloads, its engine stays selected and configuration waits explicitly. Optional Minesweeper (web) and ASCII Space Invaders (terminal) return to the same draft; download completion never configures a connection automatically.
- Desktop chat-first choices, client-device permissions, email reminders and simulated hardware/download data are omitted. Atomic Server's destination is a server or an agent connection.

## Differences and limits

These are capability or terminal adaptations, not claims of exact desktop feature parity:

- Voice catalog/settings are absent because this server/core workspace has no voice operations. No decorative Voice button is offered.
- Foundry Local uses the inline catalog family layout. A missing engine opens its installation controls; accelerator preparation runs from the family and returns there. Core compatibility blockers remain enforced.
- Managed engine host permissions, engine-specific options and some diagnostics retain the existing server operation forms. Native desktop settings that have no server equivalent are not copied.
- The terminal uses ASCII art and responsive text columns instead of raster model artwork. Search and credential text entry use a focused terminal editor. Compact terminals use a section menu and fewer metadata columns; supported minimum is 54×24.
- Hardware memory-fit estimates, undocumented model metadata and native provider OAuth are not fabricated. External agent installation/config-file writing is offered only where a supported launch profile exists; other agents receive manual connection details.
- A working Cloudflare installation is required for remote tunnels. API/engine failures are shown as failures, not simulated success.

## User journeys and verification

| User | Direct route | Recovery |
| --- | --- | --- |
| Coding assistant user | Choose engine/model → optional provider/media → agent → configure | Downloads continue; model changes return to the same agent; retry remains in the connection guide |
| App developer | Choose engine/model → endpoint → port → configure → copy URL/key | Invalid ports stay editable; inference failure never reports ready |
| Media user | Add image/video models to the queue → endpoint or manual setup | Pause/resume/remove are available on each download; completed models can be deleted with confirmation |
| Experienced operator | Skip setup → server settings and Local models | Manual setup is recorded without claiming that inference was verified |
| Returning user | Saved workspace directly | Interrupted transfers retain their durable server records and partial bytes |

Focused terminal journeys cover category menus, filtering/sorting, version selection and direct download, Foundry accelerator preparation and blocked-plan handling, local import, provider checking, optional media queue/removal, preserved connection selection, installed-model access, and click targets at 54×24, 80×24, 120×36 and 160×50. The mounted terminal contract test installs a fixture engine with visible progress, starts a fixture model download, restarts the server and resumes the partial download before verifying the endpoint.

The real macOS arm64 PTY test covers a fresh profile's engine gate, returning-profile startup, terminal resizing, section navigation, the provider/key editor and back actions, settings, Playground, help, and terminal restoration. It uses temporary profiles and a cached fixture catalog; it does not install a live model, send real provider credentials, or modify the user's active profile. The final repository-wide verification results are recorded separately from this screen mapping.

## Control parity follow-up

The current pass also uses the reference Inter/Studio fonts, rich model/engine
identity menus, paired connection fields and summary, inline onboarding provider
credentials, responsive tile grids, and desktop-width sidebar collapse. HTTPS
proxy stays within the Server context and edits the supported outgoing-download
proxy settings. It does not imply that the server has the prototype's proxy-test
or separate password APIs.

Terminal fields, switches, navigation and action buttons have distinct treatments.
Provider cards use spatial keyboard navigation and a visible scroll track; compact
onboarding preserves four visible choices with a download in progress. Catalog
headers show sort direction, settings keep Discard left and Save right, and
connection dialogs clear the prior screen and fit the current step. Nested menus
keep the connection draft and explicit configure action intact.
