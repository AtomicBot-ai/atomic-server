# Responsive terminal workspaces

Status: proposed for private testing

The first screen chooses Personal terminal or Server console. Chat, Server, Models, and Settings are the four primary destinations. Requests and Access sit inside Server; Logs, Checks, and Command reference are secondary destinations. Opening or leaving the terminal does not start or stop the background server.

A character canvas calculates both rendered controls and mouse hit regions. Compact, standard, and wide layouts use terminal rows as well as columns. The minimum supported viewport is 54 by 24. Gate spires have separate levels of detail; the central eye uses generated character art with slow gaze transitions. Reduced motion and text-selection mode are available in Settings.

Tab and Shift+Tab focus controls; Enter activates; Escape dismisses a layer. Ctrl+G opens navigation, Ctrl+K opens shortcuts, Ctrl+N starts a chat, Ctrl+C cancels generation, and Ctrl+Q exits. Shortcuts use a modifier or leader so ordinary prompt text is never interpreted as a command. Hover and focus show the same hint. Ctrl+X releases mouse capture for terminal selection. Clipboard copy uses OSC 52, whose availability depends on the terminal.

The canvas uses no new dependency and works through Ink under Node and the compiled binary. Existing controller operations are retained. The old shell remains in source during this private trial. Model download and installation remain upstream stubs; the chat workspace connects to a prepared OpenAI-compatible endpoint. Conversations currently last for the open console session. Persistent history is separate follow-up work.

Server also offers Atomic Agent, Claude Code, and OpenCode launch buttons. Each handoff verifies the API is running, discovers its models, and shows the selected model before launch. The console releases raw mode and mouse capture before starting an interactive child without a shell. Exiting the child returns to Server. Missing agents show their official installation URL; the console does not install software automatically.

Atomic Agent uses a separate profile under this server's data folder and an environment key reference. Claude Code receives the Anthropic-compatible base URL and model aliases through a private temporary settings file, removed on return. OpenCode v1 uses its documented inline provider configuration; v2 uses a dedicated launch workspace and the newer `providers` schema. Its v2 workspace differs from the launching project directory. Existing global provider files are not overwritten. Model tool-calling quality and client-specific features still need testing with a real loaded model.

Configuration references: [Atomic Agent](https://github.com/AtomicBot-ai/atomic-agent), [Claude Code gateways](https://code.claude.com/docs/en/llm-gateway-connect), [OpenCode v1 providers](https://opencode.ai/docs/providers/#atomic-chat), [OpenCode v2 providers](https://opencode.ai/v2/docs/providers).
