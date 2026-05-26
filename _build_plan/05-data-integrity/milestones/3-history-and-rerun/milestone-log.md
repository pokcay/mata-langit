# Milestone 3 — History + Manual Re-run: Log

**Completed:** 2026-05-25

## What was built

### New files (1)

| File | Purpose |
|------|---------|
| `app/jobs/integrity_check_rerun_job.rb` | Re-runs the integrity comparison against the current DB using the originally attached SoT file. Snapshots previous outcomes/resolved_at before delete_all, recreates IntegrityCheckResult rows with resolved_at logic, updates last_rerun_at, broadcasts progress via ActionCable. Supports cancellation identically to IntegrityCheckJob. |

### Modified files (4)

| File | Change |
|------|--------|
| `config/routes.rb` | Added `patch :rerun` as a member action on `integrity_checks` |
| `app/controllers/admin/data/integrity_checks_controller.rb` | Expanded `index` with full history table props (paginated checks, latest_check callout, filter/sort with `HISTORY_SORT_COLUMNS`/`HISTORY_STATUSES`); added `rerun` action (raw fetch PATCH — validates completed status + no in-flight checks + file attached, enqueues job); added `serialize_check_summary` for the history table; updated `serialize_check` to include `last_rerun_at`; updated `serialize_result` to include `resolved_at` |
| `app/javascript/pages/admin/data/IntegrityChecks.tsx` | Major expansion: accepts server-side props (`latest_check`, `checks`, pagination, filters, sort); renders "Latest check" callout card with mini count grid; renders paginated/filterable/sortable history table (columns: Filename · Periode · Diupload oleh · Diperiksa · Status · Matched · Mismatched · Missing DB · Extra DB · Total); upload zone and in-progress view preserved at top; history navigation uses `preserveState: true` to avoid resetting upload state mid-browse |
| `app/javascript/pages/admin/data/IntegrityCheckDetail.tsx` | Added "Jalankan ulang check" button (visible only when `status === "completed"`, optimistically sets local status to "processing" after successful PATCH to trigger WebSocket re-subscription); updated metadata strip to show "Terakhir di-rerun" timestamp; added "Resolved" badge + opacity dimming on result rows where `resolved_at` is set; updated `CheckProps` type to include `last_rerun_at`; updated `ResultRow` type to include `resolved_at` |

## Key decisions made during implementation

1. **Optimistic status transition for re-run** — When the user clicks "Jalankan ulang check", the UI immediately sets `check.status = "processing"` in local state after the PATCH succeeds. This makes `inFlight = true`, causing the existing `useEffect` to create a new WebSocket subscription that picks up the job's real broadcasts. The alternative (polling or a separate "rerunning" state flag) would have required new subscription logic.

2. **`delete_all` + recreate within transaction** — The rerun job uses `check.integrity_check_results.delete_all` (bypasses AR callbacks, faster) inside the same transaction as the new `create!` calls. Previous outcomes are snapshotted into a Ruby hash before deletion. This keeps the logic simple and avoids upsert complexity.

3. **`resolved_at` is strictly mismatched→matched only** — The PRD specifies only this transition; missing_in_db→matched (e.g., after a successful Timeseries upload) is not flagged as "resolved" by design. The `compute_resolved_at` private method encodes this rule.

4. **History table navigation uses `preserveState: true`** — So that an admin actively previewing/uploading a new file doesn't lose their local state when paginating or filtering the history table below.

5. **`rerun` action validates three conditions** — check must be completed, no other check in-flight, and the file attachment must still exist. Returns distinct JSON error messages for each failure case, surfaced as an `alert()` on the client.

6. **`serialize_check_summary`** — A separate, slimmer serializer for the history table that excludes `total_abs_delta` (expensive to compute for every row) but includes `period_range_label` (precomputed via the model method) and `last_rerun_at`.

7. **`period_range_label` uses existing model method** — `IntegrityCheck#period_range_label` (added in M1) formats the period range as "Jan 2025 – Mei 2025". Reused as-is for the history table and latest-check callout.

## What the next milestone will need to know

This is the final milestone (M3/3). The feature is complete.

## Deviations from the PRD

None. All M3 scope was implemented as specified.
