# Milestone 3 Log — List Management

**Completed:** 2026-05-24

---

## What was built

### Files modified

**`app/controllers/admin/timeseries/uploads_controller.rb`**
- Added `PER_PAGE = 25` constant
- Added `SORT_COLUMNS` hash mapping URL-safe sort key names to SQL column expressions; the
  `"period"` key maps to the sentinel `:period` symbol so the controller can special-case it
  as a two-column sort (`period_year, period_month`)
- Rewrote `index` to: apply five optional filter params (`region`, `year`, `month`, `status`,
  `search` via `ILIKE`), apply a whitelisted sort, count the total before paginating, then
  `LIMIT / OFFSET` by `PER_PAGE`
- Returns eight new props: `total`, `page`, `per_page`, `sort`, `direction`, `filters`,
  `available_regions` (distinct regions from the full table), `available_years` (distinct
  years, newest first)
- `sanitize_sql_like` used on the search term to escape `%` and `_` metacharacters

**`app/javascript/pages/admin/timeseries/Uploads.tsx`**
- Added imports: `Input`, `Select` (from design system), `ArrowUp`, `ArrowDown`, `ArrowUpDown`
  (from lucide-react)
- Added `Filters` type
- Extended component props to include the eight new controller props
- Added `searchValue` local state (initialised from `filters.search`) and a `useEffect` that
  syncs it when `filters.search` changes (browser back/forward support)
- Added `navigate()` helper: rebuilds the full set of URL query params from current state,
  applies caller-supplied overrides (passing `null` removes a param), and calls `router.get()`
- Added `handleSortColumn()` helper: toggles direction when the same column is clicked again,
  resets to `"asc"` for a new column
- Added `hasActiveFilter` and `totalPages` computed values
- Added filter bar above the uploads table: four `<Select>` dropdowns (Region, Year, Month,
  Status) + a `<form>` with an `<Input>` for filename search (navigates on submit/blur) + a
  "Reset filter" `<Button variant="ghost">` that appears only when any filter is active
- Replaced static `<th>` elements in the table header with `<SortableHeader>` components for
  the six sortable columns; the "File" column remains a plain non-sortable header
- Added summary + pagination section below the table: "Menampilkan X–Y dari Z upload" text
  and Previous / Next (`Sebelumnya` / `Berikutnya`) buttons, shown only when `totalPages > 1`
- Updated the empty-state message: shows "Tidak ada upload yang cocok dengan filter." when
  filters are active, "Belum ada upload." otherwise
- Added `SortableHeader` sub-component: renders a `<th>` that triggers `onSort` on click,
  shows `ArrowUp` / `ArrowDown` for the active column or a faint `ArrowUpDown` for inactive

**`test/controllers/admin/timeseries/uploads_controller_test.rb`**
- Added `inertia_props` private helper (Nokogiri HTML parse + `data-page` attribute extraction)
  to avoid needing a matching `X-Inertia-Version` header in tests
- Added six new test cases: filter by status, filter by region, search by filename substring,
  sort ascending by region (assert array is sorted), pagination metadata keys and `per_page`
  value, invalid sort column falls back to `"created_at"`

---

## Decisions made during implementation

- **`onBlur` navigates the search input.** The search field navigates when the input loses
  focus (in addition to Enter/submit), matching common admin-tool UX without adding a
  debounce or a separate "Search" button.

- **`available_regions` and `available_years` query the full unfiltered table.** If they were
  derived from the filtered scope, a region-filter selection would make other region options
  disappear. Querying the full table keeps all dropdown options visible at all times.

- **`router.reload({ only: ["uploads"] })` calls are unchanged.** The existing calls in
  `handleConfirmImport` and `handleUploadAgain` reload from the current URL, so they inherit
  whatever filters/sort/page are currently in the URL. This is acceptable behaviour (PRD does
  not specify what the list state should be after an upload completes).

- **`inertia_props` Nokogiri helper in tests.** The Inertia gem returns 409 when the
  `X-Inertia-Version` header doesn't match `ViteRuby.digest`. Rather than stub the digest or
  include a full Inertia version header, we parse the JSON props from the HTML `data-page`
  attribute on the `<div id="app">` element — the same data the client hydrates from.

- **`Arel.sql` for sort expressions.** The sort column SQL is assembled from a closed whitelist
  (`SORT_COLUMNS`), so `Arel.sql` is safe here. Using `Arel.sql` avoids the `Dangerous query
  method` deprecation warning Rails emits for raw string ordering.

---

## Deviations from the PRD

None. All "Done when" criteria are met:

1. Upload history is paginated server-side, 25 records per page ✓
2. "Menampilkan X–Y dari Z upload" summary text shown ✓
3. Filter dropdowns for Region, Year, Month, Status; text search for filename ✓
4. "Reset filter" button appears when any filter is active and clears all filters on click ✓
5. Sortable column headers show directional arrow for active column ✓
6. Sortable columns: Uploaded at (`created_at`), Region, Period, Row count, Netto Wise,
   Status ✓
7. All state (filters, search, sort column, sort direction, page) reflected in URL ✓
8. Applying a filter or search resets page to 1 ✓
