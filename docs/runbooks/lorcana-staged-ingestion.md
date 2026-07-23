# Disney Lorcana staged ingestion

## Source roles

| Need | Source | Registration | Staging role |
| --- | --- | --- | --- |
| English card identity, rules, sets, legality | LorcanaJSON `allCards.json` | None | Canonical working catalog |
| Commercial variants and market prices | JustTCG v1 (`disney-lorcana`) | Existing subscription | Exact-ID reconciliation only |
| Official-data drift checks | Ravensburger Lorcana card gallery | None | Manual monitor |
| Independent reconciliation | Lorcast | None | Monitor |
| TCGplayer group/product cross-check | TCGCSV category 71 | None | Monitor |

No additional API registration is required for the first stage.

LorcanaJSON is an unofficial aggregator, so Ravensburger remains the official
human-review reference. A source image URL is not treated as permission to copy
or publish the image.

## Safety contract

- The game remains `is_public = false`.
- LorcanaJSON numeric `id` plus language is the canonical printing identity.
- JustTCG joins only through a unique exact TCGplayer product ID.
- Name, collector-number, and fuzzy set matching cannot publish prices.
- Normal, Holofoil, Cold Foil, and future JustTCG printing values stay separate.
- Image writes and price publication remain disabled in the staging migration.
- Promo identity does not rely on `setCode + number`; promos can reuse both.

## Configure and audit

Set `JUSTTCG_API_KEY` in `.env.local`. Then run:

```powershell
npm run test:lorcana
npm run audit:lorcana-sources
npm run import:lorcana-staging
```

For a lower-cost first call:

```powershell
npm run audit:lorcana-sources -- --max-sets=2
```

The audit is read-only. It pulls LorcanaJSON card data and JustTCG v1
sets/cards, reports exact product-ID coverage and conflicts, and never fetches
card images. It defaults to one concurrent set fetch and automatically backs
off on JustTCG `429` responses; raise `--concurrency` only after confirming the
subscription's rate limit.

The import command is also a dry run unless `--apply` is supplied:

```powershell
npm run import:lorcana-staging -- --apply
npm run import:lorcana-staging -- --verify-only
```

The apply mode is idempotent. It persists raw source records, the private
catalog identity layers, and reconciliation candidates. It does not write
`price_stats` or card `image_url` values.

Apply `supabase/migrations/20260723130000_lorcana_catalog_staging.sql` only after
reviewing it against the target environment's migration order.

## Promotion gates

Before adding a scheduled ingestion route:

1. Save and review a full audit result.
2. Classify unmatched JustTCG rows as missing catalog identity, commercial-only
   products, sealed products, or source conflicts.
3. Confirm every publishable price maps through one unique TCGplayer product ID.
4. Decide the product rule for multiple finishes rather than collapsing them
   into one price.
5. Record commercial-use approval for card assets; otherwise keep images off.
6. Add raw-source persistence and reconciliation queues before enabling any
   public catalog or price writes.

If direct official automation or broader commercial asset rights become a
requirement, that is the point to pursue a Ravensburger partnership or licensed
catalog feed. It is not a blocker for this private, text-first staging pass.
