# Symmetric Drafting header and restrained contour motion

Accepted: 2026-10-24

## Context

The owner requested a compact, closed Drafting header and independent arm movement, with an anchored body and eyes. The intro should feel lively while the everyday header stays subtle.

## Decision

Both header sizes use the owner’s exact three-row drawing with a top cap row. The resulting mark is 13 columns by four rows; the bottom cap was removed at the owner’s request. Draw the mark at row one so its four ink rows align with the full wordmark. The compact title shares the eye row at row three. The header eyes are adjacent, `(o)(o)`, starting at column four; the larger intro retains its spaced sockets. Stopped pupils are turquoise capital X characters. Welcome and running eyes briefly blink every six seconds; reduced motion keeps them open. Preserve the other literal glyphs and spacing, and keep the existing six-row/full and five-row/compact layout reservations. Sidebar backgrounds begin below the artwork so they cannot erase its lower contour. The compact and full renderers reserve enough rows for the complete mark and keep interactive targets below it.

All eight intro arms have separate deterministic schedules, with base periods of 2.1, 2.9, 2.35, 3.2, 2.65, 3.45, 2.55 and 3.05 seconds. A repeatable per-cycle variation chooses dwell time and curl direction. The intro uses 0.4–0.75-second curls. The owner’s final literal header outline stays still; its status eyes and blink remain active. Explicit cap patches bend only the existing external arm tips within their original reach. The top central cap keeps a centered, mirrored shape and its original width. The body, eyes, roots and central stem remain fixed; there is no global stretching, translation or breathing. Welcome, running and starting may move; stopped and error remain still. Reduced motion disables movement and blinking. No timer advances onboarding or changes server state.

Both Web and terminal entrance titles use Atomic Server. The terminal intro has a one-time wake-up: X pupils from 0 to 0.7 seconds, half-open pupils from 0.7 to 1.2 seconds, then open eyes. Elapsed time starts at the component mount and remains continuous through engine selection and installation. Arms wait until the wake-up ends. Reduced motion shows open eyes immediately; the animation never advances onboarding. The approved Web mark remains unchanged.

The intro alone adds a dark-gray contour shadow two columns right and one row below the mark. A scanline silhouette mask fills the body between paired ASCII edges, preserving gaps between separate arms. Shadow glyphs draw only outside that opaque body; the mask follows the animated pose. Eyes and lettering remain unshadowed. The everyday header stays flat.

This refines the artwork in [the Drafting brand decision](2026-10-24-drafting-terminal-brand.md).

## Validation

Tests cover mirrored geometry, animation timing, all fixed body and silhouette cells, one-time mount-local wake-up, reduced motion, error/stopped states, ASCII bounds, unchanged hit targets, and the complete header remaining visible above every main screen. Draft D in the review gallery bundles the actual production Canvas renderer with the existing build tooling, rather than copying its geometry or motion. Its intro clock resets only when entering Draft D or explicitly selecting Welcome; redraws and resizing cannot restart it. The HTML adapter preserves fixed row and column bounds and omits redundant ground backgrounds on inline spans, preventing later rows from covering underscore descenders. A/B/C/E remain the original unselected proposals.
