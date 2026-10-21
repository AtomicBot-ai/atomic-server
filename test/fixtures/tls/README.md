# Test-only TLS material

Copied from `atomic-chat-core/test/fixtures/tls` @ 67bc5759 (v0.18.5): `selfsigned.pem` /
`selfsigned.key`, a standalone self-signed leaf generated with `openssl` on 2026-09-15, valid 10 years.
The key protects nothing: it lets the loopback release mirror of the Foundry Local e2e
(`test/helpers/release-mirror.ts`) speak TLS behind a proxy the install request marks `ignore_ssl`.
Never reuse outside tests.
