# Milestone 2 — WebSocket Progress & Cancel: Completion Log

**Date:** 2026-05-26
**Status:** Complete

---

## What was built

### ActionCable channel (NEW)
- `app/channels/trans_sellout_account_upload_channel.rb` — mirrors `MasterProductDistUploadChannel`; authorizes against `current_user`, streams for the upload record, transmits current status snapshot on subscribe

### Import job (MODIFIED)
- `app/jobs/trans_sellout_account_import_job.rb` — added five broadcast call sites:
  1. `broadcast(upload)` after early-return on cancelled (so the UI resolves the pending card)
  2. `broadcast(upload)` after `update!(status: "processing")`
  3. `broadcast_progress(upload, row_count)` inside the batch loop after each `insert_all`
  4. `broadcast(upload.reload)` after the transaction commits (completed state)
  5. `broadcast(upload)` in the rescue block (failed / cancelled via exception)
- Added `private broadcast` and `broadcast_progress` methods (same payload structure as `MasterProductDistImportJob`)

### Frontend page (MODIFIED)
- `app/javascript/pages/admin/trans_sellout_account/Uploads.tsx` — full rewrite of the post-confirm state:
  - Removed `confirmedFilenames` static panel
  - Added `TrackedUpload / StatusUpdate / ProgressUpdate` types
  - Added `trackedUploads` state; `handleConfirmImport` now captures `upload_ids` from the server response and builds initial `TrackedUpload[]` with status "pending", distributor code, distributor name, and period label (derived from the preview map)
  - Added ActionCable subscription effect keyed on tracked upload IDs — creates one `TransSelloutAccountUploadChannel` subscription per file, updates state on `status_update` and `progress_update` messages, cleans up on unmount
  - Added second subscription effect for in-flight history table uploads (`liveInFlightKey`) — live-updates status/row_count/error_message in the history without a full page reload
  - Added `isInProgressView` flag; history table filters out tracked IDs via `trackedIds` / `visibleUploads`
  - Added `ProgressCard` sub-component: filename, distributor code + period label, animated indeterminate progress bar while pending/processing, row count on completion, error message on failure, "Batalkan" button while in-flight
  - Added final summary panel: "X berhasil, Y dibatalkan, Z gagal" + "Upload lagi" button when all tracked uploads are in terminal state
  - Upgraded `ProgressBar` to accept an `indeterminate` prop (animated slide, same keyframe as MasterProductDist)
  - Added `handleCancelUpload` wired to existing `/cancel` endpoint (PATCH)

---

## Decisions made during implementation

1. **Period label on TrackedUpload**: The MasterProductDist tracked upload only carries `distributor_name`. TSA tracks both `distributor_code` and `period_label` because those are the two key identifiers shown in the upload cards — admins identify a TSA upload by distributor + period, not just name.

2. **Period label derived client-side in confirm handler**: Rather than fetching it from the server again, the period label is computed from `preview.period_year` / `preview.period_month` at confirm time, the same way `PreviewCard` computes it. This keeps the confirm path free of extra round-trips.

3. **No new routes**: The `/cancel` endpoint was already wired in Milestone 1, so Milestone 2 only needed the UI button to call it.

4. **`broadcast(upload)` on early-cancelled return**: Without this, a job that finds the upload already cancelled on startup would never emit a `status_update`, leaving the UI card stuck at "pending" indefinitely.

5. **`broadcast(upload)` in rescue after `raise`**: The re-raise is kept so GoodJob/Solid Queue sees the failure and retries if configured. The broadcast before the re-raise is safe because `update!` has already run by that point.

---

## What the next milestone needs to know

- **M3 (History List Management)**:
  - Controller `index` action already computes `available_distributor_codes` and `available_years` — needs `available_months` added plus sort/filter/pagination params
  - Add `SORT_COLUMNS` hash and `PER_PAGE` constant to controller
  - Update page props signature to include `total`, `page`, `per_page`, `sort`, `direction`, `filters`
  - Frontend: add filter bar (Distributor Code, Year, Month, Status dropdowns + filename search) with `navigate()` helper reflecting all state in URL
  - Add `SortableHeader` component and sortable columns: Uploaded at, Distributor Code, Period, Row Count, Netto Wise, Status
  - Pagination controls with "Menampilkan X–Y dari Z upload" summary
  - "Reset filter" button
