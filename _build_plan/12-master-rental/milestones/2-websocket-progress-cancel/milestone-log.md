# Feature 12 — Master Rental · Milestone 2: WebSocket Progress & Cancel

**Date:** 2026-05-30
**Status:** Complete

Replaces M1's static "Import Diproses" panel with a live ActionCable-driven progress view
and adds per-file cancel with full transactional rollback. Built as a near-verbatim port of
the WebSocket + cancel machinery proven in **Trans SL Factory** (Feature 11) M2, adapted to
Master Rental's `total_cost` / `row_count` shape. The M1 job and page were already structured
to slot these in, so this milestone is purely additive — no M1 behavior changed.

## What was built

### Channel
- `app/channels/master_rental_upload_channel.rb` — mirrors `TransSlFactoryUploadChannel`:
  `subscribed` finds the upload, `stream_for` it only when `upload&.user == current_user`
  (else `reject`), and immediately transmits the current `status_update`
  (`upload_id, status, row_count, error_message`).

### Job (`app/jobs/master_rental_import_job.rb`)
- Early `if upload.cancelled?` now also `broadcast(upload)` before returning.
- `broadcast(upload)` after the `status: "processing"` transition.
- Inside the per-batch loop: `broadcast_progress(upload, row_count)` (rolling count, no
  total/percentage), then `upload.reload` + `if upload.cancelled? → ActiveRecord::Rollback`
  (sets a `cancelled_during_import` local for parity with F11).
- Final `broadcast(upload.reload)` on completion; `broadcast(upload)` in the `rescue` path.
- Two private helpers: `broadcast` (`status_update`) and `broadcast_progress`
  (`progress_update` with `progress_rows`).

### Controller + routes
- `config/routes.rb` — added `member { patch :cancel }` to the `master_rental` uploads resource.
- `app/controllers/admin/master_rental/uploads_controller.rb` — `cancel` action:
  `update!(status: "cancelled") if upload.in_flight?`, then `head :ok` (called via raw
  `fetch()`, not Inertia's router, so a bare head is correct here).

### Frontend (`app/javascript/pages/admin/master_rental/Uploads.tsx`)
- Replaced the `submitted` boolean + static panel with `trackedUploads: TrackedUpload[]` state
  and a live **Progress Import** view: one `ProgressCard` per file (filename, period,
  "X baris diproses…", error, `StatusBadge`, **Batalkan** button while in-flight, indeterminate
  `ProgressBar`).
- Two `useEffect` subscriptions to `MasterRentalUploadChannel`: one for the tracked uploads in
  the progress view, one for in-flight rows in the history table (`liveUploads` derived from the
  `uploads` prop, keyed on the sorted in-flight id list). History table now renders
  `visibleUploads` = `liveUploads` minus currently-tracked ids.
- `handleConfirmImport` builds the initial tracked list from `upload_ids` + the preview map
  (period_label) and sets it instead of `submitted`. Added `handleCancelUpload` (PATCH /cancel)
  and reworked `handleUploadAgain` to clear `trackedUploads`.
- Final summary block: "X berhasil, Y dibatalkan, Z gagal" + "Upload lagi".
- `ProgressBar` extended with an `indeterminate` prop (`progress-slide` keyframe). Dropped the
  now-unused `RotateCw` import.

### Tests
- `test/channels/master_rental_upload_channel_test.rb` — subscribe/transmit, cancelled status,
  reject other user, reject non-existent (uses the existing `pending` + `cancelled` fixtures).
- `test/jobs/master_rental_import_job_cancel_test.rb` — non-transactional, separate-connection
  cancel test proving a mid-import cancel rolls the session back to zero rows while a prior
  upload's period data is preserved exactly (mirrors F11's cancel test).
- `test/controllers/admin/master_rental/uploads_controller_test.rb` — two `cancel` action tests
  (in-flight → cancelled; completed → untouched).
- Existing `master_rental_import_job_test.rb` already covers atomic error rollback, so no change
  there.

## Decisions made during implementation (not pre-specified)

1. **Rolling row-count progress included** (`progress_update` + "X baris diproses…"). The PRD's
   M2 "does NOT include" list excludes a granular row-progress *percentage* ("1,200 / 2,647");
   the user confirmed via AskUserQuestion to keep the bare rolling count for consistency with
   Features 7/8/9/11 — it carries no total/denominator, so it stays within the exclusion's spirit.
2. **Channel payload carries only `row_count`** (not `total_cost`), identical to F11 — the live
   table refreshes `total_cost` on the `router.reload({ only: ["uploads"] })` after completion.
3. **History table left plain** — pagination/filter/sort and mobile filter sheets are M3 scope
   and were deliberately not ported, even though F11's current page (M3) has them.

## Deviations from the PRD

- None material. The PRD's row-progress exclusion was clarified with the user (decision #1).

## Verification performed

- `ruby bin/rails test` for the M2 files (channel + cancel job + import job + controller):
  **20 runs, 72 assertions, 0 failures**.
- `npm run check` — TypeScript clean.
- Full `ruby bin/rails test` suite — 0 failures.
- **Not performed:** live browser e2e of the WebSocket progress/cancel flow. The `agent-browser`
  skill referenced in CLAUDE.md is not available in this session, and the UI is a verbatim port
  of the proven Feature 11 M2 progress view; backend cancel/rollback is covered by the
  separate-connection job test. (Same precedent as the M1 log.)

## What the next milestone (M3 — History List Management) needs to know

- `UploadsController#index` still returns all rows ordered `recent` with no pagination. Port
  M3 from Feature 11's `index` + `Uploads.tsx`: `PER_PAGE = 25`, Year/Month/Status filters +
  filename search, a `period` composite sort, URL-reflected state, and the mobile filter/sort
  bottom sheets. The serializer and props shape already match F11.
- The live-update history subscription (`liveUploads` / `liveInFlightKey`) added in M2 must be
  preserved when M3 swaps the plain table for the paginated/sortable one — keep `visibleUploads`
  (tracked-id exclusion) as the table's data source.
- The `available_years` prop is already passed by the controller and typed on the page but
  currently unused; M3's filter bar will consume it.
