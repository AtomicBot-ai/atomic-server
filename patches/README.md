# Core model-error correction

The exact `@atomic-chat/core` 0.20.7 package patch corrects tensor-count mismatch errors. A complete Ollama model can have a tensor layout that the selected llama.cpp build does not support; the app must not claim the file is corrupted on tensor count alone.

`core-model-error-source.diff` contains the matching core source, regression tests and decision record. No device discovery, engine reuse, or local-file preflight exports are included. Replace the patch with a released core version once this correction is published.
