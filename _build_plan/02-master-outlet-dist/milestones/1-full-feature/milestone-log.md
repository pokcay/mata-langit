# Milestone Log — Master Outlet Dist, Milestone 1

Date: 2026-05-26

## What was built

### Database
- `db/migrate/20260526200001_create_master_outlet_dist_uploads.rb` — `master_outlet_dist_uploads` table with `user_id` FK, `filename`, `dist_sap_code`, `dist_name`, `status`, `row_count`, `replaced_row_count`, `error_message`, `imported_at`, timestamps; indexes on `dist_sap_code` and `status`
- `db/migrate/20260526200002_create_master_outlet_dist_records.rb` — `master_outlet_dist_records` table with `master_outlet_dist_upload_id` FK and all 11 outlet columns from the "OUTLET DISTRIBUTOR" sheet; no timestamps (lean storage); indexes on `dist_sap_code` and `master_outlet_dist_upload_id`

### Models
- `app/models/master_outlet_dist_upload.rb` — `belongs_to :user`, `has_many :master_outlet_dist_records`, `has_one_attached :file`; STATUSES constant; predicates; `recent` and `pending_or_processing` scopes
- `app/models/master_outlet_dist_record.rb` — `belongs_to :master_outlet_dist_upload`; `for_dist` scope

### Parser
- `app/lib/master_outlet_dist_file_parser.rb` — Zip-based (no gem beyond rubyzip) parser that:
  - Resolves the "OUTLET DISTRIBUTOR" sheet by name via `xl/workbook.xml` + `xl/_rels/workbook.xml.rels`
  - `peek(file_path)` → `{ dist_sap_code:, dist_name: }` (reads header + first data row only; used by `create` action)
  - `each_batch(file_path, upload_id:, batch_size: 1000)` → yields arrays of `insert_all`-ready hashes
  - Handles `inlineStr` cell format (the actual format used in these files — no shared strings table)
  - `dist_id` cast to integer; all other fields remain strings

### Background job
- `app/jobs/master_outlet_dist_import_job.rb` — mirrors `TimeseriesImportJob`:
  - Uses a separate `ADVISORY_LOCK_KEY` so it doesn't block Timeseries imports
  - Deletes existing `MasterOutletDistRecord`s for other uploads sharing the same `dist_sap_code` inside the transaction (full rollback on cancel)
  - Broadcasts `status_update` and `progress_update` to `MasterOutletDistUploadChannel`
  - Purges stale upload records (completed/failed/cancelled) for the same `dist_sap_code` after a successful import

### ActionCable channel
- `app/channels/master_outlet_dist_upload_channel.rb` — streams to upload; transmits current state immediately on subscribe; rejects if upload doesn't belong to current user

### Controller
- `app/controllers/admin/master_outlet_dist/uploads_controller.rb`:
  - `index` — paginated (25/page), filterable by `dist_name` and `status`, searchable by filename, sortable by 6 columns; passes `available_dist_names` to the page
  - `preview` — receives browser-parsed metadata (`filename`, `row_count`, `dist_sap_code`, `dist_name`); looks up existing completed upload for each `dist_sap_code`; returns `will_replace`, `is_unchanged`, `existing_row_count`
  - `create` — calls `MasterOutletDistFileParser.peek` to extract `dist_sap_code`/`dist_name` from the server-side tempfile (avoids trusting browser metadata for the upload record); cancels any pending uploads for the same distributor; queues `MasterOutletDistImportJob`
  - `cancel` — flips status to cancelled, broadcasts update, returns `head :ok`

### Routes
- Added `namespace :master_outlet_dist, path: "master-outlet-dist"` under `namespace :admin` in `config/routes.rb`; URL: `/admin/master-outlet-dist/uploads`

### Frontend
- `app/frontend/lib/outletDistPreviewParser.ts` — browser-side XLSX parser:
  - Locates the "OUTLET DISTRIBUTOR" sheet by name (reads workbook.xml + rels), falls back to sheet3.xml
  - Extracts `distSapCode` and `distName` from the first data row
  - Counts all data rows
  - Returns `{ rowCount, distSapCode, distName }`
- `app/javascript/pages/admin/master_outlet_dist/Uploads.tsx` — full React page:
  - Drag-and-drop zone + file picker + folder picker for `.xlsx`
  - Browser-side async preview parsing (one file at a time) with progress indicator
  - Preview panel: per-file card with distributor name, SAP code, outlet count; replacements show a comparison table ("Jumlah Outlet" old vs. new); new files checked by default, replacements unchecked
  - Confirm Import via XHR with upload progress bar
  - Real-time progress view via `MasterOutletDistUploadChannel` WebSocket
  - Cancel button on in-flight uploads
  - Post-import summary with "Upload lagi" button
  - History table with filter (distributor, status, filename search), sortable columns, pagination
  - Live updates for in-flight rows in the history table via WebSocket

### Nav
- `app/frontend/components/AdminShell.tsx` — added "Master Outlet Dist" entry (Store icon) under the Data group, between Timeseries and Data Integrity

## Decisions made during implementation

1. **`dist_id` stored as `bigint`**: The "Distributor ID" column in the Excel file is a plain numeric cell (e.g., value `38`). Stored as `bigint` in the DB; PostgreSQL coerces `38.0` (Float) to `38` on insert.

2. **No timestamps on `master_outlet_dist_records`**: Consistent with `timeseries_transactions` — omitted to keep the table lean for large datasets.

3. **Server-side `peek` during `create`**: Rather than trusting browser-supplied `dist_sap_code`/`dist_name` form fields (which could be tampered with), the `create` action calls `MasterOutletDistFileParser.peek` on the server-side tempfile. This is fast (reads header + first row only) and ensures the upload record holds accurate metadata.

4. **Separate advisory lock key**: `MasterOutletDistImportJob` uses `ADVISORY_LOCK_KEY = 0x6D6F647570723401` — a different key from `TimeseriesImportJob` — so imports for the two features don't serialize against each other.

5. **`is_unchanged` detection is count-only**: Timeseries also compares `netto_wise_sum`; there is no equivalent metric for outlet records. Two uploads for the same distributor are considered "unchanged" if and only if `existing_row_count == new_row_count`.

6. **No bulk delete in history table**: Per PRD scope — deferred.

## Deviations from PRD

None. The PRD was fully implemented as specified.
