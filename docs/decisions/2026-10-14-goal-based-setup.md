# Goal-based setup and explicit download review

Status: implemented locally; manual regression in progress.

Customers arrive with tasks (chat, coding, app integration, team hosting, images,
video, embeddings and decisions), rather than a preferred engine. Both clients use
one browser-safe goal catalog for labels, workload categories and guidance. Goals
never change network binding by themselves.

The browser wizard defers network controls, requires an explicit visible model
selection, and directs verified users to a relevant workspace. Existing durable
jobs can be selected after reopening setup. Verification operates on that chosen
job; unrelated loaded services cannot enable Finish. Nested setup/install dialogs
contain keyboard focus and restore it on close.

The TUI routes text goals through its durable setup flow, now with a separate
review step before downloading. Media goals open the shared catalog after recording
manual workspace entry; this is not an inference-readiness assertion. Media setup
continues through existing catalog, download and load controls.

This is a usability change, not a new inference engine, retrieval system, network
security layer or guarantee of model quality. Model/hardware compatibility remains
owned by Core. Do not call an unexecuted workload tested.

The user requires mouse/keyboard testing plus server CLI commands only. Automated
test suites are not run for this change. Build compilation is development work.
Computer Use explicitly blocks terminal apps, so real TUI interactions remain a
manual release gate. Full results and customer journeys are supplied with the local
handoff outputs.

Manual regression exposed adjacent setup blockers. Relative data folders are now
resolved once against the injected CLI working directory before starting Core or
engines. The chat command resolves the default local endpoint to this profile's
API; a config file can contain serialized defaults, so a default-valued endpoint
also follows the profile unless overridden by an environment variable or command
flag. The local client key is used only for that exact running local endpoint.

The initial browser wizard remains mounted through setup completion so its Ready
screen is reachable. Resuming a job preserves the selected goal when its workload
category matches. Switching conversations clears stale usage data. Image/video
gallery requests now supply Core's required offset/limit (first 100 items), and a
never-configured gallery has a normal empty state. Other gallery errors remain
visible. Capabilities are requested after a corresponding model exists.

Real text inference, authentication/revocation, recovery, manual entry and browser
keyboard paths were exercised. Browser streaming/Stop remains a known gap; actual
TUI interaction, populated media galleries, media/vision inference, multi-download
races and the cross-platform matrix are not release-verified. The detailed results
live in the task's user-facing outputs; compilation is not counted as those tests.
