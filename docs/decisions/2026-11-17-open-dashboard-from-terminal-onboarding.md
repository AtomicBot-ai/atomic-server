---
date: 2026-11-17
title: "Open the dashboard from terminal onboarding"
---

# Open the dashboard from terminal onboarding

- **Context:** The terminal's final Skip setup action could open the download waiting screen or wait for manual setup to load the selected model and start the API.
- **Decision:** Label the final action Go to dashboard and use `setup.manual` with `restore_selected: false`. Keep any active model preparation attached to the dashboard and retire its terminal setup view when the download finishes.
- **Consequences:** The dashboard opens after the completion record is saved, even while model preparation runs. Loading a model remains an explicit action on the dashboard or in the connection guide.
- **Alternatives:** Automatically loading when the download finishes would still start inference or the API after choosing a navigation-only action.
- **Owner:** team.
- **Links:** [Save dashboard exit without starting a model](2026-11-17-save-dashboard-exit-without-starting-model.md).
