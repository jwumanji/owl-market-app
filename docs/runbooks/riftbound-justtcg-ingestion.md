# Riftbound catalog reconciliation and pricing

Moon Market assigns authority by field:

- Riot Riftbound API: canonical card identity, rules text, set membership,
  release status, and official assets.
- TCGplayer: commercial product and SKU identity.
- JustTCG v1: current market prices, price history, conditions, and printings.
- RiftCodex: temporary fallback and discrepancy monitor, never the long-term
  canonical authority.

The Riot adapter remains closed until `RIOT_RIFTBOUND_API_KEY` and the approved
`RIOT_RIFTBOUND_CATALOG_URL` are configured. Do not invent or scrape an endpoint.

## Safety policy

- Publish prices only for exact, unique TCGplayer product-ID matches already
  present in `card_external_ids`.
- Prefer an English Near Mint Normal variant, then Near Mint Foil, then another
  English Near Mint printing.
- Keep unmatched commercial records out of the public catalog. Store and
  classify them in `catalog_reconciliation_candidates`.
- Never resolve a card by name alone. A set plus collector-number similarity is
  an `identity_conflict` requiring review unless a canonical ID confirms it.
- Keep canonical cards public when commercial pricing is missing; classify
  those records as `catalog_only`.

## Candidate statuses

- `official_new`: Riot-confirmed card missing from Moon Market.
- `official_preview`: Riot-confirmed preview, public with an unreleased label.
- `commercial_variant`: a new SKU/treatment for a known canonical card.
- `provider_ahead`: JustTCG/TCGplayer record awaiting Riot confirmation.
- `catalog_only`: canonical card without a current JustTCG match.
- `identity_conflict`: identifiers disagree or a required product ID is absent.
- `sealed_product`: non-card record routed away from the card catalog.
- `resolved` and `ignored`: terminal reconciliation outcomes.

Vendetta is a known official set with a July 31, 2026 English release. Its
JustTCG cards remain `provider_ahead` until Riot confirms each card through the
approved catalog source.

## Deployment order

1. Apply `20260722140000_riftbound_reconciliation_and_live_pricing.sql`.
2. Deploy the application and cron configuration.
3. Trigger a complete reconciliation:

   ```text
   POST /api/sync/justtcg?game=riftbound&mode=full&cursor=1&maxSets=50
   Authorization: Bearer <CRON_SECRET>
   ```

4. Confirm `pricesPublished: true`, inspect the candidate status counts, and
   verify that both the catalog reconciliation and normalized-price ingest runs
   completed.
5. Run `npm run audit:riftbound-justtcg`.

## Scheduled behavior

- Hourly: all provider sets are queried with JustTCG's `updated_after`
  watermark, including a five-minute overlap for safe retries.
- Nightly: a complete reconciliation catches catalog drift, stale identifiers,
  and canonical cards that lack commercial matches.
- One daily legacy history point is written per card while normalized provider
  observations retain provider/SKU timestamps.
