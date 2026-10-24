---
date: 2026-10-23
title: "Share the latest desktop screen structure"
---

# 2026-10-23 — Share the latest desktop screen structure

- **Context:** The selected atomic-chat-ui reference advanced to `807b4d9` while the server clients still used `5043013` layouts. Model selection pushed its action below the viewport, the terminal had additional settings/navigation screens, and onboarding omitted desktop permissions and chat destinations. The owner explicitly requested those desktop-only screens as well.
- **Decision:** Share the desktop's model → permissions → cloud → media → purpose → server-destination flow across both frontends. The existing engine welcome remains the first-use entry. Onboarding hands off directly to Chat, Server configuration, or agent overview; it does not insert a connection wizard. Keep the same five Settings pages, three Workspace settings pages, three Playground tabs, and four primary Server navigation entries. Background work preserves the user's destination and draft.
- **Consequences:** Web uses actual browser permission APIs and immediately releases microphone tracks after checking access. A terminal cannot grant browser/OS permissions: its matching detail screen opens the web app and never reports a fabricated grant. The initial unavailable-state treatment of assistants, MCP clients, skills and retrieval was superseded by [Shared workspace features](2026-10-23-shared-workspace-features.md); those pages now use shared server operations. Real server configuration remains in General's expandable groups. Model recommendation labels do not invent device compatibility or sizes absent from the core.
- **Review artifacts:** Canonical screen identity is separate from loading/error/expanded variants. Screenshot review must pair the same screen across platforms, preserve annotation IDs, record unavailable functionality, and capture production renderers after the actual implementation changes.
- **Controls:** Catalog categories use the desktop-style custom picker. Chat history occupies the shared sidebar. Confirmation and rename actions use in-app dialogs with focus restoration, Escape handling and visible pending/error states; global workspace shortcuts cannot navigate away from an active modal.
- **Alternatives:** Retaining a server-only purpose flow was rejected by the owner. Adding mock backend capabilities or balancing screenshot counts with duplicate images was rejected because it would conceal functional differences.
- **Owner:** team.
- **Links:** `src/contract/workspace-navigation.ts`, `src/contract/desktop-flows.ts`, `packages/admin-ui/src/workspace/setup`, `src/tui/workspace/setup`.
