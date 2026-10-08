# Shared terminal chat and API operations

Status: proposed for private testing

The server CLI has a terminal shell but no working public API commands or chat command. Implement public OpenAI-compatible model discovery and streaming in `terminal-service`, and use CoreLink for explicit API start, stop, and status. Plain commands and the TUI use the same operations.

Connections do not follow redirects with credentials. Chat keys come from environment variables; configuration stores only endpoint, model, landing workspace, and display preferences. Configuration version 3 adds these preferences without discarding version 2 settings. Request activity contains metadata only.

No new dependency is required. The published core pin remains 0.5.1. Private testing also uses the built source of core tag 0.11.2 because that version is not available from the configured npm registry. This local build substitution is not a released dependency change.
