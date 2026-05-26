# Milestone 1 — Upload, Preview & Import: Completion Log

**Date:** 2026-05-26
**Status:** Complete

---

## What was built

### Database
- `db/migrate/20260526400001_create_trans_sellout_account_uploads.rb` — uploads tracking table with distributor_code, distributor_name, period_year, period_month, status, row_count, netto_wise_sum (decimal 20,4), replaced_row_count, error_message, imported_at; indexes on distributor_code, status, and the composite (distributor_code, period_year, period_month)
- `db/migrate/20260526400002_create_trans_sellout_account_transactions.rb` — transactions table with all 86 CORE_MAP + NEW_2025_MAP columns (same precision as timeseries_transactions), plus distributor_code, period_year, period_month for direct querying; composite index on (distributor_code, period_year, period_month) + date_transaction index

### Models
- `app/models/trans_sellout_account_upload.rb` — belongs_to :user, has_many :trans_sellout_account_transactions, has_one_attached :file; status predicates (pending?, processing?, cancelled?, completed?, in_flight?); period_label helper; validates distributor_code inclusion in %w[IDM IDG MIDI SAT]
- `app/models/trans_sellout_account_transaction.rb` — belongs_to :trans_sellout_account_upload; for_period scope

### Server-side parser
- `app/lib/trans_sellout_account_file_parser.rb`
  - DISTRIBUTOR_NAME_MAP maps full names (e.g. "Indomaret DC, Indonesia") → codes (IDM, IDG, MIDI, SAT)
  - `parse_filename` regex: `/Distributor \((.+?)\)\s*-\s*(\d{4})-(\d{2})/`
  - `each_batch` finds "Report Time Series" sheet by name via workbook.xml + rels (same `resolve_sheet_path` pattern as MasterProductDistFileParser), uses CORE_MAP.merge(NEW_2025_MAP) = 86 columns
  - No Ecom or Standard2025 extra columns (report_so_date etc.) — Distributor files follow the 86-column schema only

### Background job
- `app/jobs/trans_sellout_account_import_job.rb` — own advisory lock key (0x7473614163636F75), deletes prior TransSelloutAccountTransaction records for same distributor_code+period within the transaction, inserts batches, accumulates netto_sum as BigDecimal, polls cancelled? per batch for rollback, purges stale upload records on success; no WebSocket broadcast (added in M2)

### Controller
- `app/controllers/admin/trans_sellout_account/uploads_controller.rb` — index (no pagination, all records desc), preview (POST JSON, parses filename + queries existing netto sum from transactions), create (POST multipart, validates xlsx, cancels pending dupes, queues job), cancel (PATCH)

### Browser-side parser
- `app/frontend/lib/transSelloutPreviewParser.ts` — `parseFilenameForSellout` extracts distributor_code/name/period from filename; `parseSelloutAccountForPreview` finds "Report Time Series" sheet by name, counts rows, sums Netto Wise; returns { distributorCode, distributorName, periodYear, periodMonth, rowCount, nettoSum }

### Frontend page
- `app/javascript/pages/admin/trans_sellout_account/Uploads.tsx` — file picker + folder picker + drag-drop; browser parse → server duplicate check → preview cards; preview cards show new (checked) vs duplicate (unchecked) with row count + netto wise comparison; post-confirm static state ("X file dikonfirmasi…") with "Upload lagi" button; history table: filename, distributor code, period, row count, netto wise (IDR format), status badge, timestamp; no pagination/filtering (M3)

### Routes
- Added `namespace :trans_sellout_account, path: "trans-sellout-account"` to `config/routes.rb` with index, create, preview, cancel

### Sidebar
- Added "Trans Sellout Account" entry (ShoppingCart icon) under "Data" group in `app/frontend/components/AdminShell.tsx`; matchGroup predicate updated to include `/admin/trans-sellout-account`

---

## Decisions made during implementation

1. **No WebSocket in M1**: The import job has no broadcast calls. The post-import UI shows a static confirmation panel with filenames listed and an instructional message to refresh. M2 will replace this with real-time WebSocket tracking.

2. **86-column schema only**: The Distributor files follow CORE_MAP + NEW_2025_MAP (84 + 2 = 86 columns). No ECOM_MAP, no STANDARD_2025_EXTRA_MAP (report_so_date, report_so_number) — Distributor files don't carry those. This is simpler than Timeseries which handles 4 schema variants.

3. **Sheet found by name**: `each_batch` resolves the "Report Time Series" sheet via workbook.xml + rels (same `resolve_sheet_path` helper pattern as MasterProductDistFileParser), not by assuming sheet1.xml. This handles workbooks where sheet tab order differs from ZIP creation order.

4. **Distributor name stored as full name**: `distributor_name` on the upload record is the full captured string from the filename (e.g. "Indomaret DC, Indonesia"), not a shortened label. This is the authoritative name from the source system.

5. **No available_distributor_codes / available_years used in M1 UI**: The controller computes and passes them for forward compatibility (M3 filters), but the M1 page doesn't destructure or use them, avoiding TS unused-variable errors.

6. **`cancel` action exists in M1**: Even though M2 adds the WebSocket UI for cancellation, the cancel endpoint is wired up now because the import job already polls `upload.cancelled?` to support rollback. In M1 there's no cancel UI — M2 adds the "Batalkan" button.

---

## What the next milestone needs to know

- **M2 (WebSocket Progress & Cancel)**: 
  - Create `app/channels/trans_sellout_account_upload_channel.rb` (mirrors MasterProductDistUploadChannel pattern)
  - Add `broadcast` and `broadcast_progress` calls to `TransSelloutAccountImportJob` (both already have the structure in place — just no calls to the channel yet)
  - Replace the static confirmed state in `Uploads.tsx` with the tracked-uploads progress view (same pattern as MasterProductDist `trackedUploads` + ActionCable subscriptions)
  - Add "Batalkan" button per file card in the progress view, wired to the existing `/cancel` endpoint
  - Add dual-subscription for live-updating history rows for in-flight uploads visible in the table

- **M3 (History List Management)**:
  - Controller `index` action already computes `available_distributor_codes` and `available_years` — add `available_months`, plus sort/filter/pagination params
  - Add SORT_COLUMNS hash and PER_PAGE constant to controller
  - Update frontend to use the filter bar with Distributor Code, Year, Month, Status dropdowns + filename search + URL-reflected state
  - sortable column headers for: Uploaded at, Distributor Code, Period, Row Count, Netto Wise, Status
