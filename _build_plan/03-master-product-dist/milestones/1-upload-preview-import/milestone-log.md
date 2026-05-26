# Milestone Log — Master Product Dist, Milestone 1

Date: 2026-05-26

## What was built

### Database
- `db/migrate/20260526300001_create_master_product_dist_uploads.rb` — `master_product_dist_uploads` table with `user_id` FK, `filename`, `distributor_sap_code`, `distributor_name`, `distributor_parent_name`, `region`, `status` (default "pending"), `row_count` (default 0), `replaced_row_count` (default 0), `error_message`, `imported_at`, timestamps; indexes on `distributor_sap_code` and `status`
- `db/migrate/20260526300002_create_master_product_dist_rows.rb` — `master_product_dist_rows` table with FK to upload and all 54 data columns from the "PRODUCT DIST" sheet; no timestamps (lean storage); `distributor_id` as `bigint`, `price_start_date` as `date`, 18 numeric columns as `float`, rest as `string`; indexes on `distributor_sap_code` and `master_product_dist_upload_id`

### Models
- `app/models/master_product_dist_upload.rb` — `belongs_to :user`, `has_many :master_product_dist_rows`, `has_one_attached :file`; STATUSES constant; predicates; `recent` and `pending_or_processing` scopes
- `app/models/master_product_dist_row.rb` — `belongs_to :master_product_dist_upload`

### Parser
- `app/lib/master_product_dist_file_parser.rb` — Zip-based parser that:
  - Resolves the `PRODUCT DIST` sheet by name (not index) via `xl/workbook.xml` + `xl/_rels/workbook.xml.rels` — confirmed sheet is at `xl/worksheets/sheet2.xml` in real files
  - `peek(file_path)` → `{ distributor_sap_code:, distributor_name:, distributor_parent_name:, region: }` (reads header + first data row only; used by `create` action)
  - `each_batch(file_path, upload_id:, batch_size: 1000)` → yields arrays of `insert_all`-ready hashes
  - `cast_value` handles: `distributor_id` → int, `price_start_date` → Date (dual-parse: Excel serial or "YYYY-MM-DD" string), float columns → float, others → string
  - Handles `inlineStr` cell format (the format used in real files — no shared strings table)
  - Smoke tested: `peek` returns `{ distributor_sap_code: "333344", distributor_name: "Eka Jaya Putra Makmur, Semarang", distributor_parent_name: "Eka Jaya Putra Makmur, Semarang", region: "RegCen" }`; `each_batch` yields 1101 rows

### Background job
- `app/jobs/master_product_dist_import_job.rb` — mirrors `MasterOutletDistImportJob`:
  - Uses `ADVISORY_LOCK_KEY = 0x6D70647570723401` (unique vs Timeseries + Outlet Dist keys)
  - Deletes existing `MasterProductDistRow`s for other uploads with same `distributor_sap_code` inside the transaction (full rollback on cancel)
  - Tracks `row_count` only (no netto aggregate)
  - Broadcasts `status_update` and `progress_update` to `MasterProductDistUploadChannel`
  - Purges stale upload records for same `distributor_sap_code` after successful import

### ActionCable channel
- `app/channels/master_product_dist_upload_channel.rb` — streams to upload; transmits current state immediately on subscribe; rejects if upload doesn't belong to current user (infrastructure for M2; no frontend subscription in M1)

### Controller
- `app/controllers/admin/master_product_dist/uploads_controller.rb`:
  - `index` — returns last 50 uploads (no pagination in M1) as Inertia page props
  - `preview` — receives browser-parsed metadata (`filename`, `row_count`, `distributor_sap_code`, `distributor_name`, `distributor_parent_name`, `region`); looks up existing completed upload for each `distributor_sap_code`; returns `will_replace`, `is_unchanged`, `existing_row_count`
  - `create` — calls `MasterProductDistFileParser.peek` on server-side tempfile (authoritative metadata); cancels pending uploads for same distributor; queues `MasterProductDistImportJob`; returns JSON

### Routes
- Added `namespace :master_product_dist, path: "master-product-dist"` under `namespace :admin` in `config/routes.rb`; URLs: `GET /admin/master-product-dist/uploads`, `POST /admin/master-product-dist/uploads`, `POST /admin/master-product-dist/uploads/preview`

### Frontend
- `app/frontend/lib/productDistPreviewParser.ts` — browser-side XLSX parser:
  - Locates `PRODUCT DIST` sheet by name (workbook.xml + rels)
  - Extracts `distributorSapCode`, `distributorName`, `distributorParentName`, `region` from first data row
  - Counts all data rows
  - Returns `{ rowCount, distributorSapCode, distributorName, distributorParentName, region }`
- `app/javascript/pages/admin/master_product_dist/Uploads.tsx` — React page:
  - Drag-and-drop zone + file/folder picker for `.xlsx`
  - Browser-side async preview parsing with progress indicator
  - Preview panel: per-file card with distributor name, SAP code, region, product count; replacements show comparison table ("Jumlah Produk" old vs. new); new files checked by default, replacements unchecked
  - Confirm Import via XHR with upload progress bar; on success: `router.visit(same page)` (admin refreshes to see status — M1 has no WebSocket)
  - History table: plain table showing last 50 uploads; columns: File, Distributor, Region, Baris, Status, Waktu; no filter/sort/pagination (M3)

### Nav
- `app/frontend/components/AdminShell.tsx` — added "Master Product Dist" entry (`Package` icon) under Data group, between "Master Outlet Dist" and "Data Integrity"; updated `matchGroup` to include `/admin/master-product-dist`

## Decisions made during implementation

1. **Parser reads sheet by name only**: `PRODUCT DIST` sheet resolved via workbook.xml + rels. No hardcoded fallback (unlike Outlet Dist which fell back to sheet3.xml). If sheet not found, user gets a clear `ArgumentError`.

2. **`float` for all numeric columns**: Consistent with Timeseries pattern. `cast_value` uses `val.to_f`. Price columns are financial but the app uses float throughout — consistent with existing data model.

3. **`status` in rows table is a data column**: The `Status` column in the Excel sheet (Active/Inactive product status) maps to the `status` DB column in `master_product_dist_rows`. No naming conflict because the rows model has no state machine.

4. **M1 history table: limit(50), no pagination**: PRD explicitly defers filter/sort/pagination to M3. 50 record limit prevents unbounded queries during M1.

5. **Channel included in M1**: The job broadcasts to `MasterProductDistUploadChannel`; if no frontend subscriber is connected (which is the case in M1), broadcasts are harmlessly discarded. This avoids a conditional in the job and makes M2 purely a frontend addition.

6. **Advisory lock key**: `0x6D70647570723401` — distinct from `0x7473696D70727401` (Timeseries) and `0x6D6F647570723401` (Outlet Dist). Three import queues can run in parallel without blocking each other.

7. **`distributor_parent_name` and `region` nullable on upload**: Not all files may have these (though real files do). `distributor_sap_code` and `distributor_name` are non-nullable (required for deduplication logic).

## Deviations from PRD

None. Milestone 1 scope delivered as specified. Notable M2/M3 items explicitly deferred:
- No WebSocket / real-time status in M1 (M2)
- No cancel action / rollback (M2)
- No filter, sort, pagination on history table (M3)

## What next milestone needs to know

- **M2 (WebSocket + Cancel)**:
  - `MasterProductDistUploadChannel` is already implemented — M2 just needs to add frontend subscriptions in `Uploads.tsx`
  - Add `cancel` action to controller: flip to `cancelled`, broadcast, `head :ok`
  - Add `member { patch :cancel }` to routes
  - Add `trackedUploads` state + progress view + "Upload lagi" summary to `Uploads.tsx`
  - Job already handles cancel signal (`upload.reload` + `raise ActiveRecord::Rollback`)

- **M3 (List Management)**:
  - Replace `limit(50)` in controller `index` with full pagination (25/page), filter by region + status, search by filename, sortable columns
  - Add filter bar + sort headers + pagination controls to `Uploads.tsx`
  - Available regions for filter: `MasterProductDistUpload.distinct.pluck(:region).compact.sort`
