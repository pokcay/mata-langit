# Milestone 3 Log — History Table Refinements

**Date completed:** 2026-05-26

---

## What was built

### Controller changes (`app/controllers/admin/market_share_b2b/uploads_controller.rb`)

- Added `PER_PAGE = 25` constant
- Added `SORT_COLUMNS` hash mapping 6 URL param names to SQL column expressions:
  - `account_code` → `market_share_b2b_uploads.account_code`
  - `period` → `:period` (special compound sort)
  - `report_type` → `market_share_b2b_uploads.report_type`
  - `row_count` → `market_share_b2b_uploads.row_count`
  - `status` → `market_share_b2b_uploads.status`
  - `created_at` → `market_share_b2b_uploads.created_at` (default)
- Rewrote `index` action to:
  - Filter scope by: `account_code` (exact), `report_type` (exact), `period_year_from` (year param), `period_month_from` (month param), `status` (exact), filename `ILIKE` (search param)
  - Validate sort key against `SORT_COLUMNS`; default to `created_at DESC`
  - Compound sort for `period`: `period_year_from {dir}, period_month_from {dir}`
  - Count total before pagination; apply `LIMIT 25 OFFSET`
  - Pluck distinct `available_account_codes`, `available_report_types`, `available_years` (from `period_year_from`) for filter dropdowns
  - Pass `uploads`, `total`, `page`, `per_page`, `sort`, `direction`, `filters`, `available_account_codes`, `available_report_types`, `available_years` as Inertia props

### React page changes (`app/javascript/pages/admin/market_share_b2b/Uploads.tsx`)

- Added `Filters` type with fields: `account_code`, `report_type`, `year`, `month`, `status`, `search`
- Moved `MONTHS_ID` constant to top level as `MONTHS_LABEL` (shared by filter bar and `buildPeriodLabel`)
- Added `ArrowDown`, `ArrowUp`, `ArrowUpDown` imports from lucide-react
- Added `Input`, `Select` imports from `@/components/ui`
- Expanded component props signature to include all new server props
- Added `searchValue` state synced to `filters.search` via `useEffect` (handles browser back/forward)
- Added `hasActiveFilter` and `totalPages` computed values
- Added `navigate()` helper: merges current filter/sort/page state with overrides, calls `router.get("/admin/market-share-b2b/uploads", ...)`
- Added `handleSortColumn()`: toggles direction on same column, defaults to asc on new column
- Added filter bar above the history table: account code select, report type select, year select, month select, status select, filename search input, "Reset filter" button
- Replaced all static `<th>` elements with `SortableHeader` component (6 sortable columns: Account, Tipe, Periode, Baris, Status, Waktu)
- Updated empty-state message to be filter-aware ("Tidak ada upload yang cocok dengan filter." vs "Belum ada upload.")
- Added pagination controls + "Menampilkan X–Y dari Z upload" summary below table
- Added `SortableHeader` sub-component (identical pattern to Trans Sellout Account)

---

## Decisions made during implementation

### Period filter on `period_year_from` / `period_month_from`
User confirmed: filter behavior should match all other features (simple equality on the start of the period range). IDG multi-month uploads (e.g. Jan–Apr 2026) appear when filtering by year=2026 and month=1, but not when filtering by month=2, 3, or 4.

### `available_report_types` from DB
Rather than hardcoding `["reguler", "skincare"]`, distinct report type values are plucked from the DB. This future-proofs against new templates with different report type strings without requiring a code change.

### No new route changes
All filter/sort/pagination state lives in query params on the existing `GET /admin/market-share-b2b/uploads` route.

---

## Verified against "Done when" criteria

- Admin can filter by account (IDG/IDM/MIDI/SAT): ✅ account_code select + `WHERE account_code = ?`
- Admin can filter by period year and month: ✅ year/month selects + `WHERE period_year_from = ?` / `WHERE period_month_from = ?`
- Admin can filter by status: ✅ status select
- Admin can filter by report type: ✅ report_type select with dynamic options from DB
- Admin can search by filename: ✅ ILIKE substring search
- Admin can sort by any of 6 columns: ✅ SortableHeader + SORT_COLUMNS dispatch
- Admin can paste a URL that reproduces the exact filtered view: ✅ all state in query params via `navigate()`
- Pagination at 25 per page with prev/next controls: ✅

Full test suite: 73 runs, 191 assertions, 0 failures, 0 errors, 0 skips.
