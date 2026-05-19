# Owl Lens — Pre-grade UI Spec v1

**Status:** Approved — implementation-ready
**Version:** v1 (refined, supersedes v0)
**Last updated:** 2026-05-17
**Venue:** Owl Lens lives inside `jwumanji/owl-market-app` per ADR 003. Routes admin-only at `/admin/lens/*`. CV service lives separately at `jwumanji/owl-lens`.

---

## 1. Product summary

Pre-grade is a centering measurement tool for TCG cards. The user uploads a front image (optionally a back), the system runs CV to detect the card boundary and inner frame, the user verifies/adjusts the overlay, and the tool computes a grading-ceiling estimate across PSA, BGS, and TAG — all derived from centering alone. Pre-grade results are saved with the source images and can be re-opened and edited later.

This is one of several tools that will live under the "Lens" hub.

---

## 2. Navigation and structure

### Consumer-facing flow

```
Hub → Upload → Measure → Results → History
```

These are conceptual states, not nav buttons. Users transition between them by doing things (open tool, upload, click Measure, click Save). The Hub is the only persistent surface; everything else is a step in the pre-grade workflow.

### Hub

Three tool cards in a grid: **Pre-grade** (active), **Inventory import** (coming soon), **Multi-card scan** (coming soon). Disabled cards are dimmed with a "Coming soon" tag.

Below the tools, a **Recent pre-grades** section shows the last 5 saved measurements as a table identical to the full History page — thumbnail, card name (click to rename), F: and B: ratios, ceiling pill, timestamp. Each row is clickable and re-opens the session for editing. A "View all (N) →" button leads to the full history page when there are more than 5 entries.

---

## 3. States

### `idle` (the Upload step)

A unified upload pane with Front/Back tabs in its header. Empty tab body shows a dropzone; uploaded tab body shows the image preview with filename + Replace button.

Above the pane: optional **Card name** input (free-text). Below: **Measure** button (centered, disabled until front is uploaded) and a privacy notice ("Images are saved with your measurement so you can re-open and adjust later").

**Special case — adding a back to an existing front measurement:** If `state.frontOverlay` already exists when the user returns to idle (via the "+ Add back image" link from review), a notice strip appears above the pane: *"Front measurement is saved. Add a back image, then click Measure to complete the pair. The front won't be re-measured."* The Measure handler is idempotent — it only runs CV on faces that don't yet have an overlay.

### `uploading` / `processing`

Spinner + step list ("Validating images" → "Finding card boundaries" → "Measuring border ratios" → "Calculating PSA ceiling"). Step labels include "(front, back)" when both faces are present. Duration is conveyed as "1–3 seconds per face" — honest, not a precise estimate.

### `review` (the Measure step) — always shown on success

This is the central decision-confirmation surface. Two-column layout:

**Left (image panel):**
- The uploaded image with quad overlays drawn on top — outer card (owl-gold) and inner frame (gain green).
- Eight corner handles (4 per quad), draggable.
- A rotation handle floats above the outer quad (only when the outer is in rectangle mode). It rotates both quads together around the outer's centroid.
- A degree dial appears in the top-right of the SVG when rotation differs from 0° (e.g. `+3.2°`).
- Four gap-distance labels (L/R/T/B) on the overlay itself, showing `Npx · NN%`. The two labels affected by the active drag brighten to owl-gold; others stay muted.
- Legend row below the image: outer/inner color swatches, plus a live status string ("Dragging outer tl" / "Selected · arrows nudge · Shift ×10" / "Adjusted manually" / "CV-detected").

**Right (numbers panel):**
- **Combined ceiling card** at the top — shows the bare grade tier ("10", "9", "8", "≤7"), with a sub-label noting *"worse of front · back"* (dual face) or *"front only (back not measured)"* (single face). Beneath, a three-cell strip: PSA / BGS / TAG, each tinted by their own tone (some can disagree at the half-grade boundaries — BGS shows 9.5 where PSA shows 10).
- **"+ Add back image"** link appears only when in single-face mode and the user is on the front tab.
- **This tab** section with L/R, T/B, and worst-axis cards, all tinted by tone.
- **Free corners toggle** (off by default). When on: rotation handle hidden, every corner moves independently. Below the toggle, a hint: *"hold Shift to drag one freely"* (rectangle mode) or *"rotation off · corners drag freely"* (free mode).
- **Save measurement** / **Save both faces** (primary CTA, label depends on whether back is present)
- **Reset {face}** (secondary, disabled until a manual adjustment exists)
- **Cancel** (tertiary)

**Tabs** appear above the layout when both faces are present (`Front` / `Back`), with an owl-gold dot indicator when the back hasn't been viewed yet and a `· adj` marker on any face that's been manually adjusted.

#### Handle interaction model

- Visible handle: SVG `circle` r=7. Focus ring: r=13 normally, r=14 when keyboard-selected, r=16 when actively dragged.
- Hit area: invisible `circle` r=20 on top, `pointer-events: auto`.
- Click a handle → it becomes `selectedHandle` (persists between drags).
- Start a drag → `activeHandle` is set; selectedHandle also points there.
- Drop the handle → activeHandle clears, but selectedHandle persists.
- Click the SVG background (image area, not a handle) → selectedHandle clears.
- **Keyboard nudge:** with a handle selected, arrow keys move it 1px, Shift+arrow moves it 10px. Only active in `review` and `edit` states. Ignored when an input/textarea has focus.
- Recalc cadence: every `pointermove`, every keydown; no debounce.

#### Drag modes

**Constrained (default — Rectangle mode):** The quad maintains its rectangle shape. Dragging any corner anchors at the diagonally-opposite corner and rebuilds the rectangle in the current rotation. Use this for the 95% case.

**Free corners (toggle):** Each corner moves independently. Use for warped cards or perspective-distorted scans. Rotation handle is hidden in free mode.

**Shift-to-temporarily-unlock:** In rectangle mode, holding Shift while dragging a single corner unlocks just that corner (one-shot — releases when the drag ends). Power-user shortcut for users who learn it.

**Convexity guard:** Any drag (free or constrained) that would produce a concave or self-intersecting quad is rejected — the corner snaps back to its previous valid position. Implemented as a cross-product check on the four corner triplets.

**Rotation:** The rotation handle is a small dot above the outer quad, connected by a dashed line to the top-edge midpoint. Dragging it rotates both outer and inner quads around the outer's centroid. The degree dial in the top-right corner shows the current rotation; clicking the dial resets to 0° (future work).

#### CV failure handling in review

- `CARD_NOT_DETECTED` / `IMAGE_UNREADABLE` → routes into review with a default placeholder overlay and a notice strip above the image: *"We couldn't lock onto a card automatically. Frame the borders yourself and we'll measure your version."* Not a separate failure screen.
- `BACK_DETECTION_FAILED` (front succeeded, back failed) → routes into review on the front tab with a "Back measurement didn't go through" notice and two CTAs: **Retry back** / **Continue with front only**.

### `results`

Shown after Save. Two layout variants:

**Dual face:** Top row has the **Combined ceiling block** (large grade tier + grader strip) on the left and **Download report** / **Measure another** buttons on the right. Below, two side-by-side **face cards** — front and back — each with its own grade, L/R and T/B ratios, worst-axis line (with "← worst" tag on whichever drives the combined ceiling), and a mini non-interactive overlay preview. An "Adjusted manually" footer line appears below if either face was adjusted.

**Single face:** Standard review-style two-column layout with the image panel on the left and a stack of numbers on the right (ceiling card, L/R and T/B cards, worst-axis card, threshold table showing the four grade tiers). The ceiling card shows "front only" in its sublabel. Same Download/Measure another CTAs at the bottom.

### `history` (full page)

Header with title ("Past pre-grades") and a count ("N saved" or "N saved · M shown" when filters active).

**Filter bar** above the table:
- Search input with magnifier icon — filters by card name, case-insensitive substring match.
- Ceiling chips: All / 10 / 9 / 8 / ≤7. Click to filter. Filters combine.

**Table** with columns: thumbnail (42×58px), card name, F: ratio row, B: ratio row, ceiling pill, when. Each row is fully clickable to re-open the session for editing. The card name cell is independently clickable to edit inline (Enter saves, Escape cancels, blur saves).

**Empty filtered state:** "No pre-grades match these filters" + a "Clear filters" link.

Face data is rendered in stacked two-row format per face:
```
L 56 / R 44
T 49 / B 51
```
Numbers are color-coded per axis — green if worst-axis ≤55 (PSA 10 territory), owl-gold if ≤60 (PSA 9), red if >60.

### `edit` (re-opened saved session)

Same UX as `review`, with three differences:
- Workspace header shows a "← Back to history" link, the card name, and "Saved Xh ago".
- Primary CTA is **Update measurement** (overwrites the row in place).
- Reset becomes **Revert {face} to saved**.
- A tertiary **Delete pre-grade** button (in `--loss` red) at the bottom of the button stack.

If a row was saved before image storage was enabled, overlay geometry is reconstructed from the saved L/R T/B ratios via `overlayFromRatios()` — the edit view still renders, with the saved ratios driving a synthetic rectangle.

---

## 4. Grading math

### Measurement

The card boundary and inner frame are each represented as a quad with four explicit corners (`tl`, `tr`, `br`, `bl`). Gap distance per side is the **perpendicular distance** from each inner-side corner to the matching outer-side line, averaged across the two corners.

```
leftGap   = avg(distanceToLine(inner.tl, outer.tl→outer.bl),
                distanceToLine(inner.bl, outer.tl→outer.bl))
rightGap  = avg(distanceToLine(inner.tr, outer.tr→outer.br),
                distanceToLine(inner.br, outer.tr→outer.br))
topGap    = avg(distanceToLine(inner.tl, outer.tl→outer.tr),
                distanceToLine(inner.tr, outer.tl→outer.tr))
bottomGap = avg(distanceToLine(inner.bl, outer.bl→outer.br),
                distanceToLine(inner.br, outer.bl→outer.br))
```

L/R ratios: `lPct = leftGap / (leftGap + rightGap) * 100`, similarly for R, T, B.
Worst axis: `max(max(lPct, rPct), max(tPct, bPct))`.

### Grading ceilings — `ceilingFromWorstMax(worstMax)`

All three graders are reported from the same measurement, side-by-side:

| Worst-axis % | PSA | BGS | TAG |
|---|---|---|---|
| ≤ 51 | 10 | 10 Pristine | 10 Pristine (≥990) |
| ≤ 55 | 10 | 9.5 Gem Mint | 10 Gem Mint (950–989) |
| ≤ 60 | 9 | 9 Mint | 9 Mint (900–949) |
| ≤ 65 | 8 | 8.5 NM-MT+ | 8 NM-MT (800–899) |
| ≤ 70 | 7 | 8 NM-MT | 7 NM (700–799) |
| > 70 | ≤6 | ≤7.5 | ≤6 |

The "combined ceiling" (when both faces are measured) takes the worse of the two faces' ceilings. The combined headline uses the bare grade tier (e.g. "9"), not "PSA 9" — that's a multi-grader UI; naming it PSA would mislead.

---

## 5. Data model

### Table: `centering_measurements`

```sql
ALTER TABLE public.centering_measurements
  ADD COLUMN card_identity     text NULL,            -- v24
  ADD COLUMN face               text NOT NULL DEFAULT 'front',  -- v25: 'front' | 'back'
  ADD COLUMN card_session_id    uuid NULL,           -- v25: groups front + back of same card
  ADD COLUMN image_url          text NULL,           -- v26: Supabase Storage URL
  ADD COLUMN overlay_geometry   jsonb NOT NULL DEFAULT '{}'::jsonb;  -- v26: full quad
```

Existing columns preserved: `id`, `created_at`, `updated_at`, `user_id`, `l_ratio`, `r_ratio`, `t_ratio`, `b_ratio`, `manual_adjustment`.

A pre-grade for a card is now either:
- Single row with `face = 'front'`, `card_session_id = NULL` (legacy or front-only pre-grade)
- Two rows sharing the same `card_session_id`, one with `face = 'front'`, one with `face = 'back'`

Image bytes are stored in Supabase Storage under `centering/{user_id}/{card_session_id}/{face}.{ext}`. `image_url` is the public-ish URL (or signed URL if we move that direction later).

`overlay_geometry` JSON shape:
```json
{
  "outer": {"tl": {"x": 50, "y": 60}, "tr": {...}, "br": {...}, "bl": {...}},
  "inner": {"tl": {"x": 76, "y": 94}, "tr": {...}, "br": {...}, "bl": {...}}
}
```

### Why store the image

A pre-grade is only useful if you can come back and adjust it. Without the image, the user is stuck with whatever they saved — even if the CV was wrong or they were sloppy. The privacy line in the idle screen reflects this: *"Images are saved with your measurement so you can re-open and adjust later."*

---

## 6. API routes

### `POST /api/centering/measure` (existing — unchanged)
Runs CV on uploaded image. Returns overlay geometry + computed ratios.

### `POST /api/centering/save` (new)
Accepts the final overlay JSON plus optional card_identity and card_session_id. Computes ratios server-side from the quad (no CV call). Persists with `manual_adjustment=true` if the overlay differs from the original CV result. Returns the saved row.

**Why a new route, not a flag on `measure`:** `measure` runs CV; `save` trusts the overlay. Different verbs, different code paths, different rate limits.

### `GET /api/centering/history` (new)
Returns the user's pre-grade rows ordered by `created_at DESC`. Optional query params: `?search=`, `?ceiling=` (one of: `all|10|9|8|7-`). Rows grouped by `card_session_id` server-side so dual-face pre-grades come back as a single object with `front` and `back` sub-objects.

### `GET /api/centering/session/:id` (new)
Returns a single saved session including both faces + signed URLs for the stored images, ready to re-hydrate in the edit view.

### `DELETE /api/centering/session/:id` (new)
Deletes all rows sharing the `card_session_id` plus the corresponding storage objects.

### `PATCH /api/centering/session/:id` (new)
Updates `card_identity` only. Used by the inline-rename-in-history affordance.

---

## 7. Component breakdown

| Component | Responsibility |
|---|---|
| `LensHub` | The hub view. Renders `ToolCard`s and the `PreGradeHistorySection` (compact, 5 rows). |
| `ToolCard` | A single tool tile (active or coming-soon). |
| `PreGradeHistorySection` | Compact history table for the hub (max 5 rows + "View all"). |
| `CenteringWorkspace` | State machine + orchestration for the full pre-grade flow. |
| `UploadPane` | The unified Front/Back-tabbed upload+preview surface. |
| `ProcessingPanel` | Step list with spinner. |
| `ReviewWorkspace` | The two-column review layout (image panel + numbers panel). |
| `ImageOverlayPanel` | SVG with quads, handles, rotation, gap labels. |
| `MeasurementNumbersPanel` | Combined ceiling block, grader strip, per-tab ratios, action buttons. |
| `GraderStrip` | The three-cell PSA/BGS/TAG row. |
| `FreeCornersToggle` | Mode chip + hint string. |
| `FaceTabs` | Front/Back tab selector with adj/unviewed indicators. |
| `ResultsPanel` | Dual-face or single-face results layout. |
| `FaceResultCard` | A single face's result card (used in dual-face results). |
| `PreGradeHistoryPage` | Full-page history with search + ceiling chips. |
| `HistoryFilters` | Search input + chip row. |
| `HistoryRow` | One row in the table with thumbnail, name, ratios, ceiling, time. |
| `EditWorkspace` | Same as `ReviewWorkspace` but with edit-mode chrome. |
| `FailureNotice` | Inline notice strip (not a screen) for `CARD_NOT_DETECTED` and `BACK_DETECTION_FAILED`. |

---

## 8. Reducer additions

New action types:
- `START_MEASURE` — sets state to `uploading`, generates `cardSessionId` if not present, preserves any existing per-face overlays (so add-back doesn't re-measure front)
- `RECEIVE_CV_RESULTS` — single payload may contain front, back, or both; sets only the faces that were processed
- `SELECT_HANDLE` / `CLEAR_HANDLE_SELECTION` — keyboard nudge state
- `NUDGE_HANDLE` — `{ dx, dy }` in image pixels, routed through the same drag-update path
- `TOGGLE_FREE_CORNERS` — flips the flag on both quads of the active face
- `ROTATE_QUAD` — `{ deltaDegrees, center }`, applied to both outer and inner of the active face
- `OPEN_SAVED_SESSION` — payload is the full session row + signed URLs; rehydrates `editingSessionId`, overlays, images
- `UPDATE_HISTORY_FILTER` — `{ search?, ceiling? }`
- `RENAME_HISTORY_ROW` — inline rename PATCH

---

## 9. Visual identity (locked)

Tokens unchanged from v0:
- `--void: #03050d`, `--surface: #0a1020`, `--surf2: #0e1628`, `--deep: #121d32`
- `--border: rgba(255,255,255,0.055)`, `--border-2: rgba(255,255,255,0.10)`
- `--owl: #e8a020`, `--owl-light: #f5be50`
- `--gain: #00d68f`, `--loss: #ff4560`
- `--text: #e4eaf6`, `--text-2: #7a88a8`, `--text-3: #3d4d6a`

Fonts:
- UI: **Inter** (weights 300–800)
- Numbers, mono accents: **IBM Plex Mono**

Overlay colors:
- Outer card boundary: `--owl`
- Inner frame: `--gain`

Per-axis tone in face-data (history, hub):
- `worst-axis ≤ 55` → `--gain` (green)
- `worst-axis ≤ 60` → `--owl` (gold)
- `worst-axis > 60` → `--loss` (red)

### Workspace sizing

Workspace container:
- min-height: 600px
- padding: 24px
- background: `--deep`

Overlay handles (rendered at screen px, not SVG units):
- Corner handle: 12px square
- Rotation handle: 16px circle
- Stroke width: 2px (`vector-effect: non-scaling-stroke`)
- Focus ring: 3px, color-matched

Overlay text:
- Degree dial: 14px IBM Plex Mono

Overlay axis labels (rendered at screen px, not SVG units):
- Text size: 14px IBM Plex Mono
- Padding: 4px 8px
- Color: tone-matched per axis (`≤55` `--gain`, `≤60` `--owl`, `>60` `--loss`)
- Background: dark with 1px `--border` outline

---

## 10. Copy strings (canonical)

| Surface | Copy |
|---|---|
| Idle privacy notice | "Images are saved with your measurement so you can re-open and adjust later." |
| Idle add-back notice | "Front measurement is saved. Add a back image, then click Measure to complete the pair. The front won't be re-measured." |
| Card-not-detected notice | "We couldn't lock onto a card automatically. Frame the borders yourself and we'll measure your version." |
| Back-failed notice title | "Back-side measurement didn't go through." |
| Back-failed notice body | "The front is ready to review — retry the back, or save the front-only result." |
| CV service offline | "Centering service is offline. Probably a deploy in flight, or Railway's having a moment. The pre-grade pipeline is fine — try again in a sec." |
| Save success toast | "Saved." |
| Edit success toast | "Updated." |
| History empty (no rows) | "No pre-grades yet. Save one and it shows up here for one-click re-open." |
| History empty (filtered) | "No pre-grades match these filters." |
| Combined ceiling sublabel (dual) | "worse of front · back" |
| Combined ceiling sublabel (single) | "front only (back not measured)" |
| Grader strip label | "Also reads as" |
| Keyboard nudge hint | "Selected · arrows nudge · Shift ×10" |
| Free corners hint (off) | "hold Shift to drag one freely" |
| Free corners hint (on) | "rotation off · corners drag freely" |

Decision note:

> **Decision 22 — Handle sizing is fixed screen pixels, not relative to image dimensions.** Mouse cursor size doesn't scale with the card, so handles shouldn't either. Workspace has a 600px min-height so the card is always large enough to evaluate centering by eye.

> **Decision 23 — Face result cards are clickable; click switches active face. Axis labels in workspace use tone-matched color and 14px IBM Plex Mono.**

> **Decision 24 — Grade ceiling logic uses face-aware threshold tables aligned to published PSA, BGS, and TAG standards. Back-face tolerances are looser than front. TAG defaults to TCG category for Owl Lens; Sports support is reserved but unused. Combined ceiling = worse of front and back; back-missing returns front-only with a flag.**

---

## 11. Grading thresholds

Owl Lens defaults to the TCG category. Sports support exists in code for future use, but the One Piece TCG UI does not expose it.

PSA source: https://www.psacard.com/gradingstandards

### PSA — front face

| Worst axis % | Grade ceiling |
|---|---|
| ≤55 | PSA 10 (Gem Mint) |
| ≤60 | PSA 10 (with eye-appeal allowance) |
| ≤65 | PSA 9 |
| ≤70 | PSA 8 |
| ≤75 | PSA 7 |
| ≤80 | PSA 6 |
| ≤85 | PSA 5 |
| ≤90 | PSA 4 |
| >90 | PSA 3 or worse |

### PSA — back face

| Worst axis % | Grade ceiling |
|---|---|
| ≤75 | PSA 10 |
| ≤90 | PSA 9 |
| >90 | PSA 2 or worse |

BGS source: https://www.beckett.com/grading/scale

### BGS — front face

| Worst axis % | Grade ceiling |
|---|---|
| ≤51 | BGS 10 Pristine |
| ≤55 | BGS 9.5 Gem Mint |
| ≤60 | BGS 9 Mint |
| ≤65 | BGS 8.5 |
| ≤70 | BGS 8 |
| ≤75 | BGS 7.5 |
| ≤80 | BGS 7 |
| ≤85 | BGS 6.5 |
| >85 | BGS 6 or worse |

### BGS — back face

| Worst axis % | Grade ceiling |
|---|---|
| ≤55 | BGS 10 Pristine |
| ≤60 | BGS 9.5 |
| ≤80 | BGS 9 |
| ≤90 | BGS 8.5 |
| ≤95 | BGS 8 |
| >95 | BGS 7.5 or worse |

TAG sources: https://taggrading.com/pages/rubric and https://taggrading.com/pages/conversion

### TAG — front face (TCG and Sports)

| Worst axis % | Grade ceiling |
|---|---|
| ≤51 | TAG 10 Pristine (≥990) |
| ≤55 | TAG 10 Gem Mint (950–989) |
| ≤60 | TAG 9 Mint (900–949) |
| ≤62.5 | TAG 8 NM-MT (800–899) |
| ≤65 | TAG 7 NM (700–799) |
| ≤67.5 | TAG 6 EX-MT (600–699) |
| ≤70 | TAG 5 EX (500–599) |
| >70 | TAG 4 or worse |

### TAG TCG — back face

| Worst axis % | Grade ceiling |
|---|---|
| ≤52 | TAG 10 Pristine |
| ≤65 | TAG 10 Gem Mint |
| ≤75 | TAG 9 Mint |
| ≤85 | TAG 8 NM-MT |
| ≤95 | TAG 7 NM |
| >95 | TAG 6 or worse |

### TAG Sports — back face

| Worst axis % | Grade ceiling |
|---|---|
| ≤54.5 | TAG 10 Pristine |
| ≤70 | TAG 10 Gem Mint |
| ≤90 | TAG 9 Mint |
| ≤95 | TAG 8 NM-MT |
| >95 | TAG 7 or worse |

Combined ceiling is the worse numerical grade between the front and back. If the back is missing, the result returns the front ceiling with a front-only flag.

---

## 12. Scope and platform

- **Desktop only for v1.** Mobile is deferred. The two-column review layout, keyboard nudge, and rotation handle all assume mouse + keyboard input. Mobile gets a separate design pass later; likely full-bleed image with a bottom sheet for numbers.
- **Admin-only.** Routes are at `/admin/lens/*`. Auth boundary opens up in a later ADR.

---

## 13. Open questions

- Should the degree dial double as a click-to-reset-rotation control? (Deferred — easy to add.)
- Inventory autocomplete on the card-name field — out of scope here, but the field is positioned to accept it as a non-breaking upgrade later.
- Sort options on history (by ceiling, by name, by adj status). Deferred — chronological is fine for MVP scale.
- Undo/redo on overlay changes. Deferred — explicit Reset is good enough at MVP.
