# Milestone 2 Log — Real-time Progress + Cancel

**Date completed:** 2026-05-26

---

## What was built

### ActionCable channel
- `app/channels/market_share_b2b_upload_channel.rb` — `MarketShareB2bUploadChannel`
  - Subscribes per `upload_id` param; rejects if upload does not belong to `current_user`
  - Transmits current state immediately on subscribe (catches late subscribers who join mid-import)
  - Broadcast shape for `status_update`: `{ type, upload_id, status, row_count, error_message }`
  - Broadcast shape for `progress_update`: `{ type, upload_id, progress_rows }`

### Job changes (`app/jobs/market_share_b2b_import_job.rb`)
- Added `broadcast(upload)` after `upload.update!(status: "processing")` so the frontend sees the transition immediately
- Inside the `each_batch` loop: `broadcast_progress(upload, row_count)` → `upload.reload` → cancel check (`raise ActiveRecord::Rollback` if cancelled, sets `cancelled_during_import` flag)
- After the transaction: `broadcast(upload.reload)` for terminal status (`completed` / `cancelled`)
- In rescue: `broadcast(upload)` so the frontend learns about `failed` state
- Fixed a subtle issue from M1: the original job called `upload.update!(status: "completed")` unconditionally inside the transaction — the new code guards with `unless cancelled_during_import` since a cancelled job's transaction is rolled back (the upload record is back to whatever `reload` returns)
- Private `broadcast` and `broadcast_progress` methods targeting `MarketShareB2bUploadChannel`

### Route addition (`config/routes.rb`)
- Added `member { patch :cancel }` to the `market_share_b2b` uploads resource
- Cancel URL: `PATCH /admin/market-share-b2b/uploads/:id/cancel`

### Controller action (`app/controllers/admin/market_share_b2b/uploads_controller.rb`)
- Added `cancel` action: finds upload scoped to `Current.user`, returns 404 if not found, 204 (no-op) if already terminal, otherwise marks "cancelled", broadcasts final status, returns `head :no_content`
- Called via raw `fetch()` (not Inertia router) — `head :no_content` is correct here

### React page (`app/javascript/pages/admin/market_share_b2b/Uploads.tsx`)
- Replaced `importDone` boolean with `trackedUploads: TrackedUpload[]` state (same pattern as Trans Sell Out Account)
- `TrackedUpload` fields: `id, filename, account_code, account_name, report_type, period_label, status, row_count, error_message, progress_rows`
- `handleConfirmImport` now builds `TrackedUpload[]` from XHR response `upload_ids` + server preview map (period label computed from `period_year_from/month_from` → `period_year_to/month_to`), then calls `router.reload({ only: ["uploads"] })` — no more `window.location.reload()`
- Two `useEffect` WebSocket subscription blocks:
  1. Per tracked upload in the progress view — handles both `progress_update` and `status_update`; re-runs when upload IDs change
  2. Per in-flight (pending/processing) upload visible in the history table — handles `status_update` only, updates `liveUploads` state
- `liveUploads` state initialized from `uploads` prop; updated by both history-table subscriptions and `useEffect(() => setLiveUploads(uploads), [uploads])` on Inertia reload
- `visibleUploads` filters tracked IDs out of the history table (prevents duplicate rows during import)
- Progress view section: `ProgressCard` per tracked upload showing `account_code · report_type · period_label`, current row count or progress, "Batalkan" button (visible while pending/processing)
- Final summary panel after all files reach terminal state: "X berhasil / Y dibatalkan / Z gagal" + "Upload lagi" button
- `ProgressBar` updated to support `indeterminate` prop (animated slide while pending/early processing)
- `handleCancelUpload(id)` — raw `fetch` PATCH to cancel endpoint

---

## Decisions made during implementation

### `cancelled_during_import` guard in job
The M1 job called `upload.update!(status: "completed")` unconditionally inside the transaction before a cancel check existed. After `ActiveRecord::Rollback` is raised, the transaction is rolled back — the upload's DB state reverts to "processing". The guard `unless cancelled_during_import` prevents a stale "completed" write after rollback. The `broadcast(upload.reload)` at the end picks up the correct final status.

### `head :no_content` in cancel action
Cancel is called via raw `fetch()` from the React side (not the Inertia router), so `head :no_content` is the correct response. Using a redirect here would break the client.

### ProgressCard metadata line
Shows `account_code · report_type · period_label` (e.g. "IDG · reguler · Jan – Mar 2026") to give enough context when monitoring a batch of files from different accounts and periods.

---

## Verified against "Done when" criteria

- Admin watches live row-count progress per import file: ✅ `progress_update` broadcasts after each batch; `ProgressCard` shows "X record diproses…"
- Admin cancels one mid-import and sees it roll back: ✅ cancel endpoint → job detects `cancelled?` between batches → `ActiveRecord::Rollback` → no partial data in DB
- History table badges update in real time without refresh: ✅ `liveUploads` subscription on in-flight history rows; status badge updates on `status_update` message

Full test suite: 73 runs, 191 assertions, 0 failures, 0 errors.

---

## What Milestone 3 will need to know

- The page currently renders all uploads in one flat list (no pagination). M3 adds server-side pagination with 25 per page, filter controls (account code, report type, year, month, status), filename search, and sortable columns with URL-reflected state — same pattern as Trans Sell Out Account M3.
- The controller `index` action will need to accept query params (`sort`, `direction`, `page`, `per_page`, filter params) and pass `total`, `page`, `per_page`, `sort`, `direction`, `filters`, `available_account_codes`, `available_years` as Inertia props.
- The React page will need `navigate()` helper, `SortableHeader` component, filter bar, and pagination controls — all directly copyable from `TransSelloutAccountUploads.tsx`.
- Distinct filter values (`available_account_codes`, `available_years`) can be derived with `MarketShareB2bUpload.distinct.pluck(:account_code)` etc.
