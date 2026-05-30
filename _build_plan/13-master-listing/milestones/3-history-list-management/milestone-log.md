# Feature 13 — Master Listing · Milestone 3: History List Management

**Date:** 2026-05-30
**Status:** Complete

Adds server-side pagination, filtering, filename search, and sortable columns to the
Master Listing upload-history table, with all state reflected in the URL and the mobile
filter/sort bottom-sheet treatment. Built as a near-verbatim port of the M3 history layer
just shipped in **Master Rental** (Feature 12) — the two features' controllers, fixtures,
and pages are near-identical, so Master Listing's M2 page was literally Master Rental's
page *minus* the M3 additions. The M2 live-update history subscription
(`liveUploads` / `visibleUploads`) was preserved unchanged — the paginated table renders
off the same `visibleUploads` source.

## What was built

### Controller (`app/controllers/admin/master_listing/uploads_controller.rb`)
- Added `PER_PAGE = 25` and a `SORT_COLUMNS` map: `created_at`, `period` (composite
  year+month), `row_count`, `total_cost`, `status`. Unknown sort keys fall back to
  `created_at`; direction defaults to `DESC` unless `asc`.
- `index` rewritten from `recent.limit(100)`/serialize-all to:
  - `where` filters for `year`, `month`, `status` (each applied only when present)
  - case-insensitive filename search via `filename ILIKE ?` with
    `ActiveRecord::Base.sanitize_sql_like`
  - ordering (composite `period_year, period_month` for the `period` key, plain column
    otherwise) via `Arel.sql`
  - `total` count, `page` clamp (`>= 1`), `limit`/`offset` pagination
  - props now include `total`, `page`, `per_page`, `sort`, `direction`, `filters`
    (year/month/status/search via `.presence`) and `available_years`, alongside `uploads`.
- The `preview`, `create`, `cancel`, and `serialize` methods are unchanged.

### Frontend (`app/javascript/pages/admin/master_listing/Uploads.tsx`)
- New imports: `ArrowDown` / `ArrowUp` / `ArrowUpDown`, `MobileFilterSheet`,
  `MobileFilterSortBar`, `MobileSortSheet` + `SortOption`, `useMobileFilterSort`, `Input`,
  `Select`.
- `SORT_OPTIONS` (10 entries; Total COST tertinggi/terendah) and the `MONTHS` label array.
- Page now destructures `total`, `page`, `per_page`, `sort`, `direction`, `filters`,
  `available_years` props (typed via a new `Filters` type).
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

### Tests (`test/controllers/admin/master_listing/uploads_controller_test.rb`)
- Extended the existing index test to assert the new `available_years` / `per_page` /
  `page` / `sort` / `direction` props.
- Added five index tests: 25/page pagination (baseline fixtures + 30 → 25 + remainder),
  combined month+status filter, case-insensitive filename search (`mar` → the MAR file),
  `total_cost` descending sort, and composite `period` ascending sort.

## Decisions made during implementation (not pre-specified)

1. **No new fixtures** — pagination/sort tests build rows inline with
   `MasterListingUpload.create!` rather than adding YAML fixtures, keeping the four existing
   fixtures (`pending` JAN / `completed` FEB / `failed` MAR / `cancelled` MAY) intact for
   the other tests. The pagination test derives its expected total from
   `MasterListingUpload.count` so it stays correct if fixtures are added later.
2. **Routes unchanged** — `config/routes.rb` already exposed `index` for the
   `master_listing` namespace from M1; M3 only changed the action body, so no routing
   change was needed.

## Deviations from the PRD

- None. All M3 "What gets built" items are present; nothing from the "does NOT include"
  list (saved presets, multi-column sort, page-size picker, uploaded_by filter) was added.

## Verification performed

- `ruby bin/rails test test/controllers/admin/master_listing/uploads_controller_test.rb` —
  **16 runs, 54 assertions, 0 failures, 0 errors**.
- `npm run check` — TypeScript clean (exit 0).
- Full `ruby bin/rails test` suite — **249 runs, 672 assertions, 0 failures, 0 errors**
  (up from M2's 244 — the five new index tests).
- **Not performed:** live browser e2e / screenshots. Per the user's choice for this
  milestone (tests + typecheck), matching the M1/M2 precedent and the proven Feature 12 M3
  history layer reused near-verbatim here.

## Feature status

Feature 13 (Master Listing) is now complete across all three milestones: upload + preview +
import (M1), WebSocket progress + cancel (M2), and history list management (M3).
