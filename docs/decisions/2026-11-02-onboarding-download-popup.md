# Keep download management inside onboarding

- **Context:** The terminal's additional-downloads button left onboarding for a page without working navigation. Catalog variants used a dropdown above an oversized action.
- **Decision:** Open current downloads in a dismissible, scrollable popup and restore the previous overlay and onboarding step on close. Render one compact download action per catalog variant in both clients.
- **Consequences:** Download state stays shared, while inspection never changes the current onboarding step. The catalog scroll window accounts for the expanded row only while it is visible.
- **Validation:** Regression tests exercise popup Escape/outside-click dismissal, catalog variants, and scrolling past expanded rows.
