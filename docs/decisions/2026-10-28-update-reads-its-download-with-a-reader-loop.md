---
date: 2026-10-28
title: "The update reads its download with a reader loop and gives up on a stall"
---

# 2026-10-28 — The update reads its download with a reader loop and gives up on a stall

- **Context:** `test/e2e/update.test.ts` timed out on the windows-2022 runner in the CI runs of
  v0.2.3, v0.2.4 and v0.2.5, sometimes in the real update, sometimes in the tampered-`SHA256SUMS` case,
  and `afterAll` then failed with `EPERM: unlink atc.exe`: an `atc update` was still running. The two
  cases share one step, the download, and the tampered case runs nothing after it (no PowerShell, no
  restart). `atc update` read the body through `Readable.fromWeb(res.body)` and `pipeline()` into
  `createWriteStream`, the one such bridge in the repository, and that bridge is a known Bun 1.3 fault:
  the pump sometimes stops reading in the middle of a body and the pipeline promise never settles
  (oven-sh/bun#34559, fixed in Bun 1.4.0; atc is compiled with Bun 1.3.10). The same stall was seen
  once before on windows-2022 as "exit 0 after 926 ms with no output" (PR #16): the loop had emptied.
  `holdOpen()` from that PR keeps the loop alive, so the stall now shows as a hang until the test's
  timeout, with the hung process holding `atc.exe` open.
- **Decision:** `nodeUpdateFiles.download` reads the body from `res.body.getReader()` and writes each
  chunk through a `FileHandle`, as the daemon's model downloader (`src/downloads/single.ts`) already
  does on every platform, hashing as it goes. A chunk that does not arrive within `DOWNLOAD_STALL_MS`
  (30 s) ends the command with `ATC_UPDATE_FAILED` ("stalled"), the fetch aborted and the file removed;
  a body shorter than its `Content-Length` is `ATC_UPDATE_FAILED` too, not a checksum mismatch. The e2e
  test tracks every atc it spawns, kills one still running after 90 s (the whole first case took 14 s on
  windows-2022) with what it printed in the failure, kills the rest in `afterAll` before stopping the
  server, and removes its folder with retries.
- **Consequences:** No transport fault can hold `atc update` open: the worst case is a failure that
  names the stall after 30 s and leaves the installed binary untouched. The e2e suite cannot leave an
  `atc.exe` behind, so a failure reads as the step that failed, not as `EPERM` in cleanup. The timeout
  stays 120 s; nothing measured needs more. The Bun pin stays 1.3.10 (the release workflow's own
  reasons); moving to 1.4 would remove the upstream fault but not the need for a bound.
- **Alternatives:** A longer test timeout — the hang is unbounded, no timeout covers it. Passing an
  `AbortSignal` into `pipeline()` — on Bun 1.3 the abort does not reach a stalled pump either
  (heygen-com/hyperframes#4342). `res.arrayBuffer()` — 80 MB in memory and still Bun's streaming
  underneath. Bumping Bun to 1.4 — a runtime change for every binary, to be decided on its own.
- **Owner:** `team`.
- **Links:** `src/update/node-files.ts`, `src/update/node-files.test.ts`, `test/e2e/update.test.ts`,
  `src/io.ts` (`holdOpen`), CI runs 40568607499, 40662156975, 40676550883; oven-sh/bun#34559,
  heygen-com/hyperframes#4342; `2026-10-26` PR #16 (fix/windows-update-checksum-test).
