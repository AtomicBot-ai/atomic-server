---
date: 2026-11-10
title: "Sign Windows binaries with the key in Azure Key Vault"
---

# 2026-11-10 — Sign Windows binaries with the key in Azure Key Vault

- **Context:** The release signed the Windows binaries through DigiCert KeyLocker (`smctl`, the DigiCert
  KSP and `signtool` with the certificate's fingerprint), authenticated by four repository secrets
  (`SM_API_KEY`, the client certificate and its password, the fingerprint). KeyLocker meters every
  signature against a quota shared with the other Atomic repositories; when it ran out, signing failed
  with nothing but an opaque `signtool` error. The same DigiCert certificate, with the same subject, has
  been reissued onto a non-exportable HSM key in an Azure Key Vault Premium vault, which other Atomic
  repositories already sign with.
- **Decision:** `sign-windows` runs in the environment `codesign`, signs in to Azure with GitHub OIDC
  (`azure/login`, the app registration's federated credential bound to that environment) and
  `scripts/sign-windows-binary.ps1` signs with AzureSignTool (pinned) against the vault's certificate,
  with the DigiCert timestamp. `signtool` only verifies. The environment's variables name the app, the
  tenant, the vault and the certificate; no secret is stored. The script keeps its interface (the
  binaries as arguments, `ATC_ALLOW_UNSIGNED`) and also signs by hand with `az login`.
- **Consequences:** No per-signature cost and no credential to rotate or leak. The signer's subject is
  unchanged, so `atc update`'s signer pin (`src/update/trust.ts`) accepts the next release; a future
  certificate must keep it too. Signing depends on Azure and on the federated credential's subject
  `repo:AtomicBot-ai/atomic-server:environment:codesign`: renaming the repository or the environment
  breaks it. The OIDC sign-in cannot refresh after about an hour, so the job signs right after it. The
  environment admits every branch, as the old repository secrets did, so a run by hand on a branch signs
  too; restricting it to tags would block those runs. Not yet run end to end in this repository.
- **Alternatives:** Keep KeyLocker: metered, and the quota stops releases. Jsign (works from any OS):
  the job already runs on Windows and the other repositories use AzureSignTool. Azure Artifact Signing:
  a different publisher subject, which the signer pin would refuse. A client secret for the app
  registration instead of OIDC: a secret to store and rotate.
- **Owner:** `team`.
- **Links:** `.github/workflows/release.yml`, `scripts/sign-windows-binary.ps1`, `docs/release.md`;
  AtomicBot-ai/atomic-chat-conf `.github/actions/windows-code-sign/action.yml`; AzureSignTool
  (https://github.com/vcsjones/AzureSignTool).

<!--
Supersedes: 2026-10-09-build-natively-sign-then-smoke-the-draft.md   (its Windows signing only: DigiCert KeyLocker)
-->
