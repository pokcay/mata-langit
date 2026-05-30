# Feature 11 — Trans SL Factory · Milestone 3: History List Management

**Date:** 2026-05-30
**Status:** Complete — **Feature 11 complete.**

Adds server-side pagination, Year/Month/Status filters + filename search, sortable
column headers, URL-reflected state, and the mobile filter/sort bottom-sheet treatment
to the upload history table. Built as a near-mechanical port of the proven **Trans Sell
Out Account** (Feature 7) Milestone 3 implementation, adapted to TransSlFactory's simpler
data model (**period year+month only — no distributor dimension**; `value_net_sum` in
place of `netto_wise_sum`), exactly as the M1 and M2 logs prescribed.

## What was built

### Controller (`app/controllers/admin/trans_sl_factory/uploads_controller.rb`)
- Rewrote **only** `index`; `preview` / `create` / `cancel` / `serialize` / `validate_file!`
  untouched.
- Added `PER_PAGE = 25` and a `SORT_COLUMNS` map: `created_at`, `period` (composite),
  `row_count`, `value_net_sum`, `status` (all prefixed `trans_sl_factory_uploads.`).
- Filters: `year` → `period_year`, `month` → `period_month`, `status`, and `search` →
  `filename ILIKE` with `ActiveRecord::Base.sanitize_sql_like`.
- Sort: `params[:sort]` validated against `SORT_COLUMNS` (fallback `created_at`);
  `direction` asc/desc (default DESC); `:period` expands to
  `period_year <dir>, period_month <dir>` via `Arel.sql`.
- Pagination: `total = scope.count`, `page` clamped ≥ 1, `limit/offset`.
- `available_years = TransSlFactoryUpload.distinct.pluck(:period_year).compact.sort.reverse`.
- Props: `uploads`, `total`, `page`, `per_page`, `sort`, `direction` (downcased),
  `filters` (year/month/status/search via `.presence`), `available_years`. **No
  `available_distributor_codes`** (no distributor dimension in this feature).

### Frontend (`app/javascript/pages/admin/trans_sl_factory/Uploads.tsx`)
- Extended the page props with `total`, `page`, `per_page`, `sort`, `direction`,
  `filters`, `available_years`; the existing upload/preview/WebSocket-progress/cancel
  logic from M1/M2 is unchanged.
- `SORT_OPTIONS` (no Account): Tanggal terbaru/terlama, Periode terbaru/terlama, Baris
  terbanyak/sedikit, Value Net tertinggi/terendah, Status A–Z/Z–A.
- `navigate(overrides)` URL helper + `handleSortColumn(col)` toggle; `searchValue` state
  synced to `filters.search` for browser back/forward.
- Desktop filter bar: Year / Month / Status `<Select>`s + filename `<Input>` search
  (submit-on-enter + on-blur) + "Reset filter" (shown only when a filter is active).
- New `<SortableHeader>` (ArrowUp/ArrowDown/ArrowUpDown) on Periode, Baris (right), Total
  Value Net (right), Status, Waktu. The **File** column is intentionally not sortable
  (matches the PRD's listed sortable set: Uploaded at / Period / Row count / Total Value
  Net / Status).
- "Menampilkan X–Y dari Z upload" summary + Sebelumnya/Berikutnya + "Hal. p / totalPages".
- Mobile: `MobileFilterSortBar` + `MobileFilterSheet` (Year/Month/Status/search) +
  `MobileSortSheet`, wired through
  `useMobileFilterSort(filters, navigate, ["year","month","status","search"])`.
- Empty-state text honors `hasActiveFilter`.
- The existing `liveUploads`/`visibleUploads` live-update machinery keeps working — it
  re-syncs off the `uploads` prop on every paginated navigation (per the M2 log note).

### Tests (`test/controllers/admin/trans_sl_factory/uploads_controller_test.rb`)
Added seven index tests mirroring the Timeseries controller test: filters by status / year
/ month, searches by filename substring, sorts ascending by period (asserts ordering),
returns pagination metadata (`per_page == 25` + `available_years` includes 2026), and
rejects an injected sort column (falls back to `created_at`). No new fixtures were needed —
the existing four rows (pending/completed/failed/cancelled across months 1/2/3/5 of 2026)
already exercise every filter and the period sort.

- **Targeted: 17 runs, 53 assertions, 0 failures.** Full suite: **159 runs, 414
  assertions, 0 failures, 0 errors, 0 skips.** `npm run check` clean.

## Decisions made during implementation (not pre-specified)

1. **No new fixtures.** The existing four upload fixtures span four distinct months and
   four distinct statuses, which is enough to make every filter/sort assertion meaningful;
   adding rows would only risk perturbing the M1/M2 tests that assert on the `completed`
   fixture's serialized shape.
2. **File column left unsortable.** The PRD enumerates the sortable columns (Uploaded at,
   Period, Row count, Total Value Net, Status) and File is not among them — consistent with
   Feature 7, where filename is also not a sort key.
3. **`available_years` is derived from all uploads**, not the filtered scope, so the year
   dropdown never collapses to a single option after a year is selected (matches Feature 7).

## Deviations from the PRD

- **None.** All M3 "What gets built" items are present; all four M3 exclusions
  (saved/preset filters, multi-column sort, variable page-size picker, filter-by-uploaded_by)
  are respected.

## Verification performed

- `ruby bin/rails test` — full suite green (incl. the SSR smoke test and all M1/M2 tests).
- `npm run check` — TypeScript clean.
- The Windows `Tempfile::Remover` "Permission denied" lines printed during the run are
  pre-existing temp-xlsx cleanup warnings from the parser/job tests on Windows, not
  failures — the summary line reports 0 failures / 0 errors.
- **Not performed: live browser/e2e.** No browser-automation tooling (Playwright /
  agent-browser MCP) is available in this environment — consistent with M1 and M2. The
  page typechecks and is a line-for-line port of the proven Feature 7 history-list UI,
  which is already verified in production use.

## Feature status

Feature 11 (Trans SL Factory) is now **complete** across all three milestones: upload +
preview + import (M1), WebSocket progress + cancel with rollback (M2), and history list
management (M3).
