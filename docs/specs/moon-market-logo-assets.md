# Moon Market logo assets

The approved, font-independent Moon Market assets live in public/brand.

## Runtime usage

- Use moon-lockup-paths.svg for full brand lockups in navigation, hero, and authentication surfaces.
- Use moon-mark.svg for compact placements.
- Use favicon.svg and favicon-32.png for browser metadata.
- Keep the icon decorative when its enclosing link already has the accessible name Moon Market.
- Preserve the supplied view boxes and aspect ratios; do not reconstruct the wordmark with live text.

MoonMarketLogo.tsx and MoonMark.tsx are the shared runtime components. The wordmark is outlined, so it does not depend on Outfit or Caveat loading before paint.
