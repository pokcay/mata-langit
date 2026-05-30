# Milestone 1 — Upload, Preview & Import — Log

**Date:** 2026-05-30
**Status:** Complete

## Summary

Delivered the core Master Listing upload flow as a near-clone of Master Rental
(Feature 12), with the simpler Listing Cost data model (no `RENTAL` column,
sheet named `Listing Cost`). Admins can upload one or more `Listing Cost {Year}
- {Month}.xlsx` files, see browser+server preview with duplicate detection and
old-vs-new COST comparison, check/uncheck individual files, and run a background
import that lands the rows in the database. A basic (unpaginated) history table
shows past uploads.

## What was built

### Migrations
- `db/migrate/20260530000003_create_master_listing_uploads.rb` — `master_listing_uploads` table (user ref, filename, period_year/month, status, row_count, total_cost bigint, replaced_row_count, error_message, imported_at, timestamps; indexes on `status` and `[period_year, period_month]` named `index_mlu_on_period`).
- `db/migrate/20260530000004_create_master_listing_costs.rb` — `master_listing_costs` table (upload ref, period_year/month, region, area, dist_parent, dist_child, outlet_code, outlet_name strings, `cost` bigint; index `index_mlc_on_period`). **No `rental` column** (the key data-model difference from Master Rental).

### Models
- `app/models/master_listing_upload.rb` — `belongs_to :user`, `has_many :master_listing_costs, dependent: :delete_all`, `has_one_attached :file`, STATUSES, validations, `recent` scope, `period_label`, status predicates.
- `app/models/master_listing_cost.rb` — `belongs_to :master_listing_upload`, `for_period(year, month)` scope.

### Parser
- `app/lib/master_listing_file_parser.rb` — `read_period` (from merged A1 title cell) + `each_batch` (insert_all-ready hashes). `SHEET_NAME = "Listing Cost"`, COLUMN_MAP without `rental`, `INTEGER_COLUMNS = %i[cost]`, `HEADER_MATCH_THRESHOLD = 5` (requires `region` + `cost`). Case-insensitive sheet resolution and period parsing; skips blank-region and repeated-header rows.

### Background job
- `app/jobs/master_listing_import_job.rb` — M1 version (no WebSocket broadcasts, no mid-loop cancel checks). Sets `processing`, downloads the attached file, in a single transaction with a distinct advisory lock (`0x6D4C697374696E67` = "mListing") deletes prior-period rows from other uploads (records `replaced_row_count`), bulk-inserts via the parser, aggregates `row_count` + `total_cost`, marks `completed` with `imported_at`, destroys superseded same-period upload records, and purges the attached file. On error marks `failed` with the message and re-raises (transaction rolls back atomically, preserving prior-period data).

### Routes + controller
- `config/routes.rb` — added `namespace :master_listing, path: "master-listing"` with `resources :uploads, only: %i[index create]` and `collection { post :preview }`. **No `cancel` member route** (that's M2).
- `app/controllers/admin/master_listing/uploads_controller.rb` — `index` (basic, `recent.limit(100)`, no pagination/filter/sort props), `preview` (duplicate metadata over `MasterListingCost.for_period`), `create` (validate `.xlsx`, read in-file period, cancel same-period pendings, attach, save, enqueue job; returns `{ queued, upload_ids }` JSON). No `cancel` action.

### Frontend
- `app/frontend/lib/masterListingPreviewParser.ts` — browser-side fflate parser mirroring the server parser (sheet `Listing Cost`, no rental column, threshold 5); returns `{ periodYear, periodMonth, rowCount, totalCost }`.
- `app/javascript/pages/admin/master_listing/Uploads.tsx` — M1-reduced page: idle dropzone + file/folder pickers, worker preview progress, server preview cards (new / replacement-with-comparison / "Tidak ada perubahan terdeteksi"), per-file checkboxes (new checked, duplicate unchecked), "Konfirmasi Import" (disabled when none checked), xhr upload with progress, a **static** per-file "Progress Import" panel populated as all `pending` from the create response, and a basic desktop table + mobile `DataCard` history list. **No** ActionCable subscriptions, cancel buttons, filters, sorting, pagination, or mobile filter/sort sheets.
- `app/frontend/components/AdminShell.tsx` — added the `Tags` lucide icon import, a "Master Listing" nav item right after "Master Rental" in the Data group, and `/admin/master-listing` to the Data-group open condition.

### Tests (33 examples, all green)
- `test/support/master_listing_fixture.rb` — synthetic `Listing Cost` workbook builder (A1 title, header without RENTAL, interleaved blank-region decoy row; default COST sum 7,100,000).
- `test/lib/master_listing_file_parser_test.rb`, `test/models/master_listing_{upload,cost}_test.rb`, `test/jobs/master_listing_import_job_test.rb`, `test/controllers/admin/master_listing/uploads_controller_test.rb`, plus `test/fixtures/master_listing_{uploads,costs}.yml`.

## Decisions made during implementation (not pre-specified)

1. **Post-confirm UX (clarified with user):** chose a static per-file "Progress Import" panel (all `pending`) + history reload, over a flash-only approach, to keep the component structure stable for M2's live-cable swap-in.
2. **Migration timestamps** `20260530000003/4` — sequenced right after Master Rental's `…0001/2`.
3. **`HEADER_MATCH_THRESHOLD = 5`** — Listing Cost maps 7 columns (vs Rental's 8); threshold lowered from 6 to 5 while still requiring `region` + `cost`.
4. **Advisory lock key** `0x6D4C697374696E67` ("mListing") — distinct from Master Rental's so the two queues don't contend.
5. **`cost` stored as `bigint`** (matching Master Rental's COST) even though it is conceptually an integer IDR amount.
6. **Sidebar icon** `Tags` (clarified with user).

## Notes for Milestone 2 (WebSocket Progress & Cancel)

- Add `MasterListingUploadChannel` (mirror `MasterRentalUploadChannel`) and wire `broadcast`/`broadcast_progress` into `MasterListingImportJob`, plus the `upload.reload`/`cancelled?` mid-loop checks and the early-return broadcast — all currently stripped from the M1 job.
- Add the `member { patch :cancel }` route + `cancel` controller action (mark `in_flight?` → `cancelled`).
- In the frontend, the `TrackedUpload` shape, `ProgressCard`, and the progress-view block are already in place; M2 adds: the `consumer` subscriptions (status + progress), a per-file "Batalkan" button (re-add to `ProgressCard`), the "X berhasil / Y dibatalkan / Z gagal" summary, and live-updating in-flight history rows. The `progress_rows` field will need to be re-added to `TrackedUpload`.

## Notes for Milestone 3 (History List Management)

- `index` currently returns only `{ uploads: [...] }` with `recent.limit(100)`. M3 will expand it to server-side pagination (25/page), Year/Month/Status filters, filename search, 5-column sort (incl. composite period), URL-reflected state, and the mobile `MobileFilterSortBar`/`MobileFilterSheet`/`MobileSortSheet` treatment — copy wholesale from Master Rental's `UploadsController#index` + `Uploads.tsx`.

## Deviations from the PRD

None. All M1 scope delivered; M2/M3 items intentionally excluded.

## Verification

- `ruby bin/rails test` — full suite green: **237 runs, 633 assertions, 0 failures, 0 errors**.
- `npm run check` — TypeScript clean.
- Migrations applied to dev + test DBs.
- **Browser walkthrough not performed in this session:** no browser-automation tooling (playwright MCP / agent-browser) was available. The page is a strict reduction of the already browser-verified Master Rental `Uploads.tsx` (identical primitives, handlers, and design-system usage), and the full upload→preview→import→replace→rollback path is covered by the automated parser/job/controller tests. Recommend a manual `agent-browser` pass at `/admin/master-listing/uploads` when tooling is available.
