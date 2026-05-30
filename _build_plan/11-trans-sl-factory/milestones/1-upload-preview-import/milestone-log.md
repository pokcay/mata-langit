# Feature 11 — Trans SL Factory · Milestone 1: Upload, Preview & Import

**Date:** 2026-05-29
**Status:** Complete

Delivers the core upload flow for the monthly Service Level (SL) SAP export
(`ZBS_SERVICE_LEVEL01`, "SERVICE LEVEL BY DETAIL SO-DN-Invoice"): file selection,
browser-side preview with duplicate detection + old-vs-new comparison, per-file
checkboxes, background import, and a basic (un-paginated) history table. Built as
a parallel of the existing **Trans Sell Out Account** feature (Feature 7).

## What was built

### Database (migrations + models)
- `db/migrate/20260529000001_create_trans_sl_factory_uploads.rb` — one row per upload:
  `user`, `filename`, `period_year`, `period_month`, `status` (default `pending`),
  `row_count`, `value_net_sum` (decimal 20,4), `replaced_row_count`, `error_message`,
  `imported_at`. Indexes on `status` and `[period_year, period_month]`.
- `db/migrate/20260529000002_create_trans_sl_factory_transactions.rb` — one row per
  line item: `trans_sl_factory_upload` ref, `period_year`/`period_month`, the 24 detail
  columns (shipping_point, sold_to_party, area, f_and_r_type, customer_name, date_so,
  no_so, no_dn, date_invoice, no_invoice, code_material, brand, description_material,
  qty_so, value_so, qty_delivery_order, value_delivery_order, qty_return, value_return,
  qty_net, value_net, pct_qty, pct_value, reason_for_rejection). Index on
  `[period_year, period_month]`.
- `app/models/trans_sl_factory_upload.rb` — `STATUSES`, validations, `recent` scope,
  `period_label`, status predicates (`completed?`, `in_flight?`, …), `dependent: :delete_all`.
- `app/models/trans_sl_factory_transaction.rb` — `for_period(year, month)` scope.

### Parser
- `app/lib/trans_sl_factory_file_parser.rb` — zip/XML streaming parser (no Excel gem),
  reusing the Trans Sell Out parser approach. Public methods:
  - `read_period(path)` → `{ period_year:, period_month: }` from the in-file `PERIOD :`
    row (DD.MM.YYYY start date). Used by the controller `create`.
  - `each_batch(path, upload_id:, period_year:, period_month:)` → yields `insert_all`-ready
    hashes.
  - Locates the detail sheet by the `"Detail SL"` tab-name prefix, excluding the `(2)`
    brand-code variant; detects the header row dynamically; **column-type-aware casting**
    (DD.MM.YYYY dates → `Date`, measure columns → float, everything else string to
    preserve leading-zero SAP identifiers); XML entity unescaping (`F &amp; R` → `F & R`);
    skips the grand-total + repeated-header rows.

### Job
- `app/jobs/trans_sl_factory_import_job.rb` — own advisory-lock key, `pg_advisory_xact_lock`,
  deletes prior rows for the same period (→ `replaced_row_count`), `insert_all` in batches,
  aggregates `row_count` + `value_net_sum`, marks `completed`/`failed`, purges the file,
  destroys superseded upload records for the period. **No WebSocket broadcasts** (M2).

### Controller + routes
- `app/controllers/admin/trans_sl_factory/uploads_controller.rb` — `index` (Inertia, all
  rows serialized; no pagination yet), `preview` (JSON duplicate-detection from browser
  metadata: `will_replace` / `is_unchanged` / existing counts), `create` (multipart, reads
  period server-side via `read_period`, cancels prior pending uploads for the period,
  enqueues the job).
- `config/routes.rb` — `namespace :trans_sl_factory, path: "trans-sl-factory"` →
  `resources :uploads, only: %i[index create]` + `collection { post :preview }`.

### Frontend
- `app/frontend/lib/transSlFactoryPreviewParser.ts` — browser-side parser (fflate): reads
  the `PERIOD :` row, locates the detail sheet (prefix, excluding `(2)`), counts data rows
  and sums Value Net — **identical row-counting rules to the server** so `is_unchanged`
  stays consistent.
- `app/javascript/pages/admin/trans_sl_factory/Uploads.tsx` — upload zone (file + folder +
  drag/drop), worker preview → server preview, preview cards (new = period + rows + Value
  Net checked by default; duplicate = old-vs-new grid unchecked by default; unchanged →
  "Tidak ada perubahan terdeteksi"; error card), "Konfirmasi Import" disabled when nothing
  checked, multipart XHR upload, then a **static "Import Diproses" confirmation** with a
  "Muat ulang status" button (`router.reload`) — no WebSocket. Plain history table (desktop)
  + `DataCard` list (mobile): File / Periode / Baris / Total Value Net (IDR) / Status / Waktu.
- `app/frontend/components/AdminShell.tsx` — added a "Trans SL Factory" child (Gauge icon)
  to the "Data" sidebar group + extended `matchGroup`.

### Tests
- `test/lib/trans_sl_factory_file_parser_test.rb`, `test/models/*`, `test/jobs/*`,
  `test/controllers/admin/trans_sl_factory/uploads_controller_test.rb`, fixtures
  (`trans_sl_factory_uploads.yml`, `trans_sl_factory_transactions.yml`), and a synthetic-xlsx
  builder `test/support/sl_factory_fixture.rb` (caxlsx) that reproduces the real structure
  (preamble + PERIOD row + double header with grand-total between + interleaved stray
  header/total to exercise the skip logic + a `(2)` decoy sheet).
- **30 new tests, 73 assertions, all green.** Full `bin/rails test` suite passes; `npm run check` clean.

## Decisions made during implementation (not pre-specified)

1. **Dates stored as real `date` columns** (`date_so`, `date_invoice`), parsed from the
   file's DD.MM.YYYY strings (NULL when blank).
2. **Identifier columns stored as strings** (`sold_to_party`, `no_so`, `no_dn`, `no_invoice`,
   `code_material`) to preserve leading zeros — this required a **column-type-aware cast**
   (the reference parser auto-detects numerics by regex, which would corrupt these).
3. **Test fixtures use a tiny synthetic xlsx** generated in-test (caxlsx) rather than
   committing the real ~34k-row file. (Confirmed with the user via AskUserQuestion.)
4. **Period is keyed on year+month only** (a single national file per month); no
   distributor/region dimension as in Feature 7.
5. **`% QTY` / `% Value` stored on a 100-scale** (the detail sheet expresses them as `100`
   = 100%, unlike the pivot tabs which use fractions).
6. **Header detection picks the *first* matching header row**; the grand-total row, the
   repeated header row, and any stray in-data repeats are dropped uniformly per-row
   (blank `Shipping` ⇒ skip totals; `Shipping == "Shipping"` ⇒ skip header repeats).

## Deviations from the PRD

- **None material.** The PRD's described `PERIOD :` row does exist (`A="PERIOD :"`, with the
  date split across cells: `C="01.04.2026" E="TO" F="30.04.2026"`); `read_period` joins the
  row's cells and extracts the first DD.MM.YYYY start date. (An early inspection mistakenly
  read a pivot tab — the real detail sheet is the `"Detail SL April 2026"` tab, rId7, with a
  4-row preamble, header on row 5, a grand-total row, a repeated header on row 7, and data
  from row 8.)

## Verification performed

- Parser smoke + full-pipeline integration against the **real** `Data/sl-factory/Detail SL April 2026.xlsx`:
  period **2026-04**, **33,708 rows**, `value_net_sum` **65,813,483,193**, DB row count and
  sum match, leading zeros preserved (`"0090029469"`), DD.MM.YYYY parsed (`2026-04-07`).
- Replacement path: re-importing the same period sets `replaced_row_count` to the prior count,
  leaves exactly 33,708 rows (no duplication), and destroys the superseded upload record;
  identical re-upload satisfies the `is_unchanged` condition.
- `bin/rails test` (full suite) and `npm run check` both pass. Dev DB cleaned up afterward.
- **Not performed:** live browser screenshot/e2e — no browser-automation tooling or
  `agent-browser` skill was available in this environment. The page typechecks and reuses
  the proven Feature 7 page patterns 1:1.

## What the next milestone (M2 — WebSocket Progress & Cancel) needs to know

- Add `app/channels/trans_sl_factory_upload_channel.rb` mirroring
  `TransSelloutAccountUploadChannel` (auth on `upload.user == current_user`).
- Add `broadcast`/`broadcast_progress` calls inside `TransSlFactoryImportJob` (the job is
  structured to slot these in — status transitions and the batch loop are already in place;
  add the mid-import `upload.reload` + cancel check + `ActiveRecord::Rollback` like Feature 7).
- Add the `PATCH .../uploads/:id/cancel` route + controller action (`member { patch :cancel }`)
  and an `in_flight?`-gated `update!(status: "cancelled")`.
- Frontend: replace the static "Import Diproses" panel in `Uploads.tsx` with a live progress
  view subscribed to the channel (a `TrackedUpload` model + per-file "Batalkan" button +
  final "X berhasil, Y dibatalkan, Z gagal" summary) — port directly from the Feature 7 page,
  which still has the full WebSocket implementation to copy.

## What M3 (History List Management) needs to know

- `index` currently returns all rows unsorted-by-default (`recent`). M3 should add
  `PER_PAGE = 25`, year/month/status filters + filename search, a `period` composite sort,
  URL-reflected state, and the mobile filter/sort bottom sheets — all already implemented in
  the Feature 7 `UploadsController#index` + `Uploads.tsx` to copy from.
