# LCP paint-delay diagnosis — 2026-07-28 (diagnose only, nothing applied)

Production `dpl_7mgGQyKpLodnzE2xVmbBNTra1xP9` · Lighthouse mobile cold:
dashboard 94 (LCP 2.6s, renderDelay 2.24s) · detail 87 (LCP 3.5s, renderDelay
2.15s) · TTFB ~200ms both · CLS 0 both.

## Cause 1 — dashboard: JetBrains Mono `display: "swap"` re-fires the text LCP

The historical wordmark incident and its fix are both present in this tree:
`layout.tsx`'s comment documents that a hand-rendered `<head>` once dropped the
next/font preloads ("the post-swap repaint of headline text re-fired LCP
seconds in"), and the react-dom resource-hints fix is in place — measured live,
the three woff2 files preload and complete in ~100ms on a fast connection. The
nav wordmark is now a PNG `next/image` lockup, so the old surface is moot.
What remains: `JetBrains_Mono` is the one font still `display: "swap"`
(Space Grotesk and Caveat are `optional`), and Terminal is mono-dominant —
stat-rail values, prices, eyebrows, grid cells. Under Slow-4G + 4× CPU
throttle the mono file arrives ~2.2s in; the swap repaints the largest text
block and re-fires the text LCP at swap time. Fingerprint matches the
documented incident mechanism (pure render delay, no resource phases).
Caveat: Lighthouse's insights don't expose the node and buffered LCP entries
were not readable via the browser extension — node identity is inferred from
viewport layout + font mapping; the mechanism from phase data.

## Cause 2 — detail: hydration contention delays the hero image paint

LCP element confirmed as the hero box art (`next/image` →
product-images.tcgplayer.com/…/563834.jpg). It already has `priority` — fetch
is optimal (215ms delay + 131ms load). The 2.15s is paint-side: the hero
renders inside `SealedDetailClient`, whose initial client bundle includes
chart.js; under 4× CPU throttle, hydration contends with the image's async
decode/paint. Component named: **SealedDetailClient — the chart.js payload in
its initial bundle.**

## Minimal fixes (NOT applied)

1. Dashboard: one line in `src/app/layout.tsx` — `jetbrainsMono`
   `display: "swap"` → `"optional"`. No swap → no LCP re-fire; LCP becomes the
   fallback-mono paint (~1.4s). Tradeoff: slow-connection first visits keep
   `ui-monospace` for the session — a brand call.
2. Detail: `next/dynamic` the chart component inside `SealedDetailClient` so
   chart.js leaves the initial bundle. Hydration cost drops, hero paints
   sooner; only behavior change is the chart mounting a beat later.

Fast-connection users are barely affected (fonts ~100ms); this is the
throttled-mobile cold tail the standing PSI rule targets.
