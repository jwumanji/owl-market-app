# Moon Market — C1.5 Mockups (visual source of truth)

These are the locked HTML mockups for the C1.5 "Playful Modern" migration. Each file is a standalone, self-contained HTML page (open in any browser). **Build prompts point at these by filename.** Filenames are canonical (no version suffix); the latest approved version of each surface is the one here.

Drop this folder at the repo root as `/mockups` (or wherever the build prompts reference). Do **not** ship these files — they're design reference only, not app code.

## Public surfaces (10 routes, 7 files — locked session 1)

| File | Route(s) |
|---|---|
| `01-home.html` | `/` |
| `02-markets-table.html` | `/markets` (table view) — **canonical nav + wordmark + OwlMark SVG reference** |
| `03-markets-grid.html` | `/markets` (grid view) |
| `04-card-detail.html` | `/card/[id]` |
| `05-index-pages.html` | `/rarities`, `/sets`, `/characters` (shared index pattern) |
| `06-set-detail.html` | `/sets/[id]` |
| `07-login.html` | `/login` |

## Admin surfaces (13 routes, 9 files — locked session 2, 1 deferred)

| File | Route(s) | Status |
|---|---|---|
| `08-admin-inventory.html` | `/admin/inventory` (+ `/preview` inherits this shell) | locked |
| `09-admin-inventory-new.html` | `/admin/inventory/new` | locked |
| `10-admin-bundles.html` | `/admin/bundles` | locked |
| `11-admin-bundle-form.html` | `/admin/bundles/[id]` + `/new` | locked |
| `12-admin-order-form.html` | `/admin/orders/[id]` + `/new` | locked |
| `13-admin-psa-submissions.html` | `/admin/psa-submissions` | locked |
| `14-admin-psa-import.html` | `/admin/inventory/import/psa` | locked |
| `15-admin-lens.html` | `/admin/lens` | locked |
| `16-admin-lens-pregrade.html` | `/admin/lens/pregrade` | locked |
| *(no file)* | `/admin/orders` | redirects to `/admin/inventory?status=ship` |
| *(no file)* | `/admin/inventory/[id]/centering` | **DEFERRED — not designed.** Same `CenteringWorkspace` as `16-admin-lens-pregrade` + card-identity header + "Save to inventory item" action. |

## Conventions captured in these mockups
Color roles: ink = primary/neutral/active · coral = destructive/attention/required · gain(green) = success · gold = graded-conditional · gradient = brand only · `--select` cobalt #1F47A1 = list-selection + PSA tier chip + centering inner-frame. PSA grade bands (5-band): 10 green / 9 lime / 8 gold / 7 orange / ≤6 red. Admin nav = wordmark + coral INTERNAL pill + Inventory·Bundles·Orders·Lens·PSA + View site↗/Sign out. Full convention system in the session-2 handoff (`C1.5 Migration — Handoff 2 (Admin).md`).

## New data fields these mockups assume (need schema work)
- `psa_tier` on `psa_submissions` (PSA Tier dropdown — 8 tiers, see `14-admin-psa-import`).
- Pre-grade history thumbnail + card/submission association (pre-grade currently stores no image/card link).
