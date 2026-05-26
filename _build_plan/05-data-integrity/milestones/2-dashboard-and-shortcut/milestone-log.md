# Milestone 2 — Dashboard + Shortcut: Log

**Completed:** 2026-05-25

## What was built

### New files

None — all work was modifications to existing files.

### Modified files (7)

| File | Change |
|------|--------|
| `app/controllers/admin/base_controller.rb` | Added `data_integrity_mismatch_count` to `inertia_share` — queries the latest completed `IntegrityCheck` and sums its `mismatched_count + missing_in_db_count` |
| `app/frontend/types/inertia.ts` | Added `data_integrity_mismatch_count?: number` to `SharedProps` |
| `app/frontend/components/AdminShell.tsx` | Reads `data_integrity_mismatch_count` from page props; passes it as `badge` on the "Data Integrity" child nav item (same pattern as Inbox unread badge) |
| `app/controllers/admin/data/integrity_checks_controller.rb` | Added `PER_PAGE`, `ALLOWED_TABS`, `SORT_COLUMNS` constants; replaced the M1 `show` stub (50-row limit, no filters) with full server-side tab filtering, search, year/month filtering, sortable columns, 25/page pagination, plus `total_abs_delta` computation for the Mismatched card |
| `app/javascript/pages/admin/data/IntegrityCheckDetail.tsx` | Full rewrite of the completed-check section: tab strip (Mismatched / Missing in DB / Extra in DB / Matched / All), filter bar (region search + year/month dropdowns), sortable table headers with ▲/▼ icons, IDR currency formatting on all monetary values, "Upload ulang Timeseries" deeplink button on every actionable row, pagination, URL-reflected state via `router.get(…, { replace: true })`, per-tab empty states |
| `app/controllers/admin/timeseries/uploads_controller.rb` | Passes two new props: `integrity_return_to` (sanitized to relative paths only) and `integrity_outcome` from query params |
| `app/javascript/pages/admin/timeseries/Uploads.tsx` | Accepts `integrity_return_to` and `integrity_outcome` props; renders an amber `IntegrityBanner` component at the top when `integrity_return_to` is present, with different copy for `extra_in_db` vs other outcomes, and a "← Kembali ke Data Integrity" link |

## Key decisions made during implementation

1. **Period sort is a special case** — `ORDER BY period_year DESC, period_month DESC` can't be expressed as a single column expression with a shared direction, so the controller handles `sort_key == "period"` separately. `SORT_COLUMNS["period"]` is set to `nil` as a sentinel.

2. **`total_abs_delta` is computed across all mismatched rows, not the visible page** — the Mismatched summary card shows the aggregate delta for the entire check, not just the current filtered/paginated view. Computed via `base.where(outcome: "mismatched").sum(Arel.sql("ABS(COALESCE(delta, 0))"))`.

3. **`available_years` / `available_months` are scoped to this check only** — derived from `check.integrity_check_results.distinct.pluck(...)` to avoid showing orphan options that don't apply to the current check.

4. **`return_to` is sanitized server-side** — the Timeseries controller validates that `return_to` starts with `/` and does not start with `//` or contain `://`, so no open-redirect vulnerability.

5. **Filter state reset on tab change** — changing tabs clears search, year, and month filters and resets to page 1, avoiding confusing "no results" states from cross-tab filter bleed.

6. **"Upload ulang Timeseries" is a plain `<a>` link** — since the Timeseries page is a full Inertia page (not a modal), a regular anchor is simpler and correct. The `return_to` + `integrity_outcome` params are URL-encoded in the href.

7. **IDR formatting replaces the M1 generic number formatter** — switched from `Intl.NumberFormat` with `maximumFractionDigits: 2` to `style: "currency", currency: "IDR"` everywhere on the detail page. The Timeseries page retains its own formatter.

## What the next milestone will need to know

- **M3 needs to add a history table on the index page** (`/admin/data/integrity`) — currently `index` just renders the upload zone. M3 replaces / expands this with a paginated list of all past checks.
- **M3 adds the "Jalankan ulang check" button** — on the detail page, when `status == "completed"`. The button will appear below the metadata strip; the enqueue logic and `IntegrityCheckRerunJob` are M3 work.
- **M3 adds the "Resolved" tag** — `IntegrityCheckResult#resolved_at` is already in the schema but never set; M3 re-run logic sets it. The detail table should dim resolved rows and show a "Resolved" badge.
- **M3 adds `last_rerun_at` strip** — a small history line below the metadata strip on the detail page: "Diperiksa pertama kali: {checked_at}. Terakhir di-rerun: {last_rerun_at}."
- **The sidebar badge (M2) automatically reflects re-run results** because it always queries the latest completed check live on every request — no extra work needed in M3.

## Deviations from the PRD

None. All M2 scope was implemented as specified.
