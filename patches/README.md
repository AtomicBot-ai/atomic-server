# Core model-error correction

The exact `@atomic-chat/core` 0.21.0 package patch corrects tensor-count mismatch errors. A complete Ollama model can have a tensor layout that the selected llama.cpp build does not support; the app must not claim the file is corrupted on tensor count alone.

The same correction, with its core tests and decision record, is proposed for the core in [AtomicBot-ai/atomic-chat-core#67](https://github.com/AtomicBot-ai/atomic-chat-core/pull/67). Replace this patch with a released core version once it carries that change.
