# 2026-11-06 — Offer registered chat engines before installation

- **Context:** The terminal intro offered uninstalled llama.cpp, MLX and FastFlowLM builds but hid other registered chat engines. Sending every engine to the artifact download queue would fail for managed engines, which require a reviewed environment plan.
- **Decision:** Show all chat engines returned by core, regardless of installation. Keep llama.cpp's recommended build per provider. Managed engine choices persist the provider and open the existing requirements/setup panel before model selection; artifact engines keep the server-owned download queue. A successful empty llama.cpp catalog no longer prevents other registered engines from appearing. Failed catalog reads still report their error.
- **Consequences:** Users can discover vLLM, SGLang and TensorRT-LLM before installation and see their actual platform/hardware blockers. Offering a choice does not claim the engine can run on the host. Media engines remain in their own setup step. No hardware policy is copied from core and no environment is installed without its existing reviewed plan.
- **Alternatives:** Hiding uninstalled runtimes prevents first installation. Queuing managed engines like ordinary binaries bypasses their environment-plan workflow. Declaring every registered runtime compatible would misrepresent hardware requirements.
- **Owner:** team.
- **Links:** `src/tui/workspace/intro/use-intro-engine.ts`, `src/tui/workspace/setup/intro-managed.test.ts`, `src/terminal-setup/engine-catalogs.test.ts`.
