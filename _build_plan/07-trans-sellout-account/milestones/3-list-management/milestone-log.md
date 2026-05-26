# Milestone 3 — History List Management: Milestone Log

## What was built

### Files modified (no new files created)

**`app/controllers/admin/trans_sellout_account/uploads_controller.rb`**
- Added `PER_PAGE = 25` constant
- Added `SORT_COLUMNS` hash mapping URL param keys to qualified SQL column names; `:period` is a sentinel for dual-column year+month sort
- Rewrote `index` action:
  - Filters by `distributor_code`, `period_year` (via `year`), `period_month` (via `month`), `status`, and filename `ILIKE` search using `sanitize_sql_like`
  - Sorts via `Arel.sql` with whitelisted columns; period sorts by year+month together
  - Paginates with `limit/offset`; counts the unsliced scope for the total
  - Returns new props: `total`, `page`, `per_page`, `sort`, `direction`, `filters`

**`app/javascript/pages/admin/trans_sellout_account/Uploads.tsx`**
- Added imports: `ArrowDown`, `ArrowUp`, `ArrowUpDown` (lucide-react); `Input`, `Select` (`@/components/ui/`)
- Added `Filters` type and `MONTHS` constant
- Expanded page props to accept `total`, `page`, `per_page`, `sort`, `direction`, `filters`, `available_distributor_codes`, `available_years`
- Added `searchValue` local state with effect to sync from URL on back/forward navigation
- Added `navigate()` helper: merges current filter/sort/page state with overrides and calls `router.get`
- Added `handleSortColumn()`: toggles direction on same column, resets to `asc` on new column
- Added `hasActiveFilter` and `totalPages` derived values
- Added filter bar above history table: Distributor Code, Year, Month, Status dropdowns + filename search input + "Reset filter" button (shown when any filter is active)
- Replaced plain `<th>` elements with `SortableHeader` sub-component for: distributor_code, period, row_count, netto_wise_sum, status, created_at
- Added pagination controls below the table: "Menampilkan X–Y dari Z upload" summary + Sebelumnya/Berikutnya buttons
- Updated empty-state message to distinguish between no data and no filter match
- Added `SortableHeader` sub-component (self-contained in the file)

## Decisions not pre-specified in the PRD

- **No bulk delete** — explicitly out of scope per PRD; not added.
- **`MONTHS` constant defined inline** in the TSA file (not shared) — avoids a new shared utility for a one-liner array.
- The `navigate` function preserves `sort` and `direction` in the URL only when they differ from defaults (`created_at` / `desc`), keeping clean URLs for the common case.

## What the next milestone needs to know

There is no Milestone 4 defined in the PRD for this feature — Milestone 3 is the final milestone. The feature is complete as specified.

## Deviations from the PRD

None. All "Done when" criteria from Milestone 3 are satisfied:
- ✅ History table is paginated server-side at 25 records/page
- ✅ Filter bar: Distributor Code, Year, Month, Status dropdowns + filename search
- ✅ "Reset filter" button clears all active filters
- ✅ Sortable columns: Waktu, Distributor, Periode, Baris, Netto Wise, Status
- ✅ All filters, search, sort, direction, and page are reflected in the URL
- ✅ Applying any filter/search resets to page 1 (via `page: null` in navigate overrides)
