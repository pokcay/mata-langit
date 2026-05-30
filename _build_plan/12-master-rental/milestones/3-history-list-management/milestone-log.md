# Feature 12 — Master Rental · Milestone 3: History List Management

**Date:** 2026-05-30
**Status:** Complete

Adds server-side pagination, filtering, filename search, and sortable columns to the
Master Rental upload-history table, with all state reflected in the URL and the mobile
filter/sort bottom-sheet treatment. Built as a near-verbatim port of the M3 history layer
proven in **Trans SL Factory** (Feature 11), with `total_cost` swapped in for
`value_net_sum`. The M2 live-update history subscription (`liveUploads` / `visibleUploads`)
was preserved unchanged — the paginated table renders off the same `visibleUploads` source.

## What was built

### Controller (`app/controllers/admin/master_rental/uploads_controller.rb`)
- `PER_PAGE = 25` and a `SORT_COLUMNS` map: `created_at`, `period` (composite
  year+month), `row_count`, `total_cost`, `status`. Unknown sort keys fall back to
  `created_at`; direction defaults to `DESC` unless `asc`.
- `index` rewritten from `recent`/serialize-all to:
  - `where` filters for `year`, `month`, `status` (each applied only when present)
  - case-insensitive filename search via `filename ILIKE ?` with
    `ActiveRecord::Base.sanitize_sql_like`
  - ordering (composite `period_year, period_month` for the `period` key, plain column
    otherwise) via `Arel.sql`
  - `total` count, `page` clamp (`>= 1`), `limit`/`offset` pagination
  - props now include `total`, `page`, `per_page`, `sort`, `direction`, `filters`
    (year/month/status/search via `.presence`) alongside `uploads` + `available_years`.

### Frontend (`app/javascript/pages/admin/master_rental/Uploads.tsx`)
- New imports: `ArrowDown` / `ArrowUp` / `ArrowUpDown`, `MobileFilterSheet`,
  `MobileFilterSortBar`, `MobileSortSheet` + `SortOption`, `useMobileFilterSort`, `Input`,
  `Select`.
- `SORT_OPTIONS` (10 entries; `total_cost` tertinggi/terendah replaces F11's Value Net) and
  the `MONTHS` label array.
- Page now destructures `total`, `page`, `per_page`, `sort`, `direction`, `filters` props
  (typed via a new `Filters` type).
- `searchValue` controlled state synced to `filters.search` on URL change.
- `navigate(overrides)` URL builder (preserves active filter/sort/page, strips defaults) +
  `handleSortColumn` (toggle asc/desc, reset to page 1 on column change).
- Desktop filter bar: Year / Month / Status `<Select>`s + filename search `<Input>`
  (submit/blur driven) + conditional "Reset filter" `<Button>`. Each filter resets to
  page 1.
- Desktop table headers swapped to a new `SortableHeader` component (active column shows
  up/down arrow; Periode / Baris / Total COST / Status / Waktu sortable; File static).
- Pagination summary ("Menampilkan X–Y dari Z upload") + Sebelumnya / Hal. p / N /
  Berikutnya controls, shown when `total > 0` / `totalPages > 1`.
- Mobile: `MobileFilterSortBar` trigger + `MobileFilterSheet` (Tahun / Bulan / Status /
  Cari filename) + `MobileSortSheet` (the shared `SORT_OPTIONS`), wired through
  `useMobileFilterSort`.
- Empty state distinguishes "Tidak ada upload yang cocok dengan filter." (when a filter is
  active) from "Belum ada upload.".

### Tests (`test/controllers/admin/master_rental/uploads_controller_test.rb`)
- Extended the existing index test to assert the new `per_page` / `page` / `sort` /
  `direction` props.
- Added five index tests: 25/page pagination (baseline fixtures + 30 → 25 + remainder),
  combined month+status filter, case-insensitive filename search, `total_cost` descending
  sort, and composite `period` ascending sort.

## Decisions made during implementation (not pre-specified)

1. **Total-cost sort labels** rendered as "Total COST tertinggi/terendah" to match the
   existing "Total COST" column header (F11 used "Value Net"); purely cosmetic.
2. **No new fixtures** — pagination/sort tests build rows inline with
   `MasterRentalUpload.create!` rather than adding YAML fixtures, keeping the four existing
   fixtures (`pending`, `completed`, `failed`, `cancelled`) intact for the other tests. The
   pagination test derives its expected total from `MasterRentalUpload.count` rather than
   hardcoding, so it stays correct if fixtures are added later.

## Deviations from the PRD

- None. All M3 "What gets built" items are present; nothing from the "does NOT include"
  list (saved presets, multi-column sort, page-size picker, uploaded_by filter) was added.

## Verification performed

- `ruby bin/rails test test/controllers/admin/master_rental/uploads_controller_test.rb` —
  **16 runs, 54 assertions, 0 failures, 0 errors**.
- `npm run check` — TypeScript clean (exit 0).
- Full `ruby bin/rails test` suite — **204 runs, 543 assertions, 0 failures, 0 errors**.
- **Not performed:** live browser e2e / screenshots. Per the user's choice for this
  milestone (tests + typecheck), matching the M1/M2 precedent — the page reuses the proven
  Feature 11 M3 history layer verbatim.

## Feature status

Feature 12 (Master Rental) is now complete across all three milestones: upload + preview +
import (M1), WebSocket progress + cancel (M2), and history list management (M3).
