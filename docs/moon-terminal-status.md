# Moon Terminal — status handoff (2026-07-28)

For the Codex operator. One page; details live in `docs/investigations/`.

## What's live, and where

The Terminal sealed module is in production at `owl-market-app.vercel.app`
(`/terminal/sealed`, `/games/[game]/terminal/sealed`, and the `[productSlug]`
detail pages). Deployment **`dpl_EdALBDTAdFzW1NmdC6V4kKnBrK8S`**, CLI-deployed
from branch **`feat/moon-terminal-on-prod`** (on origin, HEAD `643500f`).

That branch is **your line plus Terminal**: it contains everything through
`codex/market-names-integration` — verified merge-by-merge, nothing of yours
reverted — plus the Terminal feature set, its two cron jobs, and two perf fixes.

## The 43-minute problem

Terminal exists only in that union branch. Every deploy from a tree without it
takes Terminal offline — observed directly: our first production deploy
survived **43 minutes** before a CLI deploy from a local tree 404'd every
Terminal route and dropped its two crons. This is not a conflict problem; the
codex branches are parallel snapshots of a local tree that doesn't contain
Terminal yet.

## What you need to do (one-time)

Base your next working tree on **`origin/feat/moon-terminal-on-prod`** — or
merge that branch into your local tree before your next deploy. Everything of
yours is already in it, so this is an adoption, not a merge negotiation. After
that, your normal flow keeps Terminal alive automatically. Two things to keep:

- `vercel.json` is **generated** — edit `config/game-sync-jobs.json` and run
  `npm run sync-schedule:generate`; hand edits get overwritten. The two
  Terminal crons must survive: `/api/sync/sealed-prices` (10 6 * * *) and
  `/api/sync/set-baseline` (50 23 * * 0).
- `market_index_snapshots` now carries **two set series with different
  populations**: `entity_type='set'` (official, promo-inclusive) and
  `entity_type='set_baseline'` (booster-baseline, feeds Value Ratio). Read
  CLAUDE.md §8 before touching it.

## Open items

1. **v2 historical backfill** — blocked on a singles-pipeline defect:
   `price_history` and `price_stats` record different variants' prices
   (5–700× apart) for some cards. Fix belongs in the pipeline; the gated
   backfill script is ready. `docs/investigations/set-value-v2.md`.
2. **OP09-051 price mis-map** — the JP super-parallel's price lands on the EN
   base MR row daily; `npm run audit:booster-baseline` stays red until the
   pipeline fixes it. Quantified impact:
   `docs/investigations/singles-pipeline-price-mismap.md`.
3. **Dashboard LCP 2.6s** — main-thread hydration of the grid bundle under
   mobile CPU throttle; needs a profiling pass, deliberately not chased.
   `docs/investigations/lcp-diagnosis.md`.
