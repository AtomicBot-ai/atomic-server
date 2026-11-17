---
date: 2026-11-17
title: "Pair terminal connection engines with models"
---

# Pair terminal connection engines with models

- **Context:** The terminal connection guide listed compatibility for one model in the engine field and every downloaded model in the model field. The two fields could describe different runtime choices.
- **Decision:** Offer engines reported active by the server that have a compatible downloaded model. Filter the model field by the chosen engine, clear a model that no longer fits, and recheck the engine before loading the chosen pair.
- **Consequences:** A downloaded FastFlowLM model appears under FastFlowLM when that engine is installed. Model downloads already selected in onboarding can still show their progress in the guide.
- **Alternatives:** Deriving both fields from a single model would hide installed engines for other formats. Treating compatibility as installation would expose engines that cannot load the model yet.
- **Owner:** team.
