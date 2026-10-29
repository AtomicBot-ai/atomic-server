# B19 — The TUI Tools selector cannot reach skills beyond its first visible window

- **Status:** Fixed locally and verified — [follow-up fix validation](../sessions/2026-10-29-tui-follow-up-fixes.md).
- **Priority:** P2.
- **Session:** [Pass 06](../sessions/2026-10-29-pass-06-tui.md).
- **Build:** Atomic Server 0.2.8, core 0.19.1; macOS arm64; `ec52295` plus B14–B16 fixes.

## Minimal reproduction

1. Have 15 enabled skills named `qa-pass06-00` through `qa-pass06-14`, using the authenticated `skills.save` operation in an isolated QA workspace. The initial stress reproduction used 20 enabled skills.
2. Open Playground → Tools at 120×40.
3. Navigate through the entire popup with Tab and Down, then scroll downward with the mouse wheel.
4. Try to reach `qa-pass06-14` (or `qa-pass06-19` in the 20-skill fixture). Repeat after reopening Tools at 54×24.

## Expected and observed

Every enabled skill should be reachable in the conversation's skill selector. The workspace service reports all 20 enabled skills, but the wide popup exposes only `00`–`13`. Repeated Tab/Down traverses that visible group and the footer, then cycles back. The mouse wheel does not reveal the remaining rows. Reopening at 54×24 exposes only `00`–`07`; the final skill is absent at both terminal sizes.

This blocks enabling later skills for a conversation and, when skills fill the list, also hides the following MCP connector section. No connector needs to be created or run to reproduce the missing skill controls.

The wide-window boundary was verified separately: all 14 enabled skills are reachable, but the 15th enabled skill is unreachable. This changes only the enabled count in the same synthetic dataset; 20-skill and 15-skill cases fail in the same way.

## Mechanism and scope

Evidence: [20-skill result](../evidence/2026-10-29-pass-06-tui/B19-navigation-result.json), [wide popup after keyboard navigation](../evidence/2026-10-29-pass-06-tui/B19-wide-after-tab-cycle.txt), [narrow popup](../evidence/2026-10-29-pass-06-tui/B19-narrow-after-tabs.txt), [15-skill failure](../evidence/2026-10-29-pass-06-tui/B19-15-skills-navigation-result.json), [14-skill wide-window control](../evidence/2026-10-29-pass-06-tui/B19-14-skills-navigation-result.json), [parameterized PTY probe](../evidence/2026-10-29-pass-06-tui/B19-reproduce.py).

`drawChatFeatures` calculates its list offset from the current focus, then draws only that window's controls. General overlay navigation in `workspaceInput` can focus only `frame.targets`, which contains those already visible controls. The last visible item does not advance the window, so no input can focus the next hidden row. The generic mouse-wheel route changes chat scroll rather than the Tools list.

No product code or maintained test was changed. No historical known-good version or introducing commit was established.

## Follow-up fix verification

Drawing and input now share the complete Tools row list. Tab, arrows, page keys and wheel can move focus beyond the visible window, skipping headings and retaining footer controls. The popup viewport follows focus. Unit tests cover twenty skills plus a trailing connector, reverse navigation, page bounds, disabled mouse and exit; real Ink/workspace transport and the built PTY cover the twentieth skill. On the final binary, all twenty skills were reachable at both 120×40 and 54×24. [Passing result](../evidence/2026-10-29-tui-follow-up-fixes/B19-20-skills-navigation-result.json).
