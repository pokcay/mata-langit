# Milestone Log — Master Product Dist, Milestone 3

Date: 2026-05-26

## What was built

### Controller (`app/controllers/admin/master_product_dist/uploads_controller.rb`)
- Added `PER_PAGE = 25` constant
- Added `SORT_COLUMNS` hash mapping 5 sort keys to qualified column names:
  `created_at`, `distributor_name`, `region`, `row_count`, `status`
- Rewrote `index` action:
  - Filter: `region` (exact match), `status` (exact match), `search` (filename ILIKE with `sanitize_sql_like`)
  - Sort: validated against `SORT_COLUMNS`, default `created_at DESC`
  - Pagination: `total` count, `page` clamped to ≥1, `limit(25).offset(…)`
  - `available_regions` from `distinct.pluck(:region).compact.sort`
  - Inertia props: `uploads`, `total`, `page`, `per_page`, `sort`, `direction`, `filters`, `available_regions`

### Frontend (`app/javascript/pages/admin/master_product_dist/Uploads.tsx`)
- New imports: `ArrowDown`, `ArrowUp`, `ArrowUpDown` (lucide-react), `Input`, `Select` (design system)
- New `Filters` type: `{ region: string | null; status: string | null; search: string | null }` — no year/month (not time-series data)
- Expanded component props: `total`, `page`, `per_page`, `sort`, `direction`, `filters`, `available_regions`
- New state: `searchValue` + sync effect (mirrors URL on browser back/forward)
- New `navigate(overrides)` function: builds URL params from current filter/sort/page state + overrides, calls `router.get`
- New `handleSortColumn(col)`: toggles asc/desc on same column, sets new column at `asc`
- New computed: `hasActiveFilter`, `totalPages`
- Filter bar added above table: Region `<Select>`, Status `<Select>`, filename `<Input>` (submit on blur + Enter), "Reset filter" ghost button
- Replaced static `<th>` elements with `<SortableHeader>` for 5 sortable columns: Distributor, Region, Baris, Status, Waktu (File column stays plain)
- Added pagination summary + Sebelumnya/Hal N/M/Berikutnya controls below table
- Empty state now differentiates: "Tidak ada upload yang cocok dengan filter." vs. "Belum ada upload."
- New `SortableHeader` sub-component (same shape as Timeseries Uploads version)

## Decisions made during implementation

1. **File column not sortable**: The `filename` column is not in the PRD's sort column list ("Uploaded at, Distributor, Region, Row Count, Status"), so it remains a plain header — consistent with Timeseries where File is also not sortable.

2. **No bulk delete / per-row delete**: Both are out of scope per PRD. `UploadTableRow` is unchanged from M2.

3. **`available_regions` uses `.compact`**: The `region` column can be null for records where the parser failed to extract a region. Compact drops nulls before sorting so the dropdown only shows real values.

## Deviations from PRD

None. All M3 scope delivered as specified.

## What next milestone needs to know

This feature has no Milestone 4 — M3 is the final milestone for Master Product Dist. The feature is complete.
