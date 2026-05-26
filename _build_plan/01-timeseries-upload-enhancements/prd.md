# Mata Langit — Timeseries Upload Enhancements

## What we're building

We are enhancing the existing Timeseries Uploads feature to make it more robust and manageable as the volume of files grows. The enhancement focuses on two areas: (1) a smarter upload flow — with explicit duplicate detection and comparison, per-file granular control over what gets imported, and real-time progress tracking with the ability to cancel and fully roll back any in-progress import; and (2) a paginated, filterable, searchable, and sortable upload history list so the admin can efficiently navigate hundreds of files.

The feature is built on the existing Rails 8 + React 19 + PostgreSQL stack with Inertia.js, using ActionCable (Solid Cable) for real-time WebSocket updates and the existing background job infrastructure. Implementation is broken into three milestones: duplicate detection and per-file control, WebSocket progress and cancel-with-rollback, and list management.

---

### What the app does

- When uploading files and a file's region+period already has data in the database, the admin sees a clear comparison card showing old vs new row count and old vs new netto wise total
- Files where no change is detected (identical row count and netto wise) are labeled "Tidak ada perubahan terdeteksi" in the preview
- In the preview panel, each file card has a checkbox; new files are checked by default; duplicate files are **unchecked by default**, requiring explicit admin opt-in to replace
- The "Konfirmasi Import" button only submits files that are currently checked; it is disabled when nothing is checked
- After confirming, the preview transitions to a real-time progress view powered by WebSocket, showing per-file status: queued → processing → completed / failed / cancelled
- Admin can cancel any pending or in-progress upload via a "Batalkan" button; the cancellation fully rolls back all data written in that import and preserves the pre-upload state (old data is kept intact for replacement scenarios)
- The upload history list is paginated, showing 25 records per page with navigation controls and a "Menampilkan X–Y dari Z upload" summary
- A filter bar above the table lets the admin filter by region, year, month, and status, and search by filename substring; all active filters are reflected in the URL
- Clicking any column header in the table sorts ascending; clicking again sorts descending; the active sort column and direction are shown with an arrow icon and reflected in the URL

---

### Already provided by the existing codebase

- `TimeseriesUpload` and `TimeseriesTransaction` models with all fields
- `TimeseriesFileParser` with `parse_filename`, `preview`, and `each_batch` methods
- `TimeseriesImportJob` background job that deletes old records and inserts new ones for a region+period
- `Admin::Timeseries::UploadsController` with `index`, `preview` (JSON), and `create` (JSON) actions
- Multi-file upload support (files[] array) with drag-and-drop zone
- Basic duplicate detection: `will_replace` flag and `existing_row_count` returned by the preview API
- Background job infrastructure (Solid Queue on Unix, `:async` adapter in-process on Windows)
- ActionCable infrastructure (Solid Cable, DB-backed) — configured and available but not yet used by this feature
- Admin shell, design system components, auth (`Admin::BaseController`)

---

### Out of scope

- **Delete upload from history** — data loss risk; deferred to a later iteration
- **Export / download** — re-download the original .xlsx file or export transaction data to CSV/Excel
- **Audit trail per-row** — showing which specific rows changed between two uploads of the same region+period
- **Email notifications** — notifying the admin when an import completes or fails
- **Bulk delete** — selecting multiple upload records and deleting them in one action
- **Role-based access** — limiting who can upload vs. view-only; all admins retain full access

---

### Data model

No new data entities are required. Existing models are extended as follows:

**TimeseriesUpload** — tracks one upload session. Fields: filename, region, period (year + month), schema version, status, row count (after import), netto wise sum (after import), replaced row count, error message, uploaded by (user), imported at. The `status` field gains a new value: **cancelled** (in addition to pending, processing, completed, failed).

**TimeseriesTransaction** — individual transaction rows from the imported file, linked to their parent `TimeseriesUpload`. No changes to the schema.

**Preview API** — the `POST /admin/timeseries/uploads/preview` response is extended with two additional fields for duplicate files: `existing_netto_wise_sum` (the aggregate netto wise of existing records for that region+period) and `is_unchanged` (true when both row count and netto wise match exactly, so the UI can display "Tidak ada perubahan terdeteksi").

---

## Milestone 1 — Duplicate Detection & Per-File Toggle

This milestone improves the upload preview panel: admins see a richer comparison for duplicate files and have per-file checkboxes to control exactly which files get submitted.

### What gets built

- The preview API returns two additional fields for duplicate files: the existing netto wise sum and a flag indicating whether the file appears unchanged
- Each preview card for a duplicate file shows a side-by-side comparison: old row count vs new row count, old netto wise vs new netto wise
- If the file appears unchanged (row count and netto wise identical), the card displays "Tidak ada perubahan terdeteksi" and the checkbox starts unchecked
- Every preview card — new files and duplicates — has a checkbox to include or exclude that file from the import
- New files: checkbox starts checked
- Duplicate files: checkbox starts unchecked (admin must explicitly opt in to replace)
- The "Konfirmasi Import" button is disabled when no file is checked
- All other upload behavior (confirmation, import, history table) remains the same as before this milestone

### What milestone 1 explicitly does NOT include

- Real-time WebSocket progress — still uses existing polling
- Cancel functionality
- Pagination, filtering, or sorting on the history list

### Done when

The admin can upload a mix of new and duplicate .xlsx files, see the old-vs-new comparison on duplicate cards, check or uncheck files individually, and successfully import only the checked subset while skipping the unchecked ones.

---

## Milestone 2 — WebSocket Progress & Cancel

This milestone replaces the polling-based progress indicator with a real-time WebSocket feed and adds the ability to cancel any pending or in-progress upload with a full data rollback.

### What gets built

- An ActionCable channel broadcasts per-upload status updates (status changes, row count progress) from inside the import job
- After the admin confirms, the UI transitions from the preview panel to a real-time progress view subscribed to the cable channel; each file shows its current status live without polling
- A "Batalkan" button appears per file while its status is pending or processing
- Cancelling an upload: the import job detects the cancellation signal and stops; all data written in that session is rolled back; if this was a replacement, the old records are fully preserved; the upload is marked "Cancelled" in the history
- Final summary view: "X berhasil, Y dibatalkan, Z gagal" with a "Upload lagi" button to return to the initial upload state

### What milestone 2 explicitly does NOT include

- Granular row-level progress percentage (e.g., "3,241 / 8,301 baris diproses")
- Cancelling multiple uploads simultaneously from the history table
- Pagination, filtering, or sorting on the history list

### Done when

The admin confirms an import, sees live per-file status updates without page polling, can cancel any in-flight upload, and verifies that after cancellation the database contains the same records it had before the upload was attempted.

---

## Milestone 3 — List Management

This milestone adds pagination, filtering, search, and sorting to the upload history table so the admin can navigate a large dataset efficiently.

### What gets built

- The upload history is paginated server-side, showing 25 records per page
- Pagination controls at the bottom of the table: previous, next, page numbers, and a "Menampilkan X–Y dari Z upload" summary
- A filter bar above the table with dropdowns for Region, Year, Month, and Status, plus a text search field for filename
- A "Reset filter" button that clears all active filters in one click
- Clicking a sortable column header sorts ascending; clicking again sorts descending; the active column shows a directional arrow
- Sortable columns: Uploaded at, Region, Period, Row count, Netto Wise, Status
- All active filters, search term, sort column, sort direction, and current page are reflected in the URL (so the view can be bookmarked or shared)
- Applying a filter or search resets to page 1

### What milestone 3 explicitly does NOT include

- Saved / preset filter configurations
- Multi-column sort
- Variable page-size picker (per-page count is fixed at 25)
- Filter by uploaded_by (who uploaded the file)

### Done when

With hundreds of upload records in the database, the admin can navigate through paginated pages, filter the list down to a specific region and month, search by filename, and sort by netto wise descending — all reflected in the URL and usable from a fresh page load.
