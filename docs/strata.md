# Strata on Atomic Server

Install the engine on the server and browse the pinned model variants before choosing one.

```sh
atc engines install strata
atc models catalog --engine strata
atc models search qwen --engine strata
atc models pull iq3-xxs-dflash2 --engine strata --dry-run
atc models pull iq3-xxs-dflash2 --engine strata --request-id qwen-metal
atc run iq3-xxs-dflash2 --engine strata
atc config get engine.strata.memory_mode
```

The same catalog and server-side jobs are available in the terminal and web admin. The server
checks the selected bundle, GPU and disk on its own host. The engine bundle includes Python.
Set `HF_TOKEN` in the server environment for gated Hugging Face inputs after accepting their terms.

For a local import, use `--import-dir /absolute/server/path` with `models pull --engine strata`.
The directory must have all the selected variant's files at the relative paths shown by
`--dry-run`. The server copies and hashes the inputs before registration. The original
directory stays under the operator's control.

After acquisition, the same job shows **Preparing model** while the core builds and verifies
the runtime data. If the server restarts, repeat the original `models pull` with the same
`--request-id` or choose **Resume** in Downloads. The saved plan supplies the source revisions and
hashes even if the catalog has changed. Cancel with `atc models pull --engine strata --cancel qwen-metal`.
A replacement keeps the previous files while the core holds the model for maintenance.
Use Installed models or `atc models rm <variant>` to delete an installed model.

For local conf testing, set the following variables in the environment of the process that
owns the server. Use absolute file URLs from a checkout with qualified bundles.

```sh
ATOMIC_STRATA_MANIFEST_URL=file:///absolute/conf/backends/strata-manifest.json
ATOMIC_MODEL_CATALOG_URL=file:///absolute/conf/models/catalog.json
```

The engine uses the first override. The workspace uses the second unless
`ATC_MODEL_CATALOG_URL` is set. Chat uses the existing authenticated OpenAI-compatible listener.
