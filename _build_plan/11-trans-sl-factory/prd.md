# Mata Langit — Trans SL Factory

## What we're building

Trans SL Factory is a new upload and data-management feature for monthly **Service Level (SL)** data exported from the factory's SAP system (report `ZBS_SERVICE_LEVEL01`, "SERVICE LEVEL BY DETAIL SO-DN-Invoice"). Each month the admin uploads **one** `.xlsx` file (e.g. `Detail SL April 2026.xlsx`) containing detailed line-level transactions — every Sales Order → Delivery Note → Invoice line, across all shipping points (SLT / JKT2 / Other), all brands, with ordered quantity/value (SO) vs. actually-delivered quantity/value (Net) and the reason any line was not fully fulfilled.

The feature has its own DB tables, file parser, background job, controller, and UI pages, fully separated from the existing Timeseries upload feature. It mirrors the complete Timeseries upload experience after all enhancements: upload preview with duplicate detection, per-file toggle, background import, WebSocket real-time progress, cancel with rollback, and a paginated/filterable/sortable upload history.

Built on the same Rails 8 + React 19 + Inertia.js + PostgreSQL stack, using ActionCable (Solid Cable) for WebSocket updates and Solid Queue (or `:async` on Windows) for background jobs. Implementation is broken into three milestones: upload + preview + import, WebSocket progress + cancel, and history list management.

---

### What the app does

- Admin uploads one or more `.xlsx` files in the "Detail SL {Month} {Year}" SAP export format
- Each file is parsed to extract its period (year + month) — read from the in-file `PERIOD :` row (`01.04.2026 TO 30.04.2026`, format DD.MM.YYYY), which is unambiguous regardless of how the file is named
- The detail sheet is located by pattern (its tab is named "Detail SL {Month} {Year}", which changes every month) and its line-level rows are parsed into DB-ready records
- Files whose **period already has data** in the database show a comparison card: old vs new row count and old vs new total Value Net
- If a duplicate file is unchanged (identical row count and total Value Net), it is labeled "Tidak ada perubahan terdeteksi"
- Every preview card has a checkbox — new files are checked by default, duplicates are unchecked by default
- The "Konfirmasi Import" button submits only the checked files and is disabled when nothing is checked
- After confirming, the view transitions to a real-time progress panel (WebSocket-powered) showing per-file status: queued → processing → completed / failed / cancelled
- Admin can cancel any pending or in-progress import; cancellation fully rolls back all data written in that session and preserves the pre-upload state
- The upload history is paginated (25 per page), filterable by year, month, and status, searchable by filename, and sortable by key columns
- All active filters, search term, sort column, direction, and page are reflected in the URL

---

### Already provided by the existing codebase

- The full Timeseries / Trans Sell Out Account upload features (models, parser, job, channel, controller, UI) — serve as the reference implementation to mirror
- ActionCable infrastructure (Solid Cable, DB-backed) and the WebSocket upload-channel pattern (see `TransSelloutAccountUploadChannel`)
- Background job infrastructure: Solid Queue on Linux/Mac, `:async` in-process on Windows; advisory-lock pattern for import jobs
- Admin shell, design system components, sidebar "Data" group, auth (`Admin::BaseController`)
- `inertia_share` for shared props, flash + errors handling
- Existing DB schema and migration infrastructure, plus the shared mobile data-list / filter-sort primitives (`<DataCard>`, `<MobileFilterSortBar>`, etc.)

---

### Out of scope

- **Delete upload from history** — data-loss risk; deferred to a later iteration
- **Re-download original .xlsx file** — not stored after import
- **Row-level audit trail** — showing exactly which lines changed between two uploads of the same period
- **Email notifications** — notifying the admin when an import completes or fails
- **Bulk delete** — selecting and deleting multiple upload records at once
- **Role-based access** — all admins have full upload and view access
- **Pivot / analytics / SL dashboards** — cross-month trending, brand/shipping-point SL summaries, or recreating the file's own pivot sheets (National / By Brand / By Shipping Point) are out of scope for this feature; this feature only ingests and stores the detail data
- **Importing the per-month summary pivot sheets** — only the line-level detail sheet is parsed

---

### Data model

**TransSlFactoryUpload** — one record per upload session (one file = one upload). Tracks: filename, period year, period month, status (pending, processing, completed, failed, cancelled), row count (after import), total Value Net (aggregate after import), replaced row count (rows deleted from a prior upload for the same period), error message, uploaded by (reference to the admin user), imported at (timestamp).

**TransSlFactoryTransaction** — one record per line-level row imported from the detail sheet. Stores period year and period month for direct querying without joining to the upload, and the line's data fields:

- shipping point (SLT / JKT2 / Other — the file's "Shipping" column)
- sold-to party (customer SAP code)
- area
- F & R type (Faktur / Return / Balsum — the "F & R" column)
- customer name
- date SO, NO SO
- NO DN
- date Invoice, NO Invoice
- code material, brand, description material
- Qty SO, Value SO
- Qty Delivery Order, Value Delivery Order
- Qty Return, Value Return
- Qty Net, Value Net
- % QTY, % Value
- reason for rejection (e.g. "Insufficient stock available")

Each TransSlFactoryTransaction belongs to a TransSlFactoryUpload.

**Period source**: the parser reads the `PERIOD :` row inside the sheet (`01.04.2026 TO 30.04.2026`) and derives year + month from the start date. Duplicate detection keys on **period (year + month) alone** — a single file covers all shipping points and brands nationally, so re-uploading the same month is what constitutes a duplicate.

**Detail sheet selection**: the workbook contains two detail tabs ("Detail SL {Month} {Year}" with full brand names, and a "(2)" variant with brand codes) plus several pivot summary tabs. The parser targets the primary detail tab (full brand names, ~27 columns), located by matching the "Detail SL" tab-name prefix and validating the expected header row, not by an exact (month-specific) sheet name.

---

## Milestone 1 — Upload, Preview & Import

This milestone delivers the core upload flow: file selection, preview with duplicate detection and comparison, per-file checkboxes, and background import. It is a full working upload feature — the admin can upload files and get data into the database.

### What gets built

- A new admin page at `/admin/trans-sl-factory/uploads` (sidebar entry under the "Data" group, alongside the existing upload features)
- A file upload zone accepting one or more `.xlsx` files in the "Detail SL {Month} {Year}" SAP export format
- A server-side parser (`TransSlFactoryFileParser`) that locates the detail sheet by tab-name prefix, reads the period from the in-file `PERIOD :` row, and maps the line-level columns to DB-ready hashes — mirroring the structure of the existing Timeseries / Trans Sell Out parsers
- A preview API endpoint that returns per-file metadata: period (year + month), row count preview, and — for duplicates — the existing row count, existing total Value Net, and an `is_unchanged` flag
- Preview cards in the UI:
  - New files: period + row count preview + checkbox checked by default
  - Duplicate files: old vs new row count + old vs new total Value Net side-by-side + checkbox unchecked by default
  - Unchanged duplicates: "Tidak ada perubahan terdeteksi" label
- "Konfirmasi Import" button disabled when no file is checked; submits only checked files
- Background import job (`TransSlFactoryImportJob`) that deletes old records for the same period and bulk-inserts the new rows; updates the upload record status to completed or failed; aggregates row count and total Value Net onto the upload record
- Basic upload history table below the upload zone: shows filename, period, row count, total Value Net (IDR-formatted), status, and uploaded at — no pagination/filtering yet (that's Milestone 3)

### What milestone 1 explicitly does NOT include

- WebSocket real-time progress — uses a simple static "processing" state
- Cancel functionality
- Pagination, filtering, or sorting on the history table

### Done when

The admin can upload a mix of new and duplicate "Detail SL" files, see the old-vs-new comparison on duplicate cards, check or uncheck individual files, confirm the import, and verify that the correct line-level rows appear in the database for the chosen periods — while skipped (unchecked) files are not imported.

---

## Milestone 2 — WebSocket Progress & Cancel

This milestone replaces the static "processing" state with live WebSocket updates and adds the ability to cancel any in-flight import with a full data rollback.

### What gets built

- An ActionCable channel (`TransSlFactoryUploadChannel`) that broadcasts per-upload status events from inside the import job
- After confirming, the UI transitions to a real-time progress view subscribed to the cable channel; each file card shows its current status live (queued → processing → completed / failed / cancelled) without page polling
- A "Batalkan" button per file while its status is pending or processing
- Cancellation: the import job detects the signal, stops processing, rolls back all rows written in that session; if this was a replacement the old records are fully preserved; the upload record is marked "cancelled"
- Final summary view: "X berhasil, Y dibatalkan, Z gagal" with an "Upload lagi" button returning to the initial upload state
- Live-updating history rows for in-flight uploads

### What milestone 2 explicitly does NOT include

- Granular row-level progress percentage (e.g., "12,400 / 33,708 baris diproses")
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
- Sortable column headers (click once = ascending, click again = descending, active column shows arrow): Uploaded at, Period, Row count, Total Value Net, Status
- All active filters, search term, sort column, sort direction, and current page are reflected in the URL (bookmarkable/shareable)
- Applying any filter or search resets to page 1
- The mobile card-list + filter/sort bottom-sheet treatment consistent with the other data screens

### What milestone 3 explicitly does NOT include

- Saved / preset filter configurations
- Multi-column sort
- Variable page-size picker (fixed at 25)
- Filter by uploaded_by (who uploaded the file)

### Done when

With many upload records in the database, the admin can navigate through paginated pages, filter down to a specific year and month, search by filename, and sort by total Value Net descending — all reflected in the URL and correctly restored on a fresh page load, on both desktop and mobile.
