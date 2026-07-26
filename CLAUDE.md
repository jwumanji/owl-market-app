# CLAUDE.md

Repo conventions and traps for `owl-market-app`. Read this before recon, not after.

Everything here was learned the hard way — most entries exist because an assumption cost a work cycle. **When this file and a spec disagree, verify against the live system and update this file.**

---

## 1 · The things that will bite you first

**`main` is not trunk, and not production.** Production is deployed by CLI from `codex/*` branches. `main` has been days-to-weeks behind. Recon performed against `main` will report a stale migration head and non-existent tables as greenfield. Always check what production actually runs before writing a spec.

**Production deploys via `vercel --prod` from local working trees.** Not git. There is no reproducible relationship between a git ref and what's running. A git-triggered deploy is therefore an *unannounced revert of unknown scope* — this has caused at least two incidents (07-19, 07-25).

A guard is in place in Vercel project settings:
```sh
if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 0; else exit 1; fi
```
main → production is cancelled; CLI deploys and previews proceed. **Do not replace this with an unconditional `exit 0`** — CLI is currently the only working deploy path, and an unconditional guard freezes it.

**The database can be ahead of the deployed code.** Migrations get hand-applied; code gets rolled back. Schema state is not inferable from the checked-out branch. Verify against the live DB.

**Multiple Claude sessions may share this working directory.** Files under `C:\tmp\` and untracked files in the tree may belong to another session. **Never draw a conclusion about deployed code from a local file** — fetch the actual deployment. A WIP file mistaken for a deployed build produced a completely fabricated root cause in this session.

---

## 2 · Migrations

Two conventions exist. Only one is live.

| | |
|---|---|
| `schema-migration-v<N>-<kebab>.sql` at repo root | **Frozen at v48.** Legacy archive — do not add to it |
| `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` | **Current.** Everything since 2026-07-14 |

Root numbering collided historically — two each of v14, v22, v24, v25, v34, v41, v44 — which is one reason it was abandoned. `schema.sql` is a stale base snapshot; do not trust it.

**`supabase/migrations/` is Supabase-CLI-managed.** `supabase_migrations.schema_migrations` exists and is populated (22 rows as of 2026-07-26). Note there is **no `supabase/config.toml` anywhere in the repo**, and `supabase/escape-hatches/*.sql` does exist — neither fact means the CLI is uninvolved. That inference was made and was wrong. **The tracking table is the record of the database. The file list is not.** Reconcile against `schema_migrations`, never against `ls supabase/migrations/`.

**`supabase db push` runs from a machine that is not in this repo's history.** The newest tracked version, `20260726110000`, exists in no branch — it created `public.articles`, which no ref references in SQL or TypeScript. Schema changes reach production with no corresponding commit.

**The same machine deploys application code, not just migrations.** Neither the file list nor the branch list is a record of what production runs — `/games/one-piece/news` and its detail route are live and exist in none of the 81 remote refs. Grepping the repo answers *"does anything in git use this"*; for production, probe the deployed site. A local `npm run build` passing says nothing about routes the repo lacks. See `docs/investigations/codex-coordination.md`.

### Before writing a migration

List `supabase/migrations/` **on the deployed branch** and grep it for the tables you intend to touch. The live database shows you columns, but not which migration created them or what constraints arrived alongside.

**Worked example — how this went wrong.** v49 was specced against the root `schema-migration-v*.sql` files, and `supabase/migrations/` on the deployed branch was never checked. `20260714153000_sealed_product_tracking.sql` had already created `sealed_product_price_history` with a `unique (sealed_product_id, price_date)` constraint and a `(game_id, price_date desc)` index. v49 re-added both: a duplicate index, and a *weaker* unique key on `(sealed_product_id, source, price_date)` that the existing one already implies. The weaker key was worse than redundant — it implied per-source daily rows are supported when the real constraint forbids them. v50 removes both.

### Rules

- **No DDL access through the Supabase client.** Write the file, hand over the SQL, wait for confirmation. Never attempt to apply.
- Wrap migrations in `begin` / `commit`, with a `DO` block afterwards asserting every expected column and `raise exception` on any miss. A silent rollback otherwise looks like success.
- Write everything idempotently — `add column if not exists`, `create table if not exists`, `DO` blocks guarded on `pg_constraint` / `pg_policies` — so an unexpected re-run from the other machine is harmless.
- **Hand-applied migrations get no tracking row**, so `db push` will re-run them. Moving one into `supabase/migrations/` requires inserting its row in the same change:

  ```sql
  insert into supabase_migrations.schema_migrations (version, name)
  values ('<YYYYMMDDHHMMSS>', '<name_without_timestamp>')
  on conflict (version) do nothing;
  ```

  Only for migrations **already applied by hand**. A file that has never run must get **no** row — let `db push` apply and record it.

---

## 3 · What PostgREST cannot see

The service client reads tables and a small set of predefined RPCs — **enumerate them, never assume a count; Codex adds functions.** List them from the OpenAPI document rather than from memory or from this file:

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  | jq -r '.paths | keys[] | select(startswith("/rpc/"))'
```

It **cannot** see indexes, constraints, RLS policies, function bodies, triggers, or `cron.job`. Any claim about those needs SQL run by the user in the editor.

Error-code tell for "did my migration apply":

| Code | Meaning |
|---|---|
| `42703` | undefined_column **from Postgres** — the column genuinely doesn't exist |
| `PGRST204` | schema cache stale — column exists, PostgREST hasn't noticed |
| `PGRST106` | schema not exposed (only `public`, `graphql_public` are) |

---

## 4 · Game scoping — non-negotiable

Every public table carries `game_id uuid references games(id)`. Every public query filters on it. Migration **v40** enforces the boundary and raises on null `game_id` or cross-game mismatch. `npm run audit:game-boundaries` fails a build that violates it.

`region` is the language axis (`'en'`, `'jp'`, lowercase) — added in v45. **There is no `language` column and we are not introducing one.**

Games currently in the DB: `one_piece` (5,053 cards), `riftbound` (1,064), `lorcana` (3,226), `pokemon` (0, private).

---

## 5 · Data access pattern

Follow `/sets` exactly. Five files, colocated:

```
page.tsx              thin shell · export const revalidate = 3600 · generateStaticParams() on [game]
XPageContent.tsx      server component · calls loader · fallback/error
XClient.tsx           "use client" · all interactivity
load-x.ts             all Supabase access
x.css                 page-scoped, imported by the client
```

Every public route is mirrored: `/sets` and `/games/[game]/sets`, the latter passing `gameRouteSlug={params.game}`.

In loaders:

- `createCachedServiceClient()` / `createServiceClient()` from `@/lib/supabase-server` — **service role, server-only**. Never reachable from a client component; it bypasses RLS entirely.
- Wrap in `cachedPublicData(publicDataCacheKey(...), fn, CATALOG_DATA_TTL_SECONDS)`
- `resolveGameScope(supabase, options.game, { defaultToOnePiece: true })`, throw on `.error`
- `.eq("game_id", game.id)` and `.eq("region", "en")` on every query
- Paginate with a manual `while(true)` + `.range()` loop at `pageSize = 1000`
- Unwrap joins with `firstRelation()`

**There are no generated Supabase types.** No `database.types.ts`; `supabase-server.ts` calls `createSupabaseClient` untyped. The only generated types are `owl-lens/openapi.generated.ts`. `supabase gen types` works off stored CLI auth, but introducing that pattern is a decision, not a chore.

---

## 6 · Design system (C1.5 Playful Modern)

Tokens live in `src/app/globals.css` `:root`.

| Correct | Not |
|---|---|
| `--gain-2` `#2D9961` | ~~`--gain`~~ |
| `--loss-2` `#E04E4E` | ~~`--loss`~~ |
| `--line` `#EEDFC8` | — |
| `--grad-brand` (sunset) | — |
| `--grad-terminal` (blue→green) | — |

Core: `--bg #FFF5E4` · `--bg-2 #FFFFFF` · `--bg-3 #FCE6BE` · `--ink #1A0F08` · `--ink-2 #5C4534` · `--ink-3 #9A8475` · `--pink #FF6BB8` · `--coral #FF4936` · `--gold #E89512` · `--select #1F47A1` · `--r-sm|md|lg|pill`.

**There is no `.container` class.** Page shells are per-page: `.sets-v2-page { padding: 24px; max-width: 1280px; margin: 0 auto; }`.

**Canvas is 1280px.** Mockups were built at 1460 and their grids are tuned for it — reflow one breakpoint earlier rather than widening the site.

Color roles: ink = primary/neutral/active · coral = destructive/attention · `--gain-2` = success · gold = graded-conditional · `--select` cobalt = list selection, PSA tier chip, centering inner-frame.

**Gradients: brand only, plus `--grad-terminal` scoped to the Terminal product surface.** That second gradient is a deliberate brand-system change, documented in `mockups/README.md`.

Caveat script text under `background-clip: text` **clips its tail** — always add `padding-right` (8px in nav, 13–14px at heading sizes).

`RarityBadge` at `src/components/ui/RarityBadge.tsx` takes `{ rarity: string | null }` — no `size`, `variant`, or `className`. Returns null for null; unknown codes fall back to `c-rar-c`. Classes are `.c-rar-*` in `globals.css`, **solid fill** — mockups often show an outline palette that does not ship. Never pass a non-rarity string like `'BULK'`; render plain text instead.

`chart.js` ^4.5.1 and `react-chartjs-2` ^5.3.1 already ship. Follow `SetChartClient.tsx` / `CardDetailClient.tsx`: a `"use client"` component calling `ChartJS.register(...)` at module scope with only the elements it needs. Don't hand-roll SVG for a main chart; do hand-roll for per-row sparklines (one chart instance per row isn't worth it).

Mockups live at `mockups/NN-name.html`, indexed in `mockups/README.md`. **They are visual reference, not source** — they carry tokens and a canvas width the repo doesn't have.

---

## 7 · Nav

`src/components/layout/Nav.tsx`, `"use client"`, `variant?: 'public' | 'admin'`. Links are built per-game by `publicLinks(gameRouteSlug)` using `gamePath()`. Active state via `isActivePath(pathname, href, exact)`.

**`PublicNav` deliberately avoids `useSearchParams()`** — it bails static prerender and causes CLS. Only `AdminNav` pays a Suspense boundary. Do not introduce it.

**At least three different nav link sets exist across branches.** Verify against what production runs before speccing nav changes. Bare mirrors (`/sets`, `/terminal/sealed`) don't highlight as active because hrefs are always game-scoped — pre-existing, applies to every link, not a bug to fix locally.

---

## 8 · Data rules

**`card_image_id` is the canonical unique key, not `card_number`.** Variants share numbers but have unique `_p1` / `_p2` suffixed image ids. Use explicit `includes()` checks for variant detection — **never regex catch-alls**.

**Set membership is `printed_set_code`, not `set_id`.** OP05 is 287 cards by printed code vs 137 by `set_id`. EB04 cards segregate by `printed_set_code` rather than hyphenating into parent entries.

`market_index_snapshots` is the set-value rollup. `entity_type='set'` rows carry `index_value = sum(tcg_market)` over priced cards — that *is* set value, already computed. **Do not build a second rollup.** Natural key is `(game_id, entity_type, entity_key, snapshot_date)` — no region, so `region` is inert until both the function and the constraint change together. Access is **service-role only**; anon/authenticated are revoked.

Populated by DB function `capture_market_index_snapshots(p_game_id, p_snapshot_date)` — three INSERTs with explicit column lists, upserts on conflict, so repeat runs are safe. Scheduled via **pg_cron job 1**, `40 23 * * 0`, `one-piece-market-index-snapshots`. Weekly grain against daily prices; carry forward the last known value rather than blanking derived ratios.

---

## 9 · External providers

**JustTCG** — header `x-api-key`. **Starter plan: 1,000 req/day**, 50/min, 10,000/mo.

> Quota exhaustion returns **`403 SUBSCRIPTION_REQUIRED` — "Please upgrade your subscription"**, not 429. This looks exactly like a lapsed plan and isn't. A bad key returns `401 INVALID_API_KEY`; that contrast is the discriminator.

Returns `OP01-001` format natively. Price history as `{p, t}` objects, Unix seconds. Set slugs are full descriptive slugs. `/sets` exposes `sealed_count`.

Sealed coverage (probed 2026-07-26; corrected 2026-07-27): 364 products via `condition=Sealed`. The earlier "86 booster boxes vs our 23" gap was a name-classification artifact in the probe — the live catalog is complete, **0 boxes missing** (`docs/investigations/sealed-catalog-reconcile.md`). **354/364 carry `{p,t}` daily history, median 90 points — but only with `priceHistoryDuration=90d`.** The param is **`priceHistoryDuration`**; the previously probed `historyDuration` is not recognized and silently falls back to a ~7-day window. Full catalog + history costs **4 requests**.

Three constraints: **history beyond 90 days is unavailable** — `priceHistoryDuration=1y` degrades to ~7 recent points (re-verified 2026-07-27 with the correct param name), so ~90 days remains the hard ceiling; **no `sellers` / `listings` / `quantity` field exists** on sealed variants; per-product `lastUpdated` ranges from today back nearly a year, so **gate writes on it** or you manufacture flat history that reads as real market data.

**eBay** — there is no usable official API for sold comps:

| API | State |
|---|---|
| Finding (`findCompletedItems`) | Decommissioned Feb 2025 |
| Shopping | Decommissioned 2025 |
| Browse | Active listings only, no sold data |
| Marketplace Insights | Limited Release, partner-gated, no application path |

Scraping is the only route for a non-partner. There is no eBay App ID anywhere in the repo or Vercel env. Current path is Scrapingdog (`api.scrapingdog.com/ebay/search`, over quota) with Scrapfly also available and healthy — consolidating to one vendor is worth pricing.

**Known live defect:** `src/app/api/sync/ebay/route.ts` advances its cursor by `cardList.length` (fetched) rather than successes. During a provider outage it marches through the catalog failing every card and won't retry them for a full cycle (~8 days). Fix requires typed error classification — provider-wide (403/429/5xx/timeout) vs per-card — then abort the run on provider-wide rather than advancing. `completedCycles` also increments on wrap even when nothing synced.

**Yuyu-tei / JP** — `jp_prices`, v44, applied, 7,740 rows. Sync stalled since 2026-07-19 with `lastError: null`, because `writeCursor` is the last statement in the route: any earlier failure leaves `sync_state` holding its previous values. **`lastError: null` does not mean no error** — it means the route never reached the error-recording code.

---

## 10 · Cron

`vercel.json` is **generated** by `scripts/sync-schedule-manifest.mjs` from `config/game-sync-jobs.json`. Hand-editing it gets overwritten. Edit the source and regenerate.

Deployed cron config has diverged from the repo repeatedly, including a job pointed at `/api/audit/card-images` when no such route existed — firing into a 404 hourly, silently. **There is no drift detection.** An `audit:crons` script in the family of `audit:game-boundaries` would catch it.

Schedule collisions exist at `:30` (jp-prices + warm) and `:00` (ebay + justtcg). Not a root cause of anything, but `/api/warm` is the heaviest job (`maxDuration = 300`) and colliding logs made the JP stall harder to diagnose. Worth staggering as hygiene.

Repo says One Piece JustTCG `maxSets=4`; production has run `maxSets=1` — likely deliberate quota conservation against the 1,000/day ceiling. **The repo value would quadruple consumption if it ships.**

---

## 11 · Verification

```sh
npm run lint
npm run build                    # runs owl-lens:check-types first — unrelated lens errors gate it
npm run audit:game-boundaries    # hits the live DB, writes game-boundary-audit.md (gitignored)
```

`audit:game-boundaries` can hit a statement timeout on `tcg_source_records` (~25k rows) — retry. A `riftbound should remain private until launch approval` failure is **not** noise; it reflects a real code/DB split.

Static generation queries the database, so **re-run the build after any migration** — a pre-migration pass doesn't carry over.

After any deploy, run PSI cold and name the LCP element. Cold pages are the default experience for new users; cold-tail LCP is never an acceptable baseline.

---

## 12 · Working rules for agents

**Scope.** Every task gets an explicit file/branch scope. Don't edit outside it. If a phase turns out bigger than described, split it and do the first half.

**Verify, don't infer.** Query the live system. Read the deployed artifact. Check the column type rather than assuming uuid. Three separate wrong conclusions in this session came from inferring from the wrong source — a stale branch, a WIP file, a partial grep.

**Report before acting** on anything that touches production, another worker's branch, or applied DDL.

**Write findings to files, not chat.** Investigation output belongs in `docs/investigations/` or a spec. Two agents in this session reached opposite conclusions about the same cron because neither could read the other's findings. If it took a probe to learn, it goes in the repo.

**Own corrections loudly.** Say what you claimed, what's actually true, and what it invalidates. The most valuable single message in this session was an agent retracting a fabricated root cause.

**Never print or log API keys.** Compare shape and last-4 only. Don't extract credentials from the OS keystore to route around a missing permission — say you're blocked instead.
