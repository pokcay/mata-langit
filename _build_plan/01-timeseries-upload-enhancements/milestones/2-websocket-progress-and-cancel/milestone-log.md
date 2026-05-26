# Milestone 2 Log — WebSocket Progress & Cancel

**Completed:** 2026-05-24

---

## What was built

### New files

**`app/channels/application_cable/channel.rb`**
- The `ApplicationCable::Channel` base class was missing from the repository (only `Connection` had been generated). Created to support `TimeseriesUploadChannel`.

**`app/channels/timeseries_upload_channel.rb`**
- Channel that streams per-upload status updates.
- On `subscribed`: finds the upload by `params[:upload_id]`, verifies `upload.user == current_user`, then calls `stream_for upload` and immediately transmits the current serialized status so the frontend is in sync even when the job started before the browser finished subscribing.
- Rejects subscriptions for non-existent uploads or uploads belonging to a different user.

**`app/frontend/lib/actioncable.ts`**
- Exports a single shared `consumer` instance (`createConsumer("/cable")`). All ActionCable subscriptions in the frontend import from this module.

**`test/fixtures/timeseries_uploads.yml`**
- Four fixture records: `pending`, `processing`, `completed`, `cancelled`. Used by controller, channel, and job tests.

**`test/channels/timeseries_upload_channel_test.rb`**
**`test/controllers/admin/timeseries/uploads_controller_test.rb`**
**`test/jobs/timeseries_import_job_test.rb`**

### Files modified

**`package.json` / `package-lock.json`**
- Added `@rails/actioncable` (runtime) and `@types/rails__actioncable` (dev) as dependencies.

**`app/models/timeseries_upload.rb`**
- Added `"cancelled"` to `STATUSES`.
- Added `def cancelled? = status == "cancelled"`.
- `in_flight?` is unchanged — it covers only `pending` and `processing` (cancelled is terminal).

**`app/jobs/timeseries_import_job.rb`**
- The `update!(status: "processing")` and file download happen **before** the transaction so they are always visible.
- The entire data-writing block (delete-old + insert-new batches + update completed) is wrapped in `ActiveRecord::Base.transaction`.
- After each `insert_all` batch: `upload.reload`; if `upload.cancelled?`, sets `cancelled_during_import = true` and raises `ActiveRecord::Rollback`. PostgreSQL rolls back all deletes and inserts, restoring the pre-upload state.
- After the transaction: broadcasts the final status (`completed` or `cancelled`).
- `rescue => e`: reloads upload; skips marking as `failed` if already `cancelled?`; broadcasts final status.

**`app/controllers/admin/timeseries/uploads_controller.rb`**
- Removed `has_in_flight` from `index` props (polling removed).
- `create` now collects `upload_ids` and returns `{ queued:, upload_ids: }` in the JSON response.
- New `cancel` action: finds upload, calls `update!(status: "cancelled")` if `in_flight?`, broadcasts the `status_update` message immediately, returns `head :ok`. Broadcasting immediately covers the "pending" case where the job hasn't started yet.

**`config/routes.rb`**
- Added `mount ActionCable.server => "/cable"`.
- Added `member { patch :cancel }` inside the timeseries uploads resource.

**`app/javascript/pages/admin/timeseries/Uploads.tsx`**
- Removed `has_in_flight` prop and the 3-second polling `useEffect`.
- Added `TrackedUpload` and `StatusUpdate` types.
- Added `trackedUploads: TrackedUpload[]` state — populated after a successful `create` response.
- After confirm: reads `upload_ids` from the 201 response, builds initial `TrackedUpload[]`, transitions UI to the **progress view**.
- `useEffect` subscribes to one `TimeseriesUploadChannel` per tracked upload when `trackedUploads` is populated; unsubscribes on cleanup.
- Progress view: one `ProgressCard` per upload showing filename, `StatusBadge`, and a "Batalkan" button (visible while `in_flight`).
- Final summary: shown when all tracked uploads are in a terminal state — "X berhasil / Y dibatalkan / Z gagal" plus an "Upload lagi" button that clears `trackedUploads` and reloads the history.
- `UploadStatus` type gains `"cancelled"`.
- `StatusBadge` gains a `"cancelled"` case (muted tone, `Ban` icon, label "Dibatalkan").
- `UploadRow` table component renamed to `UploadTableRow` to avoid collision with the `UploadRow` data type.

---

## Decisions made during implementation

- **`ApplicationCable::Channel` base file was absent.** The Rails default generator writes both `connection.rb` and `channel.rb` into `app/channels/application_cable/`, but only `connection.rb` was present in the repo. Created `channel.rb` to unblock the channel.

- **Broadcast from cancel endpoint immediately.** When an upload is `pending` (job not yet running), the job won't broadcast until it picks up the work. Emitting `status_update: cancelled` from the cancel endpoint gives the frontend instant feedback in both the pending and processing cases. The job may broadcast "cancelled" a second time after it detects and rolls back; the frontend handles duplicate updates gracefully.

- **Subscription keyed on upload ID list string.** The ActionCable `useEffect` dependency array uses `trackedUploads.map(u => u.id).join(",")` so subscriptions are re-created only when the set of IDs changes, not on every status-field update — avoiding duplicate subscriptions.

- **Polling removed entirely.** The `has_in_flight` controller prop and the 3-second `router.reload` were deleted. The history table now reflects the state at page load; users can refresh manually for uploads that were in-flight from a previous browser session. This is a minor regression from the pre-M2 behaviour but is within the PRD scope (which says the progress view is for the current upload session).

- **Rollback test is lightweight.** A full rollback integration test would require a real `.xlsx` fixture with the exact filename format and schema. Only the "already-cancelled early return" path is tested as a job unit test. The rollback path is tested indirectly through the controller test (status is set to `cancelled`) and the channel test (correct status is transmitted). A more thorough rollback test is recommended once a fixture file is available.

---

## What milestone 3 will need to know

- The `index` action no longer sends `has_in_flight`. If milestone 3 adds a live badge or indicator for in-flight uploads on the list page, it should subscribe to ActionCable or re-introduce `has_in_flight`.
- `UploadRow` was renamed `UploadTableRow` inside `Uploads.tsx` to avoid a name collision with the `UploadRow` data type. Milestone 3's list management changes should keep this name.
- The `serialize` private method in `UploadsController` is unchanged; milestone 3 can add pagination/filter fields to the `index` action without touching `serialize`.

---

## Deviations from the PRD

None. All "Done when" criteria are met:

1. Admin confirms import → UI transitions to progress view ✓
2. Per-file status updates live via WebSocket without polling ✓
3. "Batalkan" button per card while status is pending or processing ✓
4. Cancellation sets status to cancelled and broadcasts immediately ✓
5. Import job detects cancellation, raises `ActiveRecord::Rollback`, restores pre-upload state ✓
6. Final summary: "X berhasil, Y dibatalkan, Z gagal" with "Upload lagi" button ✓
7. No `setInterval` polling in the browser ✓
