# Server control from an agent

The terminal, web admin and agent commands control the same Atomic Server data folder. Add the same
`--data-folder /absolute/path` flag to each command when using an isolated installation.

## Discovery and execution

```sh
atc control list --json
atc control call hardware.info --json
atc control call engines.list --json
atc control call models.catalog --input '{"category":"text"}' --json
atc control watch --count 1
```

`control list` works without starting the server and includes every operation's input schema, required
fields and effect. `control call` starts the background server if needed, never prompts, and returns one
JSON document with `schema_version`, `operation`, `status` and `result` when `--json` is supplied. Errors
are JSON on stderr and a nonzero exit status. Supply complex inputs as `--input @request.json`. Never
parse the human table output in an agent.

## Guided installation without screen automation

1. Inspect hardware, engine availability and the Atomic model catalog.
2. List model files. Select an exact compatible file; don't invent a filename or quantization.
3. Call `models.plan` with the chosen `repo`, `file` and projector preference.
4. Resolve blockers, show the download size, then call `models.install` with the original `request`,
   returned `plan_digest` and a stable `request_id`. Reuse that ID when retrying the same install.
5. Poll `setup.status`. Resume or cancel by the returned setup ID. Closing the client does not cancel it.
6. Load the installed model, start the API and call `setup.complete` to verify readiness.
7. Call `connection.info`; reveal or create a client key only when the user needs it.

`atc setup manual` records a deliberate skip. It opens the workspaces but does not mark an untested
model as ready. Media model planning uses `artifacts.plan` / `artifacts.install`, and task parameters are
exposed by the `media.*` operations. Engine and hardware requirements still apply.

## MCP

Configure the client to launch the absolute path to the tested binary:

```json
{
  "mcpServers": {
    "atomic-server": {
      "command": "/absolute/path/atc",
      "args": ["--data-folder", "/absolute/path/server-data", "mcp"]
    }
  }
}
```

This connection can inspect the server. Add `--allow-writes` to allow setup, generation and configuration.
Add `--allow-secrets` as well to allow API key creation/reveal and agent connection profiles. Discovery
omits disallowed tools, and calling a guessed tool name cannot bypass those restrictions. Do not log
secret-bearing tool results.

Tool names replace dots with underscores (`models.plan` → `models_plan`). Initialization and discovery
do not start Core. Long operations return job IDs where Core supports them; query those operations to
track progress. The transport uses newline-delimited JSON-RPC over stdin/stdout.

## Connect a coding agent

```sh
atc connect
atc connect atomic-agent --model owner/model
atc connect claude --model owner/model
atc connect codex --model owner/model
atc connect opencode --model owner/model
atc connect claude --model owner/model --export --json
```

The launch commands require an installed agent and a terminal. Export returns the isolated profile
instead. Profiles contain credentials: share the API address and a dedicated client key, never an admin
token or the Core control token. Keys can be named and revoked from Server or `atc api key`.

Codex connects through the server's Responses endpoint. Its connection settings apply only to that run;
its saved configuration, sandbox and approval choices stay in place. The API key is passed through the
child process environment. Text and function tools are supported by Core's Responses adapter; image
inputs and provider-hosted tools are not supported by that adapter. This follows the
[Codex custom provider configuration](https://learn.chatgpt.com/docs/config-file/config-advanced).

Exported launch commands include the current data folder and selected key ID, so running them connects
to the same server profile that produced them.

## Web admin

`atc admin` opens the bundled admin for the same data folder. Its login token is exchanged for a session
cookie. It is separate from inference client API keys. Server → Connect contains the endpoint, model,
client key and agent profile. The advanced operation console runs the same typed operations; it is not
an arbitrary shell.
