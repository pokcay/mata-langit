# Market Share B2B

## What we're building

A Market Share B2B data import system that handles Excel files from multiple B2B retail accounts, each using a completely different file template. Today's known accounts are IDG, IDM (Reguler + Skincare), MIDI, and SAT — each produces Excel reports with different sheet structures, header depths, and column layouts.

The system maintains a **code-based registry** of recognized templates. When an uploaded file matches a known template, it parses and imports automatically. When a file doesn't match any known template, it flags the upload with a clear "Unknown Template" error — the admin needs to add the template in code before importing. All records land in a shared normalized table regardless of which template produced them, enabling future cross-account market share analysis.

The feature uses the same upload pipeline as Timeseries, Master Outlet Dist, and Trans Sell Out Account: client-side preview, background import with real-time WebSocket progress, per-file cancel with full rollback, and a filterable history table. Built on Rails 8 + React 19 + PostgreSQL + Inertia.js. Implementation is organized across 3 milestones.

---

### What the app does

- Accepts `.xlsx` files from multiple B2B accounts in a single batch upload
- Detects which registered template each file uses — based on sheet names and key header cell content — entirely client-side before any server round-trip
- Shows a preview card per file: detected account code, full account name, report type (Reguler/Skincare), period range, estimated row count
- Shows a red "Unknown Template" card for unrecognized files — blocked from import until a parser is added in code
- Performs server-side duplicate detection: if records for the same account + period range + report type already exist, shows an old-vs-new record count comparison card
- Imports files in the background with real-time row-count progress via WebSocket
- Allows per-file cancel with full rollback (no partial data left in DB)
- Stores all records in a normalized table with fields shared across all templates
- Shows a paginated, filterable, sortable history of all past imports

---

### Already provided by the existing codebase

- Authentication and admin access control (`Admin::BaseController`)
- WebSocket infrastructure (Solid Cable + ActionCable)
- Background job queue (Solid Queue on Linux/Mac, `:async` adapter on Windows)
- Client-side xlsx parsing via `fflate` ZIP decompression (`app/frontend/lib/xlsxPreviewParser.ts` is the reference)
- Upload pipeline pattern to follow: Trans Sell Out Account (`app/controllers/admin/trans_sellout_account/`, `app/jobs/trans_sellout_account_import_job.rb`, `app/channels/trans_sellout_account_upload_channel.rb`)
- Design system tokens, `<Badge>`, pagination, filter UI components

---

### Known template formats (from `Data/market-share-b2b/`)

| Template | Account | Sheet(s) | Format | Header rows | Detection fingerprint |
|----------|---------|---------|--------|-------------|----------------------|
| IDG Reguler | IDG | `MarketShareMOCY` | Wide (months across columns) | 5 | Sheet name = "MarketShareMOCY" |
| IDM Reguler | IDM | `MF`, `FF`, `FH`, `KIDS SC`, `KIDS SP` | Tall, multiple category sheets | 3 per sheet | Any of those 5 sheet names present |
| IDM Skincare | IDM | `SC` (or `Sheet1`) | Tall, single sheet | 3 | Single sheet with "SC" name OR filename contains "Skincare" |
| MIDI Reguler | MIDI | `Worksheet` | Tall, normalized | 9 | Sheet "Worksheet" + row 3 contains "PT MIDI UTAMA INDONESIA" |
| MIDI Skincare | MIDI | `Worksheet` | Tall, normalized | 9 | Same as MIDI Reguler, differentiated by Category row content |
| SAT Reguler | SAT | `Worksheet` | Tall, normalized (similar to MIDI) | 9 | Sheet "Worksheet" + row 1 contains "PT SUMBER ALFARIA TRIJAYA" |
| SAT Skincare | SAT | `Worksheet` | Tall, normalized | 9 | Same as SAT Reguler, differentiated by Category row content |

Detection is priority-ordered: IDG (unique sheet name) → IDM (unique multi-sheet pattern) → SAT (company in row 1) → MIDI (company in row 3) → Unknown.

---

### Out of scope

- **Admin UI for template management** — templates are code-only; adding a new account requires writing a parser class and a detection rule, then deploying
- **Automatic template learning** — no AI/ML guessing; unrecognized templates are flagged and blocked
- **Cross-account analytics dashboards** — the normalized table exists but no analysis UI is in scope here
- **Exporting to Excel** — read-only import pipeline only
- **Non-admin uploads** — admin-only, consistent with all other upload features

---

### Data model

**`MarketShareB2bUpload`** — one record per file import session:
- `user_id` — who uploaded
- `filename` — original file name
- `account_code` — short code (IDG, IDM, MIDI, SAT)
- `account_name` — full company name (e.g., "PT SUMBER ALFARIA TRIJAYA Tbk")
- `report_type` — "reguler", "skincare", or other string as it appears in the template
- `template_version` — identifier of which registered parser was used (e.g., "idg_reguler_v1")
- `period_year_from`, `period_month_from` — start of period range in file
- `period_year_to`, `period_month_to` — end of period range (differs from start for IDG multi-month files)
- `status` — pending → processing → completed / failed / cancelled
- `row_count` — records imported on success
- `replaced_row_count` — records deleted from previous import for same account+period+type
- `error_message` — exception message if failed
- `imported_at` — timestamp when import completed

**`MarketShareB2bRecord`** — one row per (account × category × brand × product × period):
- `market_share_b2b_upload_id` — FK to upload
- `account_code`, `account_name`
- `period_year`, `period_month` — one record per month (IDG wide format: each month column → separate DB record)
- `report_type`
- `category` — product category name
- `brand` — brand name
- `product_name` — specific product / SKU name (optional — not all templates provide this)
- `dc_name` — distribution centre name (optional)
- `market_share_pct` — market share % current period (decimal)
- `market_share_ly_pct` — market share % last year (optional, decimal)
- `ranking` — integer ranking (optional)
- `total_plu` — total PLU / product count (optional, integer)
- `growth_pct` — growth percentage (optional, decimal)

Duplicate detection key: `(account_code, report_type, period_year, period_month)` — when replacing, delete all records matching the full period range covered by the new file.

---

## Milestone 1 — Template Detection + Upload Pipeline + Basic Import

Establishes the complete template detection system, upload/preview UI, and background import job. No real-time WebSocket progress in this milestone — import runs in background; admin refreshes to see result.

### What gets built

- **Client-side template detection** (TypeScript): reads sheet names and key header cells from `.xlsx` using `fflate`; returns detected `{ accountCode, accountName, reportType, templateVersion, periodFrom, periodTo, rowCount }` or `{ unknown: true, reason }` if no match
- **Server-side template detection** mirrors client-side, validates before import starts
- **Five registered parser classes** (Ruby): IDG, IDM Reguler, IDM Skincare, MIDI, SAT — each knows how to iterate rows, skip header rows, and map source columns to normalized `MarketShareB2bRecord` fields
- **Upload page** (`/admin/market-share-b2b/uploads`): drag-and-drop or file picker; preview cards showing detected metadata; red "Unknown Template" cards for unrecognized files; per-file checkboxes (new files checked by default, duplicates unchecked)
- **Preview endpoint** (`POST /admin/market-share-b2b/uploads/preview`): accepts JSON metadata from client-side detection; returns existing record count for duplicate comparison; no file upload at this stage
- **Duplicate comparison cards**: old record count vs new, same pattern as Timeseries
- **Import endpoint** (`POST /admin/market-share-b2b/uploads`): accepts multipart file(s); creates `MarketShareB2bUpload` record per file; enqueues `MarketShareB2bImportJob`
- **`MarketShareB2bImportJob`**: wraps in PostgreSQL transaction; takes advisory lock; deletes old records for covered period range; bulk-inserts normalized records via `insert_all`; updates upload to "completed"
- **Plain history table**: all uploads, newest first, no pagination — list with account, period, type, row count, status badge

### What Milestone 1 explicitly does NOT include

- Real-time WebSocket progress (admin must refresh to see completion)
- Per-file cancel
- Pagination, filtering, or sorting on the history table

### Done when

Admin uploads a batch of `.xlsx` files from multiple known accounts, sees correct preview cards with detected account + period + type, confirms, and finds the completed imports in the history table with correct record counts. Uploading an unrecognized file shows a clear "Unknown Template" red card that cannot be checked for import.

---

## Milestone 2 — Real-time Progress + Cancel

Adds live progress updates per file and per-file cancel with full rollback.

### What gets built

- **`MarketShareB2bUploadChannel`** ActionCable channel — subscribes per upload ID; transmits current state immediately on subscribe (catches late subscribers); broadcasts `status_update` and `progress_update` messages
- **Job broadcasting**: job broadcasts row-count progress after each insert batch; checks upload's `status` between batches and raises `ActiveRecord::Rollback` if "cancelled"
- **Cancel endpoint** (`PATCH /admin/market-share-b2b/uploads/:id/cancel`): marks upload "cancelled"; broadcasts status update
- **Progress view** on upload page: per-file live cards showing current row count, "Batalkan" button
- **Final summary panel** after all selected files finish
- **Live history row updates**: status badge and row count update in real time as each job completes

### What Milestone 2 explicitly does NOT include

- Pagination or filtering on the history table

### Done when

Admin watches live row-count progress for each import file, cancels one mid-import and sees it roll back, and history table badges update in real time without refresh.

---

## Milestone 3 — History Table Refinements

Adds server-side pagination, filtering, and sorting.

### What gets built

- **Server-side pagination**: 25 uploads per page with page controls
- **Filter controls**: account code, report type, period year, period month, status
- **Filename search**: case-insensitive substring (`ILIKE`)
- **Sortable columns**: account, period (year+month compound), report type, row count, status, created at
- **URL-reflected state**: all filters + sort direction + page in query params (bookmarkable)

### What Milestone 3 explicitly does NOT include

- Analytics or cross-account comparison views

### Done when

Admin can filter the history table by account/period/status/type, sort by any column, and paste a URL that reproduces the exact same filtered view.

---

## Verification approach (cross-milestone)

1. Upload each of the 4 known account files from `Data/market-share-b2b/` — verify all preview cards show the correct account + period + type
2. Upload a file matching no template — confirm the red "Unknown Template" card blocks import
3. Import an IDG file (multi-month wide format) — verify one DB record exists per (brand × month), not one per brand
4. Re-import the same file — confirm duplicate comparison card appears; after confirming, old records are replaced
5. Upload two files simultaneously and cancel one mid-import — verify cancelled file's records are not in DB
6. After Milestone 3: confirm filters, sort, and URL persistence all work correctly
