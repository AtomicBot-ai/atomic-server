# Drafting terminal brand and server-status eyes

Accepted: 2026-10-24

## Context

The owner selected the Drafting ASCII design and requested frog-like eyes inside the mark that reflect the server. The intro needs large artwork while everyday screens must retain usable controls on compact terminals.

## Decision

Use the approved hand-drawn ASCII contour and pre-rendered SmSlant lettering. Preserve the original font header beside the output; no runtime font package is required. Intro artwork is neutral white with a slow blink. The shared workspace snapshot controls header eyes: ready/busy is green, starting blinks amber, offline uses muted X pupils, and error/overloaded makes the entire mark red. A missing snapshot is neutral. Brand lettering remains white.

The header occupies six rows at 100 columns by 30 rows and above, otherwise four. Content starts below this area; the existing context sidebar remains available from 80 columns. Compact rail positions retain a blank line between two-line buttons. Full-screen modal surfaces clear their entire underlying surface, so they do not leave half a logo behind the dialog.

The owner subsequently selected the **Soft socket** medium welcome sketch. At compact welcome sizes, use its exact 27-column, 11-row contour with adjacent six-character eye sockets. Keep the approved large Drafting mark and the small header unchanged. Eight bounded arm-tip patches move independently around a fixed body; the top cap shifts symmetrically by one column without stretching. The rounded outline uses an opaque body mask so the offset shadow appears only outside the material. Status colors, wake-up, blinking, and reduced-motion behavior remain shared. The medium title moves below the enlarged contour and shadow, leaving a clear row before the action at 80×24.

## Validation

Regression coverage checks authoritative status mapping, color and ASCII invariants, reduced motion, intro spacing, input lifecycle, and visible controls at 54×24 through 180×56. Existing keyboard, mouse-target, and connection navigation suites remain part of verification.

Soft socket coverage checks the exact selected silhouette, centered eyes, fixed-body motion, rounded-tip shadow masking, and title/action separation at 44×22, 54×24, 80×24, 88×24, and 100×30. Separate checks preserve the existing 90×32 large and 60×20 small welcome marks.
