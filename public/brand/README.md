# Moon Market — logo bundle

**Version:** Moon Market rebrand of the current mark (moon + single sparkle). Mark unchanged from OwlMark at commit `7f90908`; wordmark renamed "Owl" → "Moon" and wordmark font changed Space Grotesk → **Outfit 700**.
**Not** the moon + Gemini-star redesign (still blocked on Obsidian brand guidelines).

## Files

| File | Use |
|---|---|
| `moon-mark.svg` | Primary mark, transparent bg, 120×120 viewBox (identical art to owl-mark.svg) |
| `moon-mark-cream-bg.svg` | Same mark on cream `#FFF5E4` — social avatars, previews |
| `moon-lockup.svg` | Mark + "Moon Market" wordmark as live text. **Requires Outfit 700 + Caveat 700 to render correctly.** |
| `moon-lockup-paths.svg` | Same lockup with wordmark outlined to paths — **font-independent**, use for the Nav SVG-logo LCP fix |
| `favicon.svg` | Same mark, sized for 32px favicon slot |
| `moon-mark-{64,128,256,512,1024}.png` | Raster mark, transparent bg |
| `moon-mark-cream-1024.png` | Raster mark on cream, 1024×1024 |
| `moon-lockup-1600.png` | Raster lockup, 1600×372 (rendered from the outlined version) |
| `favicon-{32,512}.png` | Raster favicon |

## Tokens

- Sunset gradient: `#FF6BB8 → #FF4936 → #E89512` at 135deg
- Ink: `#1A0F08`
- Cream: `#FFF5E4`
- Mark stroke: 5px ink
- Fonts: **Outfit 700** ("Moon", ink) + Caveat 700 ("Market", gradient), no tilt
- Wordmark: 56px Outfit at x=130, letter-spacing −1.1; 72px Caveat at x=274 (4px gap); baselines y=78 / y=82; viewBox 516×120

## Notes

- The icon art is untouched — only ids and aria-labels renamed (`owl-*` → `moon-*`).
- Brand rule carryover: never italicize "Moon", never tilt "Market", no space between them in the nav wordmark.
- Site-wide: the C1.5 brand system uses Space Grotesk for headings/UI. Wordmark now uses Outfit — decide whether Outfit replaces Space Grotesk globally or stays logo-only.
