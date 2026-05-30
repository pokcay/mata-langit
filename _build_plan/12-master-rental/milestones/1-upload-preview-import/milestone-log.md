# Feature 12 — Master Rental · Milestone 1: Upload, Preview & Import

**Date:** 2026-05-30
**Status:** Complete

Delivers the core upload flow for the monthly nationwide **Rental Cost** file —
the snapshot of in-store display-fixture rental fees the company pays to outlets
(one row per fixture-rental at one outlet, with the monthly cost in IDR). Built as
a near-direct mirror of **Trans SL Factory** (Feature 11) M1, simplified to the 8
stored data columns: file selection, browser-side preview with duplicate detection +
old-vs-new comparison, per-file checkboxes, background import, and a basic
(un-paginated) history table.

## What was built

### Database (migrations + models)
- `db/migrate/20260530000001_create_master_rental_uploads.rb` — one row per upload:
  `user`, `filename`, `period_year`, `period_month`, `status` (default `pending`),
  `row_count`, `total_cost` (**bigint**, IDR integer aggregate), `replaced_row_count`,
  `error_message`, `imported_at`. Indexes on `status` and `[period_year, period_month]`
  (`index_mru_on_period`).
- `db/migrate/20260530000002_create_master_rental_costs.rb` — one row per data row:
  `master_rental_upload` ref, `period_year`/`period_month`, then `region`, `area`,
  `dist_parent`, `dist_child`, `outlet_code`, `outlet_name`, `rental` (all `string`),
  `cost` (**bigint**). Index on `[period_year, period_month]` (`index_mrc_on_period`).
- `app/models/master_rental_upload.rb` — `STATUSES`, validations, `recent` scope,
  `period_label`, status predicates (`completed?`, `in_flight?`, …),
  `has_many :master_rental_costs, dependent: :delete_all`.
- `app/models/master_rental_cost.rb` — `for_period(year, month)` scope.

### Parser
- `app/lib/master_rental_file_parser.rb` — zip/XML streaming parser (no Excel gem),
  mirroring the Feature 11 parser structure but much simpler (fixed sheet, fixed
  header on row 2, data from row 3). Public methods:
  - `read_period(path)` → `{ period_year:, period_month: }` read from the merged **A1**
    title cell (`{MONTH NAME} - {YYYY}`, e.g. `"MAY - 2026"`). Month-name lookup
    (`MONTH_NAMES`) accepts full names and 3-letter abbreviations, case-insensitive.
    Used by the controller `create`.
  - `each_batch(path, upload_id:, period_year:, period_month:)` → yields
    `insert_all`-ready hashes; maps cols B–I; casts `cost` to `Integer`; skips
    blank-region rows and any repeated `"REGION"` header label. The `NO` column (A) is
    intentionally not stored.

### Job
- `app/jobs/master_rental_import_job.rb` — own advisory-lock key
  (`0x6D52656E74616C2E`), `pg_advisory_xact_lock` in a transaction, deletes prior rows
  for the same period from other uploads (→ `replaced_row_count`), `insert_all` in
  batches, aggregates `row_count` + `total_cost`, marks `completed`/`failed`, purges the
  attached file, destroys superseded upload records for the period. **No WebSocket
  broadcasts and no mid-import cancel check** (those land in M2).

### Controller + routes
- `app/controllers/admin/master_rental/uploads_controller.rb`:
  - `index` — Inertia render `admin/master_rental/Uploads`; all rows serialized
    (`recent`); **no pagination** yet (M3). Passes `available_years`.
  - `preview` — JSON duplicate detection from browser-parsed `files_metadata`
    (`filename, period_year, period_month, row_count, total_cost`); returns
    `existing_row_count`, `existing_total_cost`, `will_replace`, `is_unchanged`,
    `period_label`.
  - `create` — multipart (raw fetch); reads period server-side via `read_period`;
    cancels prior `pending` uploads for the period; attaches file; enqueues the job.
- `config/routes.rb` — `namespace :master_rental, path: "master-rental"` →
  `resources :uploads, only: %i[index create]` + `collection { post :preview }`.
  (No `cancel` member route yet — deferred to M2.)

### Frontend
- `app/frontend/lib/masterRentalPreviewParser.ts` — browser-side parser (fflate):
  locates the `RENTAL` sheet, reads the A1 period (month-name → number), counts data
  rows, sums COST — **identical row-skip rules to the server** so `is_unchanged` stays
  consistent. Returns `{ periodYear, periodMonth, rowCount, totalCost }`.
- `app/javascript/pages/admin/master_rental/Uploads.tsx` — upload zone (file + folder +
  drag/drop), worker preview → server preview, preview cards (new = period + rows +
  total COST checked by default; duplicate = old-vs-new grid unchecked by default;
  unchanged → "Tidak ada perubahan terdeteksi"; error card), "Konfirmasi Import"
  disabled when nothing checked, multipart XHR upload, then a **static "Import Diproses"**
  panel with a "Muat ulang status" button (`router.reload`) — no WebSocket. Plain
  history table (desktop) + `DataCard` list (mobile): File / Periode / Baris / Total COST
  (IDR) / Status / Waktu. Full `<Head>` metadata.
- `app/frontend/components/AdminShell.tsx` — added a "Master Rental" child (Banknote
  icon) to the "Data" sidebar group + extended `matchGroup` with `/admin/master-rental`.

### Tests
- `test/support/master_rental_fixture.rb` — synthetic-xlsx builder (caxlsx/axlsx) that
  reproduces the real structure (A1 title cell + header row 2 + data rows) and
  interleaves a blank-region decoy row to exercise the skip logic.
- `test/lib/master_rental_file_parser_test.rb`, `test/models/*`, `test/jobs/*`,
  `test/controllers/admin/master_rental/uploads_controller_test.rb`, fixtures
  (`master_rental_uploads.yml`, `master_rental_costs.yml`).
- **33 new tests, 91 assertions, all green.** Full `ruby bin/rails test` suite passes
  (192 runs, 0 failures); `npm run check` clean.

## Decisions made during implementation (not pre-specified)

1. **`cost` and `total_cost` stored as `bigint`** — the real file's COST values are all
   whole-rupiah integers; the parser casts via `Float(cleaned).round` (tolerates a stray
   decimal/thousands separator) then stores as integer.
2. **Period read from the merged A1 title cell** (`{MONTH NAME} - {YYYY}`), never the
   filename. A `MONTH_NAMES` constant maps both full names and 3-letter abbreviations
   (case-insensitive); `MAY` is unambiguous as both.
3. **Sidebar icon = `Banknote`** (rental cost) — `Store` was already taken by Master
   Outlet Dist.
4. **Synthetic in-test xlsx fixtures** rather than committing the real ~2,647-row file.
   (Confirmed with the user via AskUserQuestion.)
5. **Browser-side preview parser + server duplicate-check** mirrors Feature 11/7.
   (Confirmed with the user.)

## Deviations from the PRD

- **None material.** The real file matched the PRD's described structure exactly
  (sheet `RENTAL`, A1 = `"MAY - 2026"`, header on row 2, data from row 3, COST integer).

## Verification performed

- Parser smoke + full-pipeline integration against the **real**
  `Data/master-rental/Rental Cost 2026 - MAY.xlsx`: period **2026-05**, **2,647 rows**,
  `total_cost` **2,630,748,684**, DB row count and sum match.
- Replacement path: re-importing the same period set `replaced_row_count` to the prior
  count (2,647), left exactly 2,647 rows (no duplication), and destroyed the superseded
  upload record. Dev DB cleaned up afterward.
- `ruby bin/rails test` (full suite, 192 runs) and `npm run check` both pass.
- **Not performed:** live browser screenshot/e2e — the page typechecks and reuses the
  proven Feature 11 M1 page patterns; WebSocket progress arrives in M2.

## What the next milestone (M2 — WebSocket Progress & Cancel) needs to know

- Add `app/channels/master_rental_upload_channel.rb` mirroring
  `TransSlFactoryUploadChannel` (auth on `upload.user == current_user`).
- Add `broadcast` / `broadcast_progress` calls inside `MasterRentalImportJob` — the job
  is structured to slot these in: re-add the `if upload.cancelled?` early-return broadcast,
  the `status: "processing"` broadcast, the per-batch `broadcast_progress` + `upload.reload`
  + cancel check + `ActiveRecord::Rollback`, and the final `broadcast(upload.reload)`
  (all present in the Feature 11 job to copy).
- Add the `PATCH .../uploads/:id/cancel` route (`member { patch :cancel }`) + controller
  action (`in_flight?`-gated `update!(status: "cancelled")`).
- Frontend: replace the static "Import Diproses" panel in `Uploads.tsx` with a live
  progress view subscribed to the channel — port the `TrackedUpload` model, per-file
  "Batalkan" button, ProgressCard, and the "X berhasil, Y dibatalkan, Z gagal" summary
  directly from the **full** Feature 11 `Uploads.tsx` (which still has the complete
  WebSocket implementation). Note: this M1 page is the trimmed M1 variant, so port from
  Feature 11's current (M3) page, not from this one.

## What M3 (History List Management) needs to know

- `index` currently returns all rows ordered `recent` with no pagination. M3 should add
  `PER_PAGE = 25`, Year/Month/Status filters + filename search, a `period` composite sort,
  URL-reflected state, and the mobile filter/sort bottom sheets — all already implemented
  in the Feature 11 `UploadsController#index` + `Uploads.tsx` to copy from. The serializer
  and props shape already match Feature 11.
