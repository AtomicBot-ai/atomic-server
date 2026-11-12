# FastFlowLM on Atomic Server

FastFlowLM runs native chat models on an AMD XDNA2 NPU on Windows x64 or Linux x64. The core chooses compatible engine builds and checks the NPU from the account actually running the server. A successful probe in an administrator shell does not prove that a background service has device access or sufficient memlock.

## Install and prepare

```sh
atc engines install fastflowlm
atc engines accelerators fastflowlm --json
atc engines accelerators fastflowlm --prepare --dry-run --json
atc engines accelerators fastflowlm --prepare
```

`engines install fastflowlm --prepare` checks preparation after installing the build. Driver installation is manual: on Windows, the core supplies the [AMD driver download page](https://www.amd.com/en/support/download/drivers.html); on Linux it supplies commands for the **server's** distribution and links to the [Linux NPU guide](https://lemonade-server.ai/flm_npu_linux.html). Admin renders links and a selectable command block; TUI and CLI print the same instructions. Run commands on the server host. The displayed Arch `pacman -Syu` command includes a system update; custom/old kernels and Secure Boot may need additional steps from the guide. Unknown or immutable Linux systems receive diagnostic commands and documentation instead of guessed package commands. The current FLM build bundles XRT, so the instructions do not install a second system copy.

After installing drivers, restart the machine if required and choose **Check again** in Engines → FastFlowLM, or repeat the accelerator command. A successful installer is not proof of NPU readiness: core rechecks from the server's account. New preparation operations do not fetch or offer automatic driver recipes. Existing journaled operations retain their pinned recovery protocol.

A measured low Linux memlock limit on an otherwise eligible NPU still has automatic built-in preparation, including on Arch. It raises the live server limit and persists future service/session limits after one OS authorization prompt. Review the account, service and changes; `--approve sha256:<digest>` accepts only that plan, or `--yes` accepts the returned plan. The TUI temporarily releases the terminal for sudo; a desktop server can open a terminal authorization prompt or use polkit. When no desktop prompt is available, authorize in the server's TUI. Existing parent shells retain their previous limits until a new login, so a new server launched from such a shell can require authorization again.

```sh
atc engines accelerators fastflowlm --resume <operation-id>
atc engines accelerators fastflowlm --cancel <operation-id>
```

Reboot, relogin and service restart requirements remain visible until the server's own probe succeeds. Restart the named service after a service limit or group change, then resume. Cancellation waits for a safe package boundary. Closing admin/TUI or using `--detach` leaves the operation running.

## Download, run and maintain a model

```sh
atc models catalog --engine fastflowlm
atc models pull qwen3-0.6b --engine fastflowlm --dry-run --json
atc models pull qwen3-0.6b --engine fastflowlm --request-id my-flm-download
atc models list
atc run qwen3-0.6b-npu2 --engine fastflowlm
```

Choose a model in the curated FastFlowLM collection; arbitrary GGUF/Hub repositories are not supported. The plan reports its license, context, capabilities, size and compatibility. For gated sources, accept their terms and set `HF_TOKEN` in the **server's** environment. Authorization is sent only to Hugging Face's origin and removed on cross-origin redirects.

The server downloads and verifies every pinned file, builds local configuration through the core SDK and publishes the model only when complete. Admin downloads continue after the browser closes. The existing chat UI and OpenAI-compatible API use the same core session; Stop/cancellation and unload use the normal server controls. Do not assume tools or reasoning support beyond the model's advertised capabilities.

```sh
atc models pull --engine fastflowlm --cancel my-flm-download
atc models pull qwen3-0.6b --engine fastflowlm --request-id my-flm-download
atc models pull qwen3-0.6b --engine fastflowlm --refresh --request-id flm-update-2
atc models rm qwen3-0.6b-npu2
```

Resume with the same request ID keeps the original source commits even if the catalog changed. Use a new request ID and `--refresh` to review an update. Installation keeps a verified old version until replacement succeeds; allow space for both. Removal and replacement take the core maintenance guard, which unloads the model and blocks new loads through server restarts. Recovered journals finish before normal server work.

In admin and TUI, open **Engines → FastFlowLM** for builds and NPU preparation, and **Library → FastFlowLM** or guided setup for models. Both use the same preparation operation, exact consent and durable download jobs as CLI.

## Atomic Chat integration handoff

The [desktop handoff in the shared spec](../../atomic-chat-spec/openspec/changes/add-fastflowlm-runtime/rulings/desktop-handoff.md) records the FLM pitfalls found in Atomic Server: driver and memlock setup, probe and file-check costs, catalog/variant selection, launch settings, cancellation and recovery. Desktop tasks and regression scenarios link to it; server hardware results do not qualify the desktop integration.

## Development and release gates

The FastFlowLM SDK ships in the exact `@atomic-chat/core` version pinned in `package.json` and `bun.lock`.

`ATOMIC_MODEL_CATALOG_URL` (or the existing `ATC_MODEL_CATALOG_URL`) accepts a local `file://` catalog. The core receives its `ATOMIC_FASTFLOWLM_MANIFEST_URL`, `ATOMIC_FASTFLOWLM_ENVIRONMENT_MANIFEST_URL` source overrides from the server environment. Overrides are development inputs; remove them for production acceptance.

Fixture tests prove downloading, hash and credential checks, consent binding, recovery and UI reconnection. They do not prove driver installation, a real NPU inference, service credentials or Windows/Linux reboot behavior. Record those separately against the final built `atc` and published engine assets.


## Catalog and recommendations

The conf-owned FLM collection offers 44 XDNA2 chat checkpoints from the shipped engine revision.
Ten editorial recommendations appear first and carry a Recommended label. Every other entry
remains selectable. Recommendations do not imply hardware qualification: imported entries are
marked unverified, while the existing Qwen3 0.6B acceptance remains valid. Actual compatibility
is checked by the core before installation. Model weights and kernels still use pinned file plans.

The bundled fallback includes the same 44 entries and ten recommendations, so a first launch without
network access or a cached catalog still lists FLM models. A valid remote or cached catalog takes
precedence, even when it contains no FLM collection. Engine and model downloads still require their
source files to be reachable; listing a model does not prove that the NPU can run it.
