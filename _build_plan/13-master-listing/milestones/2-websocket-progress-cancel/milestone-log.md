# Milestone 2 — WebSocket Progress & Cancel — Log

**Date:** 2026-05-30
**Status:** Complete

## Summary

Replaced Milestone 1's static post-confirm panel with live WebSocket progress and
added per-file cancellation with full data rollback. After confirming an import,
each file card now updates in real time (queued → processing → completed / failed
/ cancelled) via an ActionCable channel, shows a rolling "N baris diproses…" count,
exposes a "Batalkan" button while in-flight, and ends with an "X berhasil, Y
dibatalkan, Z gagal" summary + "Upload lagi". In-flight rows in the history table
also update live. Cancelling mid-import rolls back every row written in that
session and preserves prior-period data exactly. A near-mechanical mirror of
Master Rental's M2.

## What was built

### ActionCable channel
- `app/channels/master_listing_upload_channel.rb` — clone of `MasterRentalUploadChannel`.
  `subscribed` finds the upload, authorizes `upload.user == current_user`,
  `stream_for upload`, and transmits an initial `status_update`; rejects on
  ownership mismatch or missing record. Private `serialize` emits
  `upload_id / status / row_count / error_message`.

### Background job (edited)
- `app/jobs/master_listing_import_job.rb` — re-added the M2 layer stripped in M1:
  - `broadcast(upload)` on the early `cancelled?` return, after setting `processing`,
    after completion (`upload.reload`), and in the `rescue`.
  - `broadcast_progress(upload, row_count)` after each inserted batch.
  - Mid-loop cancel detection: `upload.reload; raise ActiveRecord::Rollback if
    upload.cancelled?` — the in-transaction rollback discards all rows written this
    session, leaving prior-period data intact.
  - Private `broadcast` (status_update) / `broadcast_progress` (progress_update)
    helpers.

### Route + controller (edited)
- `config/routes.rb` — added `member { patch :cancel }` to the `master_listing`
  uploads resource.
- `app/controllers/admin/master_listing/uploads_controller.rb` — added `cancel`:
  `upload.update!(status: "cancelled") if upload.in_flight?; head :ok`. Called via
  raw `fetch()` (not Inertia's router), so `head :ok` is the correct response.

### Frontend (edited)
- `app/javascript/pages/admin/master_listing/Uploads.tsx`:
  - Imported `consumer` from `@/lib/actioncable`.
  - Added `progress_rows` to `TrackedUpload`; added `StatusUpdate` / `ProgressUpdate`
    message types; initialized `progress_rows: 0` in `handleConfirmImport`.
  - Subscription `useEffect` for tracked uploads (status + progress) keyed on the
    tracked-id list.
  - `liveUploads` state (seeded from the `uploads` prop) + `liveInFlightKey`
    `useEffect` that subscribes in-flight history rows for live status updates;
    `visibleUploads` excludes tracked ids so the active progress cards aren't
    duplicated in the table.
  - `handleCancelUpload(id)` → `PATCH /admin/master-listing/uploads/:id/cancel`.
  - Restored the rich `ProgressCard` (Batalkan button while in-flight, "N baris
    diproses…", "N baris diimport", indeterminate bar) wired to `onCancel`.
  - Replaced the static "N file diantrikan" panel with real-time copy + the
    `allDone` "X berhasil / Y dibatalkan / Z gagal" summary + "Upload lagi".

### Tests (7 new, full suite 244 runs green)
- `test/channels/master_listing_upload_channel_test.rb` (4) — subscribe + initial
  transmit, cancelled-status reflection, reject other-user, reject non-existent.
- `test/jobs/master_listing_import_job_cancel_test.rb` (1) — non-transactional,
  separate-connection cancel committed mid-import proves session rollback + prior-
  period preservation (mirrors the Master Rental cancel test, uses
  `MasterListingFixture`).
- `test/controllers/admin/master_listing/uploads_controller_test.rb` (+2) — cancel
  marks an in-flight upload cancelled; cancel leaves a completed upload untouched.

## Decisions made during implementation (not pre-specified)

1. **Rolling row-count progress included (clarified with user):** the PRD's M2
   exclusion list names "row-level progress *percentage*" as out of scope. The user
   chose to mirror Master Rental exactly, so the `progress_update` broadcast and the
   "N baris diproses…" count (a raw running count, not a percentage) are included.
2. Everything else is a 1:1 structural mirror of Master Rental's M2 — same channel
   shape, same broadcast points, same advisory-lock-protected rollback, same cancel
   endpoint contract — so the two features stay behaviorally identical.

## Notes for Milestone 3 (History List Management)

- `index` still returns only `{ uploads: [...] }` with `recent.limit(100)`. M3
  expands it to server-side pagination (25/page), Year/Month/Status filters,
  filename search, 5-column sort (incl. composite period), URL-reflected state, and
  the mobile `MobileFilterSortBar` / `MobileFilterSheet` / `MobileSortSheet`
  treatment — copy wholesale from Master Rental's `UploadsController#index` +
  `Uploads.tsx` (which already carries the full M3 layer this page was reduced from).
- The frontend already imports `router` and tracks `liveUploads` / `visibleUploads`;
  M3 layers filter/sort/pagination state and the `navigate()` URL helper on top.

## Deviations from the PRD

One intentional, user-confirmed deviation: the rolling row-count progress (decision
#1 above) is included despite the PRD's wording, to keep parity with the sibling
Master Rental feature. All other M2 scope delivered; M3 items intentionally excluded.

## Verification

- `ruby bin/rails test` — full suite green: **244 runs, 653 assertions, 0 failures,
  0 errors, 0 skips** (237 → 244; +7 M2 tests). Benign Windows Tempfile-finalizer
  `EACCES` warnings appear in job-test output (same as Master Rental) and do not
  affect results.
- `npm run check` — TypeScript clean.
- **Browser walkthrough not performed in this session:** no browser-automation
  tooling (playwright MCP / agent-browser) was available. The page is a strict
  superset of the already-verified M1 reduction and a 1:1 mirror of the
  browser-verified Master Rental M2 progress view (identical primitives, handlers,
  channel contract, and design-system usage); the cancel→rollback path is covered by
  the automated channel/job/controller tests. Recommend a manual `agent-browser` pass
  at `/admin/master-listing/uploads` when tooling is available.
