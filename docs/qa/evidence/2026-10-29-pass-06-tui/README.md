# Pass 06 evidence

These are real macOS arm64 PTY captures and synthetic workspace data. `identity.json` identifies the unchanged fixed binary, disposable data folder and time window. No engine binaries, weights, credentials or production data are included.

## Replay prerequisites

The retained QA workspace must be started with the matching binary and a ready API. It contains upstream llama.cpp, TurboQuant, MLX and the LFM2/LFM2.5 models. MLX is installed already; the B17 probe unloads its checkpoint to make the asynchronous race observable. `notes.txt` in the fixture root is a synthetic attachment. The active-request check also needs the synthetic `QA pass06.` conversation created during this session.

The Python probes require `pyte` (0.8.2 was installed into `/private/tmp/atomic-qa-pyte` for this session). This is temporary QA tooling, not a new project dependency. Each probe accepts a metadata JSON file containing `binary`, `base`, and `data`; `identity.json` has those fields. The folder guard accepts only a disposable `atomic-qa-*` base with its data folder directly inside it. To use a new fixture, prepare equivalent isolated data and replace the three metadata paths.

```sh
python3 B17-reproduce.py /absolute/path/to/identity.json
python3 B18-reproduce.py /absolute/path/to/identity.json
python3 B19-reproduce.py /absolute/path/to/identity.json 20
python3 B19-reproduce.py /absolute/path/to/identity.json 15
python3 B19-reproduce.py /absolute/path/to/identity.json 14
```

B17 exits 1 when the newer endpoint is overwritten. B18 is a diagnostic probe: it prints whether each error was visible and captures correction with a valid file. B19 exits 1 if the final enabled skill is unreachable in the wide popup; 15 and 20 fail, while 14 is the wide-window control. The narrow-window reachable names are reported separately, so the 14-skill wide success does not claim that all 14 are reachable at 54×24. B19 creates or updates only its 20 synthetic skills and changes their enabled count.

For the remaining B16 variant, first select installed MLX with the authenticated `engines.select` operation, then run `B16-full-id-reproduce.py` with the metadata path. It exits 1 when the saved MLX choice has no current marker despite a ready MLX service. `active-other-turn-check.py` checks refusal, draft recovery, New chat, Quit and absence of the refused draft from durable history.

These probes are standalone discovery evidence; no failing tests were added to the maintained CI suite. Initial incomplete harness attempts are excluded from confirmed results. The session report distinguishes live-engine coverage, negative results and untested areas.
