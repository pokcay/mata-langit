# Milestone 1 — Foundation: Log

**Completed:** 2026-05-25

## What was built

### New files (13)

| File | Purpose |
|------|---------|
| `db/migrate/20260525100001_create_integrity_checks.rb` | Creates `integrity_checks` table |
| `db/migrate/20260525100002_create_integrity_check_results.rb` | Creates `integrity_check_results` table with composite unique index |
| `app/models/integrity_check.rb` | `IntegrityCheck` model — has_one_attached :file, belongs_to :user, has_many :integrity_check_results |
| `app/models/integrity_check_result.rb` | `IntegrityCheckResult` model — outcome enum, belongs_to :integrity_check |
| `app/lib/integrity_sot_parser.rb` | Parses SoT .xlsx files (Region/Year/Month/Netto_Wise columns) using same ZIP+string-scan technique as TimeseriesFileParser |
| `app/jobs/integrity_check_job.rb` | Background job — downloads SoT file, compares against DB, writes IntegrityCheckResult rows, broadcasts progress via ActionCable |
| `app/channels/integrity_check_channel.rb` | ActionCable channel — streams progress/status updates for a specific IntegrityCheck |
| `app/controllers/admin/data/integrity_checks_controller.rb` | Controller — index, create (raw fetch), show, cancel (raw fetch) |
| `app/frontend/lib/sotPreviewParser.ts` | Browser-side SoT xlsx parser using fflate; returns totalRows, period range, distinct regions, preview rows, malformed rows |
| `app/javascript/pages/admin/data/IntegrityChecks.tsx` | Upload page — drag-and-drop zone, browser preview panel, upload + WebSocket progress, Batalkan button |
| `app/javascript/pages/admin/data/IntegrityCheckDetail.tsx` | Result detail page — 4 count cards, metadata strip, first 50 results by ABS(delta) DESC; handles pending/processing state via WebSocket |

### Modified files (3)

| File | Change |
|------|--------|
| `config/routes.rb` | Added `namespace :data` inside `namespace :admin` with `resources :integrity_checks, path: "integrity"` |
| `app/frontend/components/MainNav.tsx` | Added `NavGroupDef` type and `NavGroup` component; `NavEntry = NavItemDef \| NavGroupDef` union; sidebar group collapses/expands with localStorage persistence; collapsed-rail clicking group icon expands sidebar |
| `app/frontend/components/AdminShell.tsx` | Replaced flat "Timeseries" nav item with a "Data" group (`Database` icon) containing Timeseries and Data Integrity children |

## Key decisions made during implementation

1. **Browser-side SoT preview is purely client-side** — unlike the Timeseries feature which does a server round-trip to check for duplicates, the SoT preview is computed entirely in the browser (no `/preview` endpoint needed). The file is only sent to the server when the admin clicks "Mulai Check".

2. **Missing-in-DB detection uses COUNT, not SUM=0** — querying `COUNT(*)` first avoids the false-match case where all transactions sum to exactly 0; a non-zero count with zero sum is correctly flagged as `mismatched`, not `missing_in_db`.

3. **`NavGroupDef` uses `type: "group"` discriminant** — distinguishing groups from items via `'type' in item && item.type === "group"` keeps the type check readable without needing a wrapper or separate arrays.

4. **Auto-expand group on child navigation** — `NavGroup` watches `currentUrl` and auto-expands when a child route becomes active, so navigating directly to `/admin/data/integrity` expands the "Data" group even if it was collapsed.

5. **Cancellation rolls back inside a transaction** — `raise ActiveRecord::Rollback` inside the job's transaction discards all partial `IntegrityCheckResult` rows atomically; cancelled checks have zero results preserved.

6. **Extra-in-DB uses a period range query** — tuples in `timeseries_transactions` are considered "in scope" if their (period_year, period_month) falls within the min–max period range of the SoT file. This avoids flagging distant historical data that the SoT simply doesn't cover.

## What the next milestone will need to know

- **M2 needs to expand the detail page** — the current `IntegrityCheckDetail` shows only the first 50 results with no filters, tabs, or IDR formatting. M2 replaces this with the full paginated/filterable/sortable dashboard.
- **M2 adds sidebar badge** — `Admin::BaseController#inertia_share` will need to add `data_integrity_mismatch_count` (mismatched + missing_in_db from the latest completed check). The badge goes on the "Data Integrity" child item inside the "Data" group.
- **M2 adds re-upload shortcut** — each actionable result row gets an "Upload ulang Timeseries" button deeplinked to `/admin/timeseries/uploads?region=X&year=Y&month=Z&return_to=...`.
- **The `Admin::Data::IntegrityChecksController#show` action** currently orders by `ABS(COALESCE(delta, 0)) DESC NULLS LAST`. M2 will replace this with full server-side sorting/filtering/pagination.
- **`NavGroupDef` badge support** — M2 may want to add a `badge?` field to `NavGroupDef` (or `NavItemDef` children) to display the unresolved mismatch count. Currently `NavItemDef` already supports `badge`; the sidebar badge in M2 would go on the "Data Integrity" child item.

## Deviations from the PRD

None. All M1 scope was implemented as specified.
