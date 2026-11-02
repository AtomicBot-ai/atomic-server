# Wait for the first model before server handoff

- **Context:** A terminal's stale model choice could miss the pending onboarding download. An empty API listener was started automatically and appeared as Stop API while no model could serve requests.
- **Decision:** Use the server's saved model selection when choosing the waiting screen. Endpoint, agent and pending Skip setup paths lead to Minesweeper. The waiting screen's explicit control-panel action is the only early exit. Keep completed onboarding shared between clients.
- **API:** A shared download guard blocks Start/Restart while the first text model or selected engine is pending. The first download stops only an empty listener; an already loaded chat model keeps serving. Boot uses the same operation guard. Finishing setup early records the choice without loading pending files.
- **Interface:** Both clients show a muted download status with an ellipsis in place of Start/Stop. It remains focusable and hoverable; activation only explains the wait and highlights download progress. Completed downloads restore the normal action.
- **Validation:** Model-selection, optional-media, paused/error, loaded-model and running-empty-listener regression cases; built Web and terminal journeys using keyboard and mouse, including both destinations, Minesweeper and the explicit override.


## Follow-up: preparation and standalone engine downloads

The first gate still missed the interval before the model job existed: the TUI advances to Permissions
while file lookup and planning run in the background. The latest failing profile completed onboarding
before its model job was created. The gate also ignored standalone engine downloads.

Onboarding now checks the entire unfinished download queue, independent of selected-model matching,
and retains the terminal's in-flight preparation state until its job exists. Both destination cards and
Skip setup enter Minesweeper during that interval. The waiting screen remains until the user explicitly
continues; no completed engine can cause a handoff while model preparation is still pending. API controls
also retain their waiting state during terminal preparation and unassigned transfers. An already loaded
chat model remains available.

Regression coverage includes delayed file lookup, engine-only downloads, the engine-to-model handoff,
stale selection, both destination cards, and the explicit waiting-screen override.


The full-page Web onboarding keeps focus containment and Escape/Back navigation, but disables
outside-click dismissal. Empty margins must not navigate to an earlier step. Nested popups retain
their normal outside-click close behavior.
