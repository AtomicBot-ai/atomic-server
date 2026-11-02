# Remove automatic on-device discovery

- **Decision:** Remove the experimental cross-application model/engine scan, adoption operations, file-preflight flow, onboarding badges/tints, and launcher hints that searched previous profiles. Neither frontend offers files from Desktop, Ollama, LM Studio or other stores automatically. The published core remains pinned, with only a narrow error-classification patch for tensor-layout mismatches.
- **Scope:** Existing models explicitly installed or imported into the current server profile and normal catalog downloads continue to work. Source files and existing profile data are not deleted. A fresh launch creates an empty profile with normal onboarding.
- **Retained fixes:** Downloads popup, per-build catalog actions, expandable-row scrolling, system clipboard, persisted server selection, responsive Start/Stop controls, and visible onboarding Back/recovery controls.
- **Validation:** Contract tests assert that removed operations are unavailable and foreign data stores cannot populate a clean profile. UI and built-app tests cover normal onboarding and the retained fixes.
