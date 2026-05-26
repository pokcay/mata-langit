# Mata Langit — Master Outlet Dist

## What we're building

We are building a Master Outlet Dist admin upload panel that mirrors the Timeseries upload workflow, adapted for distributor outlet master data. Admins can upload one or more `OUTLET_DIST_*.xlsx` files (one per distributor), see a per-file preview with duplicate detection, confirm or skip individual files via checkboxes, track import progress in real-time via WebSocket, cancel in-flight imports with full rollback, and browse upload history with filters, search, and sorting.

Each file covers one distributor, identified by the Distributor SAP Code read from the first data row of the **"OUTLET DISTRIBUTOR"** sheet. Uploading a new file for a distributor that already has records replaces all existing outlet records for that SAP code.

The feature is built on the existing Rails 8 + React 19 + PostgreSQL stack with Inertia.js, ActionCable (Solid Cable) for WebSocket updates, and the existing background job infrastructure (Solid Queue on Unix, `:async` adapter in-process on Windows). Implementation is a single milestone covering the complete feature end-to-end.

---

### What the app does

- Admin navigates to "Master Outlet Dist" in the admin sidebar
- Admin uploads one or more `OUTLET_DIST_*.xlsx` files via drag-and-drop, file picker, or folder picker
- The app reads the **"OUTLET DISTRIBUTOR"** sheet in each file, extracts the distributor identity (SAP code + name) from the first data row, and counts outlet rows
- A preview panel shows each file's distributor name, SAP code, and outlet count; if the distributor already has records in the database, a comparison card shows old vs. new outlet count and marks the file as "Replacement" (unchecked by default, requiring explicit admin opt-in)
- New files are checked by default in the preview
- Admin checks or unchecks individual files, then clicks "Konfirmasi Import" to submit only the checked files
- Import runs as a background job; a real-time progress view powered by WebSocket shows per-file status: pending → processing → completed / failed / cancelled
- Admin can cancel any pending or in-progress import; cancellation fully rolls back all written data and preserves the previous outlet records
- After all imports complete, a summary is shown ("N berhasil", etc.) with an "Upload lagi" button
- Upload history below the upload zone is paginated (25 per page), filterable by distributor and status, searchable by filename, and sortable by any column header

---

### Already provided by the existing codebase

- Rails 8 + React 19 + Inertia.js stack with admin layout (`AdminShell`), design system components, and auth (`Admin::BaseController`)
- Background job infrastructure (Solid Queue on Unix, `:async` adapter in-process on Windows)
- ActionCable infrastructure (Solid Cable, DB-backed) — fully configured
- The **Timeseries feature** as a complete reference implementation:
  - `TimeseriesUpload` and `TimeseriesTransaction` models
  - `TimeseriesFileParser` (parse filename, preview, each_batch)
  - `TimeseriesImportJob` (delete-old, insert-new, progress broadcasts, rollback on cancel)
  - `TimeseriesUploadChannel` (ActionCable channel)
  - `Admin::Timeseries::UploadsController` (index, preview, create, cancel)
  - `app/javascript/pages/admin/timeseries/Uploads.tsx` (full UI with drag-and-drop, preview cards, WebSocket progress, history table)

---

### Out of scope

- **Viewing individual outlet records** — no drill-down page to browse records from a specific upload
- **Delete upload from history** — data loss risk; deferred
- **Export / download** — re-download the original .xlsx or export outlet records to CSV
- **Per-row diff view** — showing which specific outlets changed between two uploads of the same distributor
- **Email notifications** — notifying on import completion or failure
- **Role-based access** — all admins retain full access
- **Other sheets** — only the "OUTLET DISTRIBUTOR" sheet is imported; OUTLET DEVIASI, SALES, OUTLET NATIONAL, BRAND GROUP, CHANNEL SUB, etc. are ignored

---

### Data model

**MasterOutletDistUpload** — one record per uploaded file:
- filename — original `.xlsx` filename
- dist_sap_code — Distributor SAP Code read from the first data row (unique identifier for the distributor)
- dist_name — Distributor Child Name read from the first data row (human-readable name)
- status — upload lifecycle: `pending`, `processing`, `completed`, `failed`, `cancelled`
- row_count — total outlet rows successfully imported
- replaced_row_count — count of existing outlet records that were replaced (0 for new distributors)
- error_message — populated when status is `failed`
- imported_at — timestamp when import completed
- user — the admin who uploaded the file

**MasterOutletDistRecord** — one record per outlet row from the "OUTLET DISTRIBUTOR" sheet:
- upload FK (links to MasterOutletDistUpload)
- region_name — Region Name
- area_name — Area Name
- dist_sap_code — Distributor SAP Code
- dist_parent_name — Distributor Parent Name
- dist_id — Distributor ID
- dist_child_name — Distributor Child Name
- outlet_dist_code — Outlet Distributor Code
- outlet_national_code — Outlet National Code
- outlet_dist_name — Outlet Distributor Name
- outlet_dist_address — Outlet Distributor Address
- outlet_dist_status — Outlet Distributor Status (e.g. Active / Inactive)

**Relationships:** MasterOutletDistUpload has many MasterOutletDistRecords. When a new upload for a distributor (matching `dist_sap_code`) is imported, all existing records belonging to other uploads for that SAP code are deleted and replaced inside a transaction (with full rollback on cancellation).

---

## Milestone 1 — Full Feature

The complete Master Outlet Dist feature, end-to-end: database models, file parser, background import job, ActionCable channel, Rails controller, and React UI (upload zone, preview panel, real-time progress, upload history with filters and sort), plus the sidebar nav entry.

### What gets built

- Database migration: `master_outlet_dist_uploads` table and `master_outlet_dist_records` table (all fields described in the data model above)
- `MasterOutletDistUpload` and `MasterOutletDistRecord` ActiveRecord models with validations and scopes
- `MasterOutletDistFileParser` — reads the **"OUTLET DISTRIBUTOR"** sheet from the xlsx; extracts `dist_sap_code` and `dist_name` from the first data row; counts outlet rows for preview; yields batches of DB-ready hashes for import
- `MasterOutletDistImportJob` — background job that deletes existing records for the same `dist_sap_code` (from other uploads), inserts new records in batches, broadcasts per-row progress via ActionCable, handles cancellation with full transaction rollback
- `MasterOutletDistUploadChannel` — ActionCable channel for real-time `status_update` and `progress_update` broadcasts, keyed by upload ID
- `Admin::MasterOutletDist::UploadsController` with:
  - `index` — paginated, filtered, sorted upload history (Inertia response)
  - `preview` — accepts file uploads, returns JSON with per-file preview data (no DB writes)
  - `create` — accepts file uploads, queues import jobs, returns JSON with queued count and upload IDs
  - `cancel` — PATCH, flips status to cancelled, broadcasts update, returns `head :ok`
- Routes: `namespace :master_outlet_dist` nested under `namespace :admin`, `resources :uploads` with `collection { post :preview }` and `member { patch :cancel }`
- React page `app/javascript/pages/admin/master_outlet_dist/Uploads.tsx` — mirrors the Timeseries Uploads page:
  - Drag-and-drop zone + file picker + folder picker for `.xlsx` files
  - Preview panel with per-file cards: distributor name, SAP code, outlet count; duplicate distributors show a comparison card (old vs. new outlet count); new files are checked by default, replacements are unchecked by default
  - Confirm Import button (disabled when nothing checked) and Cancel button
  - Real-time progress view via ActionCable WebSocket: per-file status cards with progress bar and cancel button
  - Upload history table below with pagination controls and a filter bar (filter by distributor, filter by status, search by filename, sort by column)
- "Master Outlet Dist" entry added to `AdminShell.tsx` sidebar, pointing to `/admin/master-outlet-dist/uploads`, with a `Database` or `Store` icon from lucide-react

### What milestone 1 explicitly does NOT include

- Drill-down page to browse individual outlet records for a specific upload
- Delete or bulk-delete from upload history
- Export outlet records to CSV or Excel
- Reading any sheet other than "OUTLET DISTRIBUTOR"
- Any changes to existing Timeseries feature

### Done when

The admin can open `/admin/master-outlet-dist/uploads`, upload one or more `OUTLET_DIST_*.xlsx` files from `Data/master-outlet-dist/`, see accurate duplicate detection in the preview (with old vs. new outlet count comparison for any distributor already in the database), confirm import, watch per-file progress update in real-time in the browser, cancel if needed (with data fully rolled back), and see the completed import appear correctly in the upload history table with accurate outlet counts.
