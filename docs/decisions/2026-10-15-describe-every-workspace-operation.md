---
date: 2026-10-15
title: "Describe every workspace operation"
---

# 2026-10-15 — Describe every workspace operation

- **Context:** `atc mcp` hands each operation's `description` to agents as the tool description. In 76 of
  101 operations it repeated the title ("Status", "Capabilities"), others listed the request fields the
  schema already lists. Each entry spelled out its whole object by hand, so the media file reached 562
  lines.
- **Decision:** Entries are built by `operation(name, title, effect, description, input)` in
  `src/contract/operations/define.ts`: the group comes from the name, `mutates` from the effect (a secret
  that is only revealed passes `{ mutates: false }`), the empty schema is the default, and Core pass-through
  bodies use `request(fields, required)`. Every description says what the operation does.
  `workspace-operations.test.ts` fails when a description equals its title, is shorter than 20 characters
  or lacks a full stop.
- **Consequences:** The registry is the same as before except for the descriptions (checked by comparing
  the serialised registry before and after). The terminal UI and the web admin show the new descriptions
  in their operation forms. Request bodies of the media operations live in `media-requests.ts`.
- **Alternatives:** Generating descriptions from Core's route docs — Core does not publish them, and an
  agent needs the atc-level meaning (what is saved, what is loaded, what needs what first).
- **Owner:** `team`.
- **Links:** `src/contract/operations/`, `src/agent-control/mcp.ts`.
