# Mata Langit — Master Listing

## What we're building

Master Listing is a new upload and data-management feature for the monthly **Listing Cost** file — the nationwide snapshot of the listing (slotting) fees the company pays to outlets to stock/list its products. Each month the admin uploads **one** `.xlsx` file (e.g. `Listing Cost 2026 - MAY.xlsx`) containing one row per *outlet* receiving a listing fee that month: which region/area the outlet sits in, the distributor (parent + child) that serves it, the outlet code and name, and the monthly listing cost in IDR (`COST`).

The grain is one listing-fee record per outlet per month. The file is a complete national snapshot for that month, so re-uploading the same month replaces it.

The feature has its own DB tables, file parser, background job, controller, and UI pages, fully separated from the existing upload features. It mirrors the complete upload experience refined across the prior features (most directly the just-shipped **Master Rental** feature): upload preview with duplicate detection, per-file toggle, background import, WebSocket real-time progress, cancel with rollback, and a paginated/filterable/sortable upload history.

Built on the same Rails 8 + React 19 + Inertia.js + PostgreSQL stack, using ActionCable (Solid Cable) for WebSocket updates and Solid Queue (or `:async` on Windows) for background jobs. Implementation is broken into three milestones: upload + preview + import, WebSocket progress + cancel, and history list management.

---

### What the app does

- Admin uploads one or more `.xlsx` files in the "Listing Cost {Year} - {Month}" format
- Each file is parsed to extract its period (year + month) — read from the in-file title cell (the merged cell `A1`, e.g. `MAY - 2026`, format `{MONTH NAME} - {YYYY}`), which is unambiguous regardless of how the file is named
- The single data sheet is located by name (the tab is named `Listing Cost`) and its rows (title on row 1, header on row 2, data from row 3) are parsed into DB-ready records
- Files whose **period already has data** in the database show a comparison card: old vs new row count and old vs new total COST (IDR)
- If a duplicate file is unchanged (identical row count and total COST), it is labeled "Tidak ada perubahan terdeteksi"
- Every preview card has a checkbox — new files are checked by default, duplicates are unchecked by default
- The "Konfirmasi Import" button submits only the checked files and is disabled when nothing is checked
- After confirming, the view transitions to a real-time progress panel (WebSocket-powered) showing per-file status: queued → processing → completed / failed / cancelled
- Admin can cancel any pending or in-progress import; cancellation fully rolls back all data written in that session and preserves the pre-upload state
- The upload history is paginated (25 per page), filterable by year, month, and status, searchable by filename, and sortable by key columns
- All active filters, search term, sort column, direction, and page are reflected in the URL

---

### Already provided by the existing codebase

- The full Master Rental / Trans SL Factory / Trans Sell Out Account upload features (models, parser, job, channel, controller, UI) — **Master Rental is the closest reference** and should be mirrored
- ActionCable infrastructure (Solid Cable, DB-backed) and the WebSocket upload-channel pattern (see `MasterRentalUploadChannel`)
- Background job infrastructure: Solid Queue on Linux/Mac, `:async` in-process on Windows; advisory-lock pattern for import jobs
- Admin shell, design system components, sidebar "Data" group, auth (`Admin::BaseController`)
- `inertia_share` for shared props, flash + errors handling
- Existing DB schema and migration infrastructure, plus the shared mobile data-list / filter-sort primitives (`<DataCard>`, `<MobileFilterSortBar>`, etc.)

---

### Out of scope

- **Analytics / dashboards / Pivot** — cross-month listing-cost trending, per-region/area cost summaries, or exposing listing data inside the Pivot feature are out of scope; this feature only ingests and stores the data. (Confirmed: v1 is upload + history only.)
- **Delete upload from history** — data-loss risk; deferred to a later iteration
- **Re-download original .xlsx file** — not stored after import
- **Row-level audit trail** — showing exactly which rows changed between two uploads of the same period
- **Outlet / distributor linkage** — resolving `OUTLET CODE` or distributor names against the existing Master Outlet Dist / Master Product Dist tables; the listing rows are stored as-is, denormalized
- **Email notifications** — notifying the admin when an import completes or fails
- **Bulk delete** — selecting and deleting multiple upload records at once
- **Role-based access** — all admins have full upload and view access
- **Per-region split uploads** — the file is treated as one national period snapshot; duplicate detection keys on period alone

---

### Data model

**MasterListingUpload** — one record per upload session (one file = one upload). Tracks: filename, period year, period month, status (pending, processing, completed, failed, cancelled), row count (after import), total cost (aggregate IDR after import), replaced row count (rows deleted from a prior upload for the same period), error message, uploaded by (reference to the admin user), imported at (timestamp).

**MasterListingCost** — one record per data row imported from the `Listing Cost` sheet. Stores period year and period month for direct querying without joining to the upload, and the row's data fields:

- region (RegCen / RegTim / RegBar)
- area (e.g. JaTeng, Jawa Barat, Kalimantan, Sulawesi)
- dist parent (the parent distributor name)
- dist child (the child distributor name)
- outlet code (the store's code, e.g. `RCJBS005318`)
- outlet name (the store's name)
- cost (the monthly listing fee in IDR — integer)

Each MasterListingCost belongs to a MasterListingUpload.

**Period source**: the parser reads the merged title cell `A1` of the `Listing Cost` sheet (e.g. `MAY - 2026`) and derives year + month from it. Duplicate detection keys on **period (year + month) alone** — a single file is a complete national snapshot for that month, so re-uploading the same month is what constitutes a duplicate.

**Sheet selection**: the workbook contains a single sheet named `Listing Cost`; the parser targets it by name, treats row 1 as the merged period title, row 2 as the header (`NO | REGION | AREA | DIST PARENT | DIST CHILD | OUTLET CODE | OUTLET NAME | COST`), and reads data from row 3 onward. The `NO` column is a row index and is not stored. Note this file has **no fixture/item column** — unlike Master Rental's `RENTAL` column, Listing Cost goes straight from `OUTLET NAME` to `COST`.

---

## Milestone 1 — Upload, Preview & Import

This milestone delivers the core upload flow: file selection, preview with duplicate detection and comparison, per-file checkboxes, and background import. It is a full working upload feature — the admin can upload files and get data into the database.

### What gets built

- A new admin page at `/admin/master-listing/uploads` (sidebar entry under the "Data" group, alongside the existing upload features)
- A file upload zone accepting one or more `.xlsx` files in the "Listing Cost {Year} - {Month}" format
- A server-side parser (`MasterListingFileParser`) that locates the `Listing Cost` sheet by name, reads the period from the merged `A1` title cell, and maps the data columns to DB-ready hashes — mirroring the structure of `MasterRentalFileParser`
- A preview API endpoint that returns per-file metadata: period (year + month), row count preview, and — for duplicates — the existing row count, existing total COST, and an `is_unchanged` flag
- Preview cards in the UI:
  - New files: period + row count preview + checkbox checked by default
  - Duplicate files: old vs new row count + old vs new total COST side-by-side + checkbox unchecked by default
  - Unchanged duplicates: "Tidak ada perubahan terdeteksi" label
- "Konfirmasi Import" button disabled when no file is checked; submits only checked files
- Background import job (`MasterListingImportJob`) that deletes old records for the same period and bulk-inserts the new rows; updates the upload record status to completed or failed; aggregates row count and total COST onto the upload record
- Basic upload history table below the upload zone: shows filename, period, row count, total COST (IDR-formatted), status, and uploaded at — no pagination/filtering yet (that's Milestone 3)

### What milestone 1 explicitly does NOT include

- WebSocket real-time progress — uses a simple static "processing" state
- Cancel functionality
- Pagination, filtering, or sorting on the history table

### Done when

The admin can upload a mix of new and duplicate "Listing Cost" files, see the old-vs-new comparison on duplicate cards, check or uncheck individual files, confirm the import, and verify that the correct listing rows appear in the database for the chosen periods — while skipped (unchecked) files are not imported.

---

## Milestone 2 — WebSocket Progress & Cancel

This milestone replaces the static "processing" state with live WebSocket updates and adds the ability to cancel any in-flight import with a full data rollback.

### What gets built

- An ActionCable channel (`MasterListingUploadChannel`) that broadcasts per-upload status events from inside the import job
- After confirming, the UI transitions to a real-time progress view subscribed to the cable channel; each file card shows its current status live (queued → processing → completed / failed / cancelled) without page polling
- A "Batalkan" button per file while its status is pending or processing
- Cancellation: the import job detects the signal, stops processing, rolls back all rows written in that session; if this was a replacement the old records are fully preserved; the upload record is marked "cancelled"
- Final summary view: "X berhasil, Y dibatalkan, Z gagal" with an "Upload lagi" button returning to the initial upload state
- Live-updating history rows for in-flight uploads

### What milestone 2 explicitly does NOT include

- Granular row-level progress percentage (e.g., "1,200 / 2,515 baris diproses")
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
- Filter bar with dropdowns for Year, Month, and Status, plus a filename text search field
- "Reset filter" button that clears all active filters in one click
- Sortable column headers (click once = ascending, click again = descending, active column shows arrow): Uploaded at, Period, Row count, Total COST, Status
- All active filters, search term, sort column, sort direction, and current page are reflected in the URL (bookmarkable/shareable)
- Applying any filter or search resets to page 1
- The mobile card-list + filter/sort bottom-sheet treatment consistent with the other data screens

### What milestone 3 explicitly does NOT include

- Saved / preset filter configurations
- Multi-column sort
- Variable page-size picker (fixed at 25)
- Filter by uploaded_by (who uploaded the file)

### Done when

With many upload records in the database, the admin can navigate through paginated pages, filter down to a specific year and month, search by filename, and sort by total COST descending — all reflected in the URL and correctly restored on a fresh page load, on both desktop and mobile.
