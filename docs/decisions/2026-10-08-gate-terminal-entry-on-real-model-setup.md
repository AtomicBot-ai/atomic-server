# Gate terminal entry on real model setup

The first-run workspace chooser must lead to a working local model, not a console of disconnected controls. The terminal now plans installation through Core 0.11.2, shows its live hardware-compatible engine catalog and Hugging Face model files, and starts durable model setup operations. The core owns all downloads, verification, model registration, and processes. Engine installation and model transfers continue when the terminal exits. The terminal stores only the chosen plan and first-run completion in `atc/setup.json`.

Entry remains blocked until every selected model and engine reports ready and the first model loads successfully. A failed or paused operation can be resumed without discarding partial files. Returning clients rebuild progress from the core snapshot and stream. Transfer estimates derive from observed byte deltas; no estimated time is shown before a speed sample exists. Four range streams are enabled for large hash-pinned models, with the core's single-stream fallback for unsupported hosts.

The server dashboard prioritizes explicit Start/Stop, endpoint, credentials, and named API keys. `atc/client-keys.json` is owner-readable, written atomically under a cross-process mutation lock, and sampled by the core per request. Revoking one key does not interrupt clients using others. An absent keyring retains plain CLI legacy authentication; a damaged initialized keyring fails closed.

Conversations live in individual owner-readable `atc/chats/<uuid>.json` files with title, working directory, model, endpoint, messages, and interrupted-response state. The recent conversation picker follows Atomic Agent's model: recent sessions across projects, filter, and resume with context. Neither chat content nor client keys enters the request inspector.

The rendering grid is also the mouse hit map. First-run stone plates include their complete inscriptions in a single target. Responsive towers, the eye, and gate details yield space to controls at small sizes. Download artwork and the once-per-minute rider obey reduced motion. Primary navigation occupies a coloured header band.

The private preview pins a bundled build of the companion core changes. Before a public merge, replace the vendored preview dependency with the corresponding published core release.
