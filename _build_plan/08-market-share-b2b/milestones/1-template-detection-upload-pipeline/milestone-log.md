# Milestone 1 Log — Template Detection + Upload Pipeline + Basic Import

**Date completed:** 2026-05-26

---

## What was built

### Database
- Migration `20260526500001_create_market_share_b2b_tables.rb`
  - `market_share_b2b_uploads` — one record per file import session (user, filename, account_code, account_name, report_type, template_version, period_year_from/month_from, period_year_to/month_to, status, row_count, replaced_row_count, error_message, imported_at)
  - `market_share_b2b_records` — one row per (account × category × brand × product × period) with composite index on (account_code, report_type, period_year, period_month)

### Models
- `app/models/market_share_b2b_upload.rb` — validations, scopes, `period_label`, status predicates
- `app/models/market_share_b2b_record.rb` — `for_period` scope

### Ruby Parser
- `app/lib/market_share_b2b_file_parser.rb` — single file with all 5 template parsers + shared XLSX/ZIP helpers
  - `detect(file_path, filename)` — returns detection hash or raises ArgumentError for unknown templates
  - `each_batch(...)` — yields batches of insert-ready hashes; dispatches to per-template parser
  - **IDG** (`each_batch_idg`): wide format, sheet "MarketShareMOCY", 5 header rows, expands month columns (JAN-26, FEB-26, ...) into one record per brand per month
  - **IDM Reguler** (`each_batch_idm`): sheets MF/FF/FH/KIDS SC/KIDS SP, 3 header rows, category from "Applied filters: cat_nm is..." in row 1, product + brand-level rows
  - **IDM Skincare** (`each_batch_idm`): sheet SC or Sheet1, same column layout
  - **MIDI** (`each_batch_tall`): sheet "Worksheet", 9 header rows, company "PT MIDI UTAMA INDONESIA" in row 3, tall format with category headers inline
  - **SAT** (`each_batch_tall`): same tall format, company "PT SUMBER ALFARIA TRIJAYA" in row 1

### Background Job
- `app/jobs/market_share_b2b_import_job.rb` — advisory lock key `0x6D73625F62326200`, wraps in transaction, deletes old records for each covered month, bulk-inserts via `insert_all`, updates upload to completed/failed

### Controller
- `app/controllers/admin/market_share_b2b/uploads_controller.rb` — `index` (renders Inertia page), `preview` (JSON, duplicate count lookup), `create` (multipart, enqueues job)

### Routes
- `namespace :market_share_b2b, path: "market-share-b2b"` with `uploads` resource (index, create, collection preview)

### TypeScript parser
- `app/frontend/lib/marketShareB2bPreviewParser.ts` — client-side template detection using fflate; returns `MarketShareB2bDetected` or `MarketShareB2bUnknown` (never throws); handles all 5 templates + unknown

### React page
- `app/javascript/pages/admin/market_share_b2b/Uploads.tsx` — M1 version: drag-drop upload, client-side template detection with progress, server duplicate check, preview cards (known) + red "Unknown Template" cards (blocked), per-file checkboxes, plain history table (newest first, no pagination/sort/filter)

### Navigation
- `app/frontend/components/AdminShell.tsx` — added "Market Share B2B" nav entry with PieChart icon under the Data group

---

## Decisions made during implementation

### `market_share_pct` normalization
IDG and IDM store values as decimal fractions (0.226 = 22.6%); SAT and MIDI store as percentage numbers (34.15 = 34.15%). **Decision (user-confirmed):** normalize all to 0-100 percentage scale — IDG/IDM values are multiplied ×100 before storage. This makes all templates comparable in the DB.

### IDM row granularity
Both brand-aggregate rows ("ALL BRAVEN") and individual product SKU rows are stored. `product_name` is populated for all IDM rows (including aggregate rows like "ALL BRAVEN"). `brand` comes from column B (always the brand name). This was user-confirmed.

### `growth_pct` for IDM
IDM's "Growth Value" column stores a decimal ratio (e.g. 1.1525 = +15.25% YoY growth in sales value). Unlike SAT/MIDI which store a percentage string ("31.57%"). These are stored as raw values without conversion since the measure is different (IDM = sales value growth rate; SAT/MIDI = YoY sales growth %). A downstream analyst will need to know the scale difference.

### IDG data row detection
IDG data rows have column A set to an empty shared string "" (not truly blank — the cell exists with ss[2]=""). Category header rows have a non-empty string in A ("BABY SOAP", etc.). The parser checks `col_a.present?` to distinguish categories from data rows.

### MIDI/SAT data row detection
Row number in column A is stored as a NUMERIC cell (not a shared string). `xlsx_cell_string` returns nil for numeric cells. Fix: use `numeric_cell_value(row_xml, "A")` to detect data rows (positive integer means data row), and separately check `xlsx_cell_string` for category header strings ("Category: XXX").

### No WebSocket in M1
As per PRD: import runs in background; admin must refresh to see completion. The React page does `window.location.reload()` after the upload POST succeeds. M2 will replace this with ActionCable.

### Advisory lock key
Used `0x6D73625F62326200` ("msb_b2b." in ASCII). Distinct from all other import jobs (Timeseries, MasterOutletDist, MasterProductDist, TransSelloutAccount).

### IDM April files without "IDM" in filename
Files like "04. April 2026 (Market Share Reguler).xlsx" have no account identifier in the filename. Detection is purely content-based (sheet names MF/FF/FH/KIDS SC/KIDS SP = IDM Reguler; SC = IDM Skincare). Period is extracted from the filename via Indonesian month name regex.

---

## Verified against sample data

| File | Records | First record |
|------|---------|-------------|
| IDG Jan-Mar 2026 | 612 | category=BABY SOAP, brand=CUSSONS, ms_pct=13.716, period=2026-1 |
| IDG Jan-Apr 2026 | 820 | category=BABY SOAP, brand=CUSSONS, ms_pct=13.716, period=2026-1 |
| IDM Jan 2026 Reguler | 44 | category=BODY COLOGNE FOR MEN, brand=MORRIS, ms_pct=17.1852 |
| IDM Jan 2026 Skincare | 27 | category=FACIAL WASH & SCRUB FOR WOMEN, brand=GARNIER, ms_pct=10.6508 |
| MIDI Jan 2026 Reguler | 113 | category=HEALTHY LIQUID SOAP, brand=LIFEBUOY, ms_pct=48.38 |
| MIDI Jan 2026 Skincare | 44 | category=SHAMPOO, brand=PANTENE, ms_pct=17.29 |
| SAT Jan 2026 Reguler | 31 | category=FEMININ HYGIENE, brand=SUMBER AYU, ms_pct=34.15 |
| SAT Jan 2026 Skincare | 24 | category=FACIAL WASH SOAP, brand=GLOW&LOVELY, ms_pct=14.38 |

All 26 sample files detected correctly (0 errors).  
Full test suite: 73 tests, 191 assertions, 0 failures.

---

## What Milestone 2 will need to know

- The `MarketShareB2bUploadChannel` ActionCable channel needs to be created (pattern: `TransSelloutAccountUploadChannel`)
- The import job already has `upload.reload` and cancellation check structure; add `broadcast_progress` + `broadcast` calls following `TransSelloutAccountImportJob`
- The cancel endpoint (`PATCH /admin/market-share-b2b/uploads/:id/cancel`) needs to be added to routes and controller
- The React page needs WebSocket subscription, per-file `TrackedUpload` state, and live `ProgressCard` components — copy from `TransSelloutAccountUploads.tsx`
- The history table rows need live badge updates (subscribe to in-flight uploads visible in the table)

---

## Deviations from PRD

- **`growth_pct` scale inconsistency**: IDM stores a raw growth ratio (not a percentage number). The PRD says "(optional, decimal)" without specifying scale. Stored as-is; documented above.
- **IDM `product_name` for aggregate rows**: Stores "ALL BRAVEN" as `product_name` for brand-aggregate rows rather than nil. More information is retained; analysts can filter `WHERE product_name NOT LIKE 'ALL %'` for SKU-level data.
- **No explicit `dc_name`**: No template provides distribution centre name; all records have `dc_name = nil`.
- **`growth_pct` nil for IDG**: IDG has a single GROWTH column per brand (year-over-year, not per-month). Since records are per-month, growth_pct is set to nil for IDG records to avoid attaching an annual number to individual monthly records.
