# Managed-runtime fixtures

Copied from `atomic-chat-core` @ 98a39a76 (v0.18.5) for the e2e of `atc engines install|rm` against the
core's fake Linux machine (`ATOMIC_MANAGED_TEST_HOST`, `test/helpers/fake-managed-machine.ts`):

- `runtimes/vllm.json` — `test/fixtures/runtimes/vllm.json`, the vLLM descriptor the core reads through
  `ATOMIC_RUNTIME_DESCRIPTOR_URL_VLLM`;
- `environments/linux.json` — `test/fixtures/runtimes/environments/linux.json`, the environment manifest
  served by a loopback "conf";
- `os-release-ubuntu-24.04.txt` — `test/fixtures/linux-probe/os-release/ubuntu-24.04.txt`;
- `tls/` — the core's test-only TLS material (CA and a leaf for `127.0.0.1`). The keys protect nothing;
  they exist so the loopback conf can speak HTTPS. Never reuse outside tests.

Copy them again from the core when its managed e2e fixtures change.
