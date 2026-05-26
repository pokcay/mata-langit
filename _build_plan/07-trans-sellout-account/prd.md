# Mata Langit — Trans Sell Out Account

## What we're building

Trans Sell Out Account is a new upload and data management feature for sell-out data organized by Key Account (KA) distributor. These are the major modern-trade accounts — Indomaret (IDM), Indogrosir (IDG), Midi Utama (MIDI), and Sumber Alfaria Trijaya (SAT) — each providing monthly sell-out reports in the same Excel format as the existing Timeseries (Region) feature, but using a "Distributor" dimension instead of a "Region" dimension.

The feature has its own DB tables, file parser, background job, controller, and UI pages, fully separated from the existing Timeseries upload feature. It mirrors the complete Timeseries upload experience after all enhancements: upload preview with duplicate detection, per-file toggle, background import, WebSocket real-time progress, cancel with rollback, and a paginated/filterable/sortable upload history.

Built on the same Rails 8 + React 19 + Inertia.js + PostgreSQL stack, using ActionCable (Solid Cable) for WebSocket updates and Solid Queue (or `:async` on Windows) for background jobs. Implementation is broken into three milestones: upload + preview + import, WebSocket progress + cancel, and history list management.

---

### What the app does

- Admin uploads one or more `.xlsx` files from the "Report Time Series (Regular) - Distributor (X, Indonesia) - {YYYY}-{MM}_..." naming format
- Each file is parsed to extract the distributor code (IDM / IDG / MIDI / SAT) and period (year + month) from the filename
- Files whose distributor+period already has data in the database show a comparison card: old vs new row count and old vs new netto wise total
- If a duplicate file is unchanged (identical row count and netto wise), it is labeled "Tidak ada perubahan terdeteksi"
- Every preview card has a checkbox — new files are checked by default, duplicates are unchecked by default
- The "Konfirmasi Import" button submits only the checked files and is disabled when nothing is checked
- After confirming, the view transitions to a real-time progress panel (WebSocket-powered) showing per-file status: queued → processing → completed / failed / cancelled
- Admin can cancel any pending or in-progress import; cancellation fully rolls back all data written in that session and preserves the pre-upload state
- The upload history is paginated (25 per page), filterable by distributor code, year, month, and status, searchable by filename, and sortable by key columns
- All active filters, search term, sort column, direction, and page are reflected in the URL

---

### Already provided by the existing codebase

- The full Timeseries upload feature (models, parser, job, controller, UI) — serves as the reference implementation to mirror
- ActionCable infrastructure (Solid Cable, DB-backed) and WebSocket channel pattern (see `TimeseriesImportChannel` or equivalent)
- Background job infrastructure: Solid Queue on Linux/Mac, `:async` in-process on Windows
- Admin shell, design system components, sidebar "Data" group, auth (`Admin::BaseController`)
- `inertia_share` for shared props, flash + errors handling
- Existing DB schema and migration infrastructure

---

### Out of scope

- **Delete upload from history** — data loss risk; deferred to a later iteration
- **Re-download original .xlsx file** — not stored after import
- **Row-level audit trail** — showing exactly which rows changed between two uploads of the same distributor+period
- **Email notifications** — notifying the admin when an import completes or fails
- **Bulk delete** — selecting and deleting multiple upload records at once
- **Role-based access** — all admins have full upload and view access
- **Pivot / analytics** — cross-distributor aggregation or trending views are out of scope for this feature

---

### Data model

**TransSelloutAccountUpload** — one record per upload session (one file = one upload). Tracks: filename, distributor code (IDM / IDG / MIDI / SAT), distributor full name (e.g., "Indomaret DC, Indonesia"), period year, period month, status (pending, processing, completed, failed, cancelled), row count (after import), netto wise sum (aggregate after import), replaced row count (rows deleted from a prior upload for the same distributor+period), error message, uploaded by (reference to the admin user), imported at (timestamp).

**TransSelloutAccountTransaction** — one record per data row imported from a file. Contains the same 86 columns as the existing Timeseries transaction rows: region name through flag program (CORE_MAP columns) plus BP Type and BP Position (NEW_2025_MAP columns). Also stores distributor code, period year, and period month for direct querying without joining to the upload. Belongs to a `TransSelloutAccountUpload`.

**Distributor codes and names** (the four known accounts):
- IDM → Indomaret DC, Indonesia
- IDG → Indogrosir DC, Indonesia
- MIDI → Midi Utama DC, Indonesia
- SAT → Sumber Alfaria Trijaya DC, Indonesia

**Filename format**: `Report Time Series (Regular) - Distributor ({Name}, Indonesia) - {YYYY}-{MM}_{timestamp}.xlsx`
Parser extracts the distributor name from the `Distributor (...)` segment, maps it to the code via the name map, and extracts year + month from `{YYYY}-{MM}`.

---

## Milestone 1 — Upload, Preview & Import

This milestone delivers the core upload flow: file selection, preview with duplicate detection and comparison, per-file checkboxes, and background import. It is a full working upload feature — the admin can upload files and get data into the database.

### What gets built

- A new admin page at `/admin/trans-sellout-account/uploads` (sidebar entry under "Data" group, next to existing Timeseries entry)
- A file upload zone accepting one or more `.xlsx` files with the "Distributor" filename format
- A server-side parser (`TransSelloutAccountFileParser`) that reads the "Report Time Series" sheet by name, extracts the distributor code and period from the filename, and maps the 86 columns to DB-ready hashes — mirroring `TimeseriesFileParser` but for the Distributor filename format
- A preview API endpoint that returns per-file metadata: distributor code, period, row count preview, and — for duplicates — the existing row count, existing netto wise sum, and an `is_unchanged` flag
- Preview cards in the UI:
  - New files: row count preview + checkbox checked by default
  - Duplicate files: old vs new row count + old vs new netto wise side-by-side + checkbox unchecked by default
  - Unchanged duplicates: "Tidak ada perubahan terdeteksi" label
- "Konfirmasi Import" button disabled when no file is checked; submits only checked files
- Background import job (`TransSelloutAccountImportJob`) that deletes old records for the same distributor+period and bulk-inserts the new rows; updates the upload record status to completed or failed
- Basic upload history table below the upload zone: shows filename, distributor code, period, row count, netto wise, status, and uploaded at — no pagination/filtering yet (that's Milestone 3)

### What milestone 1 explicitly does NOT include

- WebSocket real-time progress — uses simple status polling or static "processing" state
- Cancel functionality
- Pagination, filtering, or sorting on the history table

### Done when

The admin can upload a mix of new and duplicate `.xlsx` Distributor files, see the old-vs-new comparison on duplicate cards, check or uncheck individual files, confirm the import, and verify that the correct rows appear in the database for the chosen distributor+period combinations — while skipped (unchecked) files are not imported.

---

## Milestone 2 — WebSocket Progress & Cancel

This milestone replaces the static "processing" state with live WebSocket updates and adds the ability to cancel any in-flight import with a full data rollback.

### What gets built

- An ActionCable channel (`TransSelloutAccountUploadChannel`) that broadcasts per-upload status events from inside the import job
- After confirming, the UI transitions to a real-time progress view subscribed to the cable channel; each file card shows its current status live (queued → processing → completed / failed / cancelled) without page polling
- A "Batalkan" button per file while its status is pending or processing
- Cancellation: the import job detects the signal, stops processing, rolls back all rows written in that session; if this was a replacement the old records are fully preserved; the upload record is marked "cancelled"
- Final summary view: "X berhasil, Y dibatalkan, Z gagal" with an "Upload lagi" button returning to the initial upload state

### What milestone 2 explicitly does NOT include

- Granular row-level progress percentage (e.g., "3,241 / 8,301 baris diproses")
- Cancelling multiple uploads simultaneously from the history table
- Pagination, filtering, or sorting on the history list

### Done when

The admin confirms an import, sees live per-file status updates without polling, can cancel any in-flight upload, and verifies that after cancellation the database contains exactly the same records it had before the upload was attempted.

---

## Milestone 3 — History List Management

This milestone adds pagination, filtering, search, and sorting to the upload history table so the admin can navigate a large dataset efficiently.

### What gets built

- Upload history paginated server-side, 25 records per page
- Pagination controls: previous, next, page numbers, and "Menampilkan X–Y dari Z upload" summary
- Filter bar with dropdowns for Distributor Code, Year, Month, and Status, plus a filename text search field
- "Reset filter" button that clears all active filters in one click
- Sortable column headers (click once = ascending, click again = descending, active column shows arrow): Uploaded at, Distributor Code, Period, Row count, Netto Wise, Status
- All active filters, search term, sort column, sort direction, and current page are reflected in the URL (bookmarkable/shareable)
- Applying any filter or search resets to page 1

### What milestone 3 explicitly does NOT include

- Saved / preset filter configurations
- Multi-column sort
- Variable page-size picker (fixed at 25)
- Filter by uploaded_by (who uploaded the file)

### Done when

With many upload records in the database, the admin can navigate through paginated pages, filter down to a specific distributor and month, search by filename, and sort by netto wise descending — all reflected in the URL and correctly restored on a fresh page load.
