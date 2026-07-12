# OWL Market — SVG Wordmark Spec

**Goal:** replace the text-based nav logo (`span.c-lockup-wm`, "Owl" in Space
Grotesk 700 + "Market" in Caveat 700 with the brand gradient) with an inline
SVG wordmark so the logo renders identically before webfonts arrive.

## Requirements

1. Convert the "OwlMarket" wordmark to SVG paths — no font dependency. Glyph
   outlines are generated from the exact font files next/font ships (Space
   Grotesk 700 and Caveat 700, latin subsets), at the CSS-specified metrics:
   "Owl" 22px-equivalent with -0.02em tracking, "Market" 28px-equivalent with
   the -2px overlap, shared baseline.
2. Fixed `width`/`height` attributes on the SVG to prevent CLS — the SVG has
   intrinsic size immediately, unlike webfont text that reflows on font swap.
3. Accessibility: the logo link carries `aria-label="OWL Market"`; the SVG is
   `aria-hidden="true"` (decorative — the link provides the name).
4. Remove the logo font preload/import **if unused elsewhere**. (Finding:
   Caveat is the site-wide `font-script` used in page headlines — it stays.
   Space Grotesk is the primary display face — it stays. No removal; the win
   is that the logo no longer *waits* on either.)
5. "Owl" fills with `currentColor` (inherits `--ink` from `.c-lockup-wm`, so
   theming keeps working); "Market" fills with an SVG `linearGradient`
   replicating `--grad-brand` (#FF6BB8 → #FF4936 → #E89512).
6. Both call sites keep working: the nav lockup (22px scale) and the home
   hero (`.c-hero-wm`, 4× scale) — the component takes width/height props.

## Non-goals

- No redesign of the mark; the SVG must be visually indistinguishable from
  the font-rendered original at both sizes.
- The OwlMark roundel (separate component) is untouched.
