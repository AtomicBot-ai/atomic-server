---
date: 2026-10-29
title: 'Report release runs to Telegram'
---

# 2026-10-29 — Report release runs to Telegram

- **Context:** The core and desktop release workflows report their progress to a shared Telegram chat. Atomic Server releases also publish Linux packages after the GitHub release.
- **Decision:** Send a start message after version validation and a final message after the release jobs, including the Linux repository job. Use the existing Telegram bot and chat secrets; missing secrets or delivery failures do not block a release. Distinguish an unsigned dry run from a published release and show skipped Linux repository jobs.
- **Consequences:** Operators can follow a run and see which stage failed, including package publication after the GitHub release. Delivery is best effort and a forcibly cancelled workflow may not send its final message.
- **Alternatives:** Reporting success immediately after GitHub publication would hide later Linux repository failures; making Telegram a release gate would make an unrelated service outage block releases.
- **Owner:** team.
- **Links:** `.github/workflows/release.yml`.
