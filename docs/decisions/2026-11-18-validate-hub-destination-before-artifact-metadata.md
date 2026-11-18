# Validate the Hub destination before fetching artifact metadata

- **Context:** Media artifact planning reads pinned Hugging Face metadata. The server can supply
  `HF_ENDPOINT` and `HF_TOKEN` together, so the endpoint determines the recipient of the credential.
- **Decision:** Use the public Hub when no endpoint is configured. Require an explicitly configured
  endpoint to be an absolute HTTP(S) URL without credentials, a query, or a fragment. Preserve a
  valid mirror's base path and refuse malformed configuration before making a request.
- **Consequences:** A malformed mirror produces an actionable configuration error. The operator can
  correct the endpoint or unset it to select the public Hub.
- **Owner:** team
- **Links:** `src/workspace-service/models/artifact-metadata.ts`
