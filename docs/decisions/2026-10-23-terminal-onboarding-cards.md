# Terminal onboarding and direct downloads

Status: accepted by the owner's October 23 request.

The reference is the local atomic-chat-ui desktop redesign at 4ab33d8. Its onboarding,
server connection guide and Hub filters define the order and available choices. The
server retains real core capabilities and omits client permissions and chat destinations.

Selecting an engine starts installation before the intro offers Press any key. A saved
setup or installed engine avoids repeating this choice. Model selection runs compatibility
and disk checks, then submits the resulting plan immediately. Blockers and failed checks
remain actionable; there is no second confirmation for an ordinary download. Transfer
ownership remains in the background server, so leaving a screen or closing the TUI does
not cancel it. Web onboarding uses the same plan/install sequence.

The terminal uses ASCII cards with full-surface mouse targets, keyboard focus, a restrained
focus pulse controlled by the existing motion preference, and a centered product header.
Cards stack at compact sizes. Lists keep focused rows visible. Escape routing is shared
between keyboard dispatch and a single clickable footer control. Download cards show the
model, actual state, progress and an ETA derived from transfer deltas; unknown estimates
are labelled rather than invented.

Cloud, media and connection setup remain in onboarding. Download management has a dedicated
panel. Core OpenAI-compatible cloud registration does not implement the desktop's native
provider OAuth or image-provider protocols: those connections require compatible gateways.
Catalog filters use available live metadata, preserve model identity after sorting, and
persist likes in the data folder. The prototype's simulated memory-fit estimates are not
copied into the real server catalog when no comparable metadata is available.

Validation covers one-click downloads, blockers/cancellation/retry, background recovery,
provider scrolling/clicks, media selection, filter identity, ETA resets and four viewport
sizes. See desktop-flow-parity.md for the user profiles and screen mapping.
