# Centering Manual Smoke Runbook

Use this runbook for browser-level Centering Tool checks across inventory-attached measurements and standalone pre-grade measurements. It is meant to be runnable from a clean developer handoff without prior session context.

## What To Run First

Automated smoke checks are separate from manual browser checks.

```bash
npm run smoke:centering
```

Capture the command and result in the PR or Linear handoff. The automated suite uses mocks and should not need a live Supabase project, admin session, or Owl Lens CV service.

Manual browser checks need the local app, admin auth, Supabase data, and either a reachable Owl Lens CV service or a deliberate failure configuration.

## Required Local Environment

Set these values before starting the app:

| Variable | Required for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth, pages, persistence | Use a local or staging Supabase project for smoke work. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server auth | Must match the Supabase project above. |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin server reads/writes | Use the legacy `service_role` JWT that starts with `eyJ`, not the anon key and not an `sb_secret` key. |
| `ADMIN_EMAILS` | Admin access | Include the tester email. If unset, any signed-in Supabase user is allowed by the app helper. |
| `OWL_LENS_CV_URL` | Real measurements | Set to the Owl Lens FastAPI base URL, for example `http://localhost:8000`. The app posts to `${OWL_LENS_CV_URL}/measure`. Leave unset or point to a stopped service only when testing failure states. |

Start the local app after env changes so the server process sees them. Sign in at `/login?redirect=/admin/inventory` with a Supabase password user whose email is allowed by `ADMIN_EMAILS`.

## Safe Test Data

Use local or staging data only. Do not use customer/order production inventory.

Prepare one One Piece inventory item:

- Game: `one_piece`.
- Inventory row: one `inventory_items` row with `game_id` for `one_piece`.
- Image: set `custom_image_front_url` to a stable front-card JPEG, PNG, or WEBP URL that the local app can fetch.
- Identity: either connect `card_id` to a matching One Piece card row or set manual fields such as `manual_card_name`, `manual_card_number`, and `manual_set_code`.
- Naming: use an obvious test label such as `Smoke Centering - YYYY-MM-DD` if your environment has an item nickname/status field that supports it.

Record the inventory item id as `SMOKE_INVENTORY_ITEM_ID` for the manual routes below.

Expected persistence:

- Inventory flow inserts `centering_measurements.inventory_item_id = SMOKE_INVENTORY_ITEM_ID`.
- Standalone pre-grade flow inserts `centering_measurements.inventory_item_id IS NULL`.
- Neither flow should persist image bytes in `centering_measurements`; only metadata, ratios, pipeline data, and overlay JSON should be stored.

## Manual Browser Checks

Run these at desktop width, then repeat the core happy paths at a mobile width such as 390px.

### Inventory Centering

Open:

```text
/admin/inventory/SMOKE_INVENTORY_ITEM_ID/centering?game=one_piece
```

Expected before measurement:

- Page shows the inventory card identity.
- Workspace header says `Inventory centering`.
- Destination badge says `Saves to inventory`.
- Copy states that results attach to the inventory item.
- If `custom_image_front_url` is valid, the preloaded-card panel appears with `Measure this card` and `Upload a different image`.

Steps:

1. Click `Measure this card`, or upload a fresh front scan.
2. Wait for the processing steps to complete.
3. Confirm the result summary shows ratios, PSA ceiling, worst axis, and `Saves to inventory`.
4. Click `Download report` and confirm a PNG download starts.
5. Refresh the page.
6. Confirm `Centering history` includes the new row.
7. Confirm the database row is tied to `SMOKE_INVENTORY_ITEM_ID`.

### Standalone Pre-Grade

Open:

```text
/admin/lens/pregrade?game=one_piece
```

Expected before measurement:

- Page title is `Pre-grade`.
- Workspace header says `Standalone pre-grade`.
- Destination badge says `No inventory link`.
- Copy states that results will not attach to inventory.

Steps:

1. Upload a clear front scan.
2. Wait for the processing steps to complete.
3. Confirm the result summary says the report is not attached to an inventory item.
4. Click `Download report` and confirm a PNG download starts.
5. Refresh the page.
6. Confirm `Standalone measurements` includes the new row.
7. Confirm the database row has `inventory_item_id IS NULL`.

## Failure-State Checks

Run these in local or staging only.

### Missing Or Invalid Upload

- Try a non-image file, an unsupported media type, or an empty upload request.
- Expected: the UI shows an actionable validation state, not a generic crash.
- Expected copy: `Upload needs attention` for API validation failures.
- Expected persistence: no new measurement row.

### Card Not Detected Or Image Unreadable

- Use a deliberately bad scan, such as a blank image, a card cropped far outside the frame, or an image that the CV service returns as `CARD_NOT_DETECTED` or `IMAGE_UNREADABLE`.
- Expected: the UI shows `Manual correction available`.
- Expected controls: amber outer-card handles, green inner-frame handles, `Re-measure with my corrections`, `Reset borders`, and `Measure another`.
- Mobile check: the overlay remains usable and the action buttons stay reachable without overlapping the image.
- Expected persistence: no row is inserted until a corrected measurement succeeds.

### CV Service Unavailable

- Stop Owl Lens FastAPI or point `OWL_LENS_CV_URL` at an unused local port, then restart the Next.js app.
- Measure a valid image.
- Expected: the UI shows `Service unavailable` and offers `Try again` plus `Measure another`.
- Expected persistence: no new measurement row.

### Preloaded Image Fetch Failure

- Temporarily set the smoke inventory item's `custom_image_front_url` to a URL that returns 404 or cannot be fetched, then reload the inventory centering page.
- Expected: the page shows `Saved scan unavailable` and keeps the upload zone available.
- Expected persistence: no new measurement row.

### Unauthenticated Access

- Use an incognito browser or sign out.
- Open `/admin/inventory/SMOKE_INVENTORY_ITEM_ID/centering?game=one_piece`.
- Expected: browser redirects to `/login` with the protected route as the redirect target.
- Submit `POST /api/centering/measure` without a valid Supabase session.
- Expected: API returns `401 Unauthorized`.

## Evidence To Capture

For each Centering Tool PR, include:

- `npm run smoke:centering` output.
- Desktop notes or screenshots for inventory preloaded state, inventory result/history, standalone upload, and standalone result/history.
- Mobile notes or screenshots for upload, result overlay, manual correction, and report-download controls.
- Failure notes for validation, manual correction, CV unavailable, preload fetch failure, and unauthenticated access.
- Database notes showing one inventory-linked row and one standalone row with `inventory_item_id IS NULL`.

## Regression Checklist

Use this checklist before marking a Centering Tool PR ready for review:

- Automated smoke command passes or the failure is explained.
- Inventory mode clearly says results attach to inventory.
- Standalone mode clearly says there is no inventory link.
- Browser calls only OWL Market routes; it does not call Owl Lens FastAPI directly.
- `game=one_piece` is preserved through inventory and standalone measurement submissions.
- Inventory history shows only rows for the selected inventory item and game.
- Standalone history shows only rows where `inventory_item_id IS NULL` for the selected game.
- Manual correction handles are usable on desktop and mobile, and `Reset borders` restores the overlay.
- Validation, manual-correction, service-unavailable, preload-fetch, and unauthenticated states are visually distinct and actionable.
- Report download works from both inventory and standalone results.
