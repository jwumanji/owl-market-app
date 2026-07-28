# Terminal replay — feat/moon-terminal onto codex/promo-pricing-live

Date: 2026-07-28
Worktree: `owl-market-terminal-replay`, branch `feat/moon-terminal-on-prod`
Replayed: 27 commits (`b205fa2..67a2138`, the 53-file Terminal delta) onto
`origin/codex/promo-pricing-live` @ `479f8fe` via
`git rebase --onto origin/codex/promo-pricing-live b205fa2`.
No push, no deploy, no DB writes. Main working dir untouched.

## Conflict-by-conflict record

Three conflict stops during the rebase, plus two post-rebase reconciliation
commits. Rebase orientation reminder: during `git rebase`, `--ours` = the new
base (production), `--theirs` = the commit being replayed.

### 1 · `src/components/layout/Nav.tsx` (Phase A commit)
Production re-authored the nav around `PublicNavLink`
(`status`/`divider`, capability-driven links built from
`src/lib/games/registry.ts`). Took production's file wholesale, dropping
Phase A's provisional edit, per spec §5.1 ("re-author, not merge").

Re-added on top as a dedicated commit (`752df7e`) in their idiom:
- `terminalLink(game)` helper beside their `capabilityLink()`, gating on
  `capabilities.sealedProducts` via `isNavigableCapability`. Deliberate
  difference from `capabilityLink`: non-navigable states return `null`
  (hidden) rather than a "Soon" teaser — the paid surface is not advertised
  to games without sealed data. Today only `one_piece` (`sealedProducts:
  "live"`) shows the link; lorcana/riftbound are `"planned"` → hidden.
- `chip?: string` added to their `PublicNavLink`; rendered with Phase A's
  `c-nav-link-pro` / `c-nav-pro-chip` classes (label "PRO").
- Placed after All Cards; no extra divider claimed.

### 2 · `supabase/migrations/20260726143000_terminal_sealed.sql` (add/add)
Their copy was a one-character stub (`;`) created to satisfy `db push`
reconciliation. Ours wins — the full 395-line file is the applied DDL's
documentation. Resolved with `checkout --theirs` (the replayed commit).

### 3 · `config/game-sync-jobs.json` + `vercel.json` (Phase C commit)
Manifest: union — production's job list (including their
`lorcana.justtcg.current_prices`) plus our
`one_piece.justtcg.sealed_prices` (`/api/sync/sealed-prices?game=one_piece`,
`10 6 * * *`). Our `one_piece.internal.set_baseline`
(`/api/sync/set-baseline?game=one_piece`, `50 23 * * 0`, kind `index`)
applied cleanly in a later commit (4b56a6a's replay).
`vercel.json` was never hand-resolved: took production's during the rebase,
regenerated at the end (below).

### 4 · `package.json` — silent duplicate, fixed post-rebase
Production already defines `audit:sync-schedule` and
`sync-schedule:generate` (identical values to ours). Our hunks auto-merged
at a different location with **no textual conflict**, producing duplicate
JSON keys. Dropped our copies in `3f6ff3a`; kept only the new
`audit:booster-baseline`.

### 5 · Production cron drift discovered: `promo-products`
Production's `vercel.json` carries
`/api/sync/promo-products?game=one_piece @ 15 21 * * *` with **no row in
their own `config/game-sync-jobs.json`** — pre-existing manifest drift on
their branch (their own `audit:sync-schedule` fails on a pristine checkout
of `codex/promo-pricing-live` with "Unmanaged game cron"). Regeneration was
silently deleting their promo sync cron. Fixed in `3f6ff3a` by declaring
`one_piece.tcgcsv.promo_products` (provider `tcgcsv`, from
`src/app/api/sync/promo-products/route.ts`) so the manifest owns it.

### 6 · Clean merges verified, not assumed
- `src/app/globals.css`: auto-merged. Byte-compared original delta
  (`b205fa2..67a2138`) vs replayed delta — **identical**. Our additions
  only: `--line`, `--grad-terminal`, `.c-nav-link-pro`, `.c-nav-pro-chip`,
  `.c-terminal-subnav*`. **Zero token collisions**: production defines
  neither token. Informational: production's `--gain-2`/`--loss-2` are
  `#1F6F47`/`#B83232` (not CLAUDE.md §6's `#2D9961`/`#E04E4E`) — theirs
  stand untouched; CLAUDE.md §6 is stale against this branch.
- `scripts/sync-schedule-manifest.mjs`: ends identical to production's.
- CLAUDE.md, docs/**, our two migrations (`20260726150000`,
  `20260728100000`): applied cleanly, disjoint.

## Post-rebase diff-stat sanity

`git diff origin/codex/promo-pricing-live..HEAD` = 52 files,
+17,253 / −3. Every modified (non-added) file is on the mapped-overlap
list: `.gitignore` (+3, our audit-report ignore), `CLAUDE.md`,
`config/game-sync-jobs.json`, `package.json`, `src/app/globals.css`
(+109, pure additions), `src/components/layout/Nav.tsx` (+18/−1, the
capability-idiom link), `vercel.json` (+8), the migration stub replacement.
Nothing else of production's is touched. **PASS.**

## Cron count

Regenerated `vercel.json`: **27 entries** = production's 25, minus 0,
plus exactly our 2 (sealed-prices, set-baseline). The brief's expected 27
only holds because the dropped promo-products cron was restored via the
manifest (see #5). `audit:sync-schedule` PASS: 12 jobs / 15 game-sync
entries.

## Verification (in worktree, `.env.local` copied from main dir)

| Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` (owl-lens gate + static gen against live DB) | PASS — all routes emitted, 44 SSG sealed-detail paths |
| `npm run audit:sync-schedule` | PASS (12 jobs / 15 entries) |
| `npm run audit:game-boundaries` | FAIL — single failure `riftbound is not public`. **Pre-existing on production's branch**: their registry (`src/lib/games/registry.ts`, unchanged by us, last touched by their `2a8d01a`) says `isPublic: true`; live DB says `is_public = false`, `launch_status = public_catalog_preview`. Same audit fails identically on a pristine checkout of their branch. Cross-game issues 0, missing game_id 0. |
| `npm run audit:booster-baseline` | FAIL — 1 flag, **live-data anomaly, not a replay error** (audit + classifier byte-identical to `feat/moon-terminal`; same code + same DB flags on either branch). See below. |

### Booster-baseline flag: OP09-051

Plain-id `OP09-051` (Buggy, MR, en) carries `price_stats.tcg_market =
$1740.54` (updated 2026-07-28 06:01Z) — **identical to the cent** with the
JP super-parallel row `OP09-051_jp_10066`, while the genuine
anniversary-set MR sits at $1582.24 and `OP09-051_p1` AA at $15.74. A
parallel-variant provider price has landed on the plain-id en row. This is
exactly the leak class the tripwire was built for; it inflates the OP09
baseline until the price row is corrected. Data fix (sync/mapping side)
required — out of scope for this replay, no DB writes performed.

### SSR checks (production build served on :4731)

Ours:
- `/terminal/sealed` — 200; VALUE RATIO chips, BASELINE labels, Terminal
  nav link + PRO chip in SSR HTML.
- `/terminal/sealed/emperors-in-the-new-world-booster-box` — 200; Box EV
  slot table (`sd-ev-table` markup), OPENING EV hero, BASELINE RATIO fact.
- `/terminal/sealed/awakening-of-the-new-era-booster-box` (cut) — 200; hero
  renders (`sd-hero`, title, art); **no** EV section (0 × OPENING EV;
  `sd-ev-*` grep hits are inlined CSS, not markup). Baseline facts render.
- `/games/one-piece/terminal/sealed` mirror — 200 with VALUE RATIO.

Theirs (union intact):
- `/games/one-piece/news` — 200, real content (h1 "Events & …", article list).
- Promo surface: `/games/[game]/promos` is their redirect shim →
  `/games/<game>/catalog?variant=PROMO`; lorcana (their only
  `promos: "live"` game) resolves 200 with promo content. one_piece promos
  redirects the same way (its registry `promos` is `unsupported`).
- `/sets` — 307 → `/games/one-piece/sets` (their bare-mirror redirect), 200.
- Homepage nav — their full link set (Markets, News, Sets, Characters,
  Japan Market, eBay Sales, All Cards) + Terminal/PRO. Lorcana nav
  (`/games/lorcana/markets`) — their links present, **no Terminal link**
  (capability-hidden, not hardcoded).

## Contradictions with the brief

1. **"theirs was 25; expect 27"** — true only after repairing their own
   pre-existing vercel.json↔manifest drift (promo-products, #5). A naive
   regenerate lands at 26 by silently deleting their promo cron.
2. **"audit:booster-baseline (zero flags)"** — 1 flag, but it is live-data
   drift (OP09-051 mis-mapped provider price), not replay damage.
3. **`audit:game-boundaries`** fails on `riftbound is not public` — a
   production-branch code/DB split that predates the replay (CLAUDE.md §11
   calls this exact failure "not noise"). Registry visibility flips
   out-of-band were already documented in
   `docs/investigations/codex-coordination.md`.
4. **package.json resolution #4** predicted a conflict; reality was worse —
   a *clean* auto-merge that produced duplicate JSON keys. Worth
   remembering: additive hunks into JSON never conflict textually.
