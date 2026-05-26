# Mata Langit — Data Integrity

## What we're building

Data Integrity is a new admin feature that validates the accuracy of timeseries data in the database against a periodically-uploaded Source-of-Truth (SoT) file containing per-region, per-period netto_wise totals. The admin uploads the SoT `.xlsx` file weekly or monthly; the app aggregates the corresponding sums from `timeseries_transactions` and surfaces a list of regions whose values don't match — with zero tolerance (a 1-rupiah difference flags a mismatch). For each mismatched region, the app provides a one-click shortcut that deeplinks back to the existing Timeseries upload page pre-scoped to that region + period, so reconciliation is fast. Mismatched data remains fully usable by other processes — it is flagged, not blocked.

Because the SoT file is produced with rows where `flag_program` indicates a Program (any case: `"Program"`, `"PROGRAM"`, `"program"`) already excluded, the DB-side aggregation applies the same filter by default — otherwise every region would falsely appear as a mismatch. Matching is **case-insensitive** (`UPPER(flag_program) = 'PROGRAM'`) because actual data has been observed using sentence case `"Program"`; defending against future variants. Whether to include or exclude PROGRAM-flagged rows in the comparison is controlled by a **global per-admin preference** on the user's profile page (default: exclude). The preference is **snapshotted into each integrity check at creation time** so re-runs of historical checks remain reproducible even if the admin changes the preference later.

Alongside this feature, the admin sidebar is restructured: the existing **Timeseries** menu and the new **Data Integrity** menu are grouped under a single collapsible **"Data"** menu group, designed to accommodate additional data-related sub-features in the future.

The feature is built on the existing Rails 8 + React 19 + PostgreSQL stack with Inertia.js, ActionCable (Solid Cable) for real-time WebSocket updates, and the existing background job infrastructure (Solid Queue on Unix, `:async` adapter in-process on Windows). Implementation is broken into three milestones: Foundation (menu group + upload + comparison), Dashboard + Shortcut, and History + Manual Re-run.

---

### What the app does

- Admin sees a new collapsible **"Data"** menu group in the sidebar, containing **Timeseries** and **Data Integrity** as children; the group remembers its expanded/collapsed state across navigations
- Admin opens **Data Integrity** and uploads a single `.xlsx` Source-of-Truth file via drag-and-drop or file picker; the file contains rows with **Region**, **Year**, **Month**, **Netto_Wise** columns
- A preview panel shows the file summary (total rows, period range, distinct regions detected) plus the first 10 rows; malformed rows are listed by line number and the file is rejected until fixed
- After confirming the preview, an integrity check runs as a background job with live WebSocket progress showing rows compared so far and current status (pending → processing → completed / failed / cancelled), with a "Batalkan" button while in flight
- The DB-side aggregation honors a **`flag_program`** filter: by default rows where `flag_program = 'PROGRAM'` (uppercase, exact match) are **excluded** from the comparison so the DB total matches the way the SoT file was produced; admins control this via a global preference on their profile page (default: exclude); the value in effect when a check is created is snapshotted on the check so re-runs use the same filter
- On completion, the app redirects to the check's result detail page showing summary cards (Matched / Mismatched / Missing in DB / Extra in DB) and a sortable, filterable, paginated table of per-region results with SoT value, DB value, delta in rupiah, and outcome badge
- Each actionable row has an **"Upload ulang Timeseries"** button that deeplinks to the existing Timeseries upload page with a banner identifying the region + period to reconcile and a return-to link back to this check
- The Data Integrity sidebar item shows a badge counter with the number of unresolved mismatches from the latest completed check, matching the Inbox unread badge styling
- The Data Integrity index page shows a paginated, filterable, sortable history of every past integrity check, plus a "Latest check" callout pinning the most recent one for quick access
- A "Jalankan ulang check" button on each completed check's detail page re-runs the comparison against the current database state using the originally uploaded SoT file (no re-upload needed); previously-mismatched regions that now match are tagged "Resolved"
- The integrity check never modifies `timeseries_transactions` and never blocks other processes — mismatched data remains fully usable; the integrity status is purely observational

---

### Already provided by the existing codebase

- Rails 8 + React 19 + Inertia.js stack with admin layout (`AdminShell`, `MainNav`), design system components, and auth (`Admin::BaseController`)
- Background job infrastructure (Solid Queue on Unix, `:async` adapter in-process on Windows)
- ActionCable infrastructure (Solid Cable, DB-backed) — fully configured
- The **Timeseries feature** as a complete reference implementation for the upload + WebSocket-progress + cancel + paginated-history pattern:
  - `TimeseriesUpload`, `TimeseriesTransaction` models — read-only source of DB aggregation for this feature
  - `TimeseriesFileParser` (xlsx parsing patterns)
  - `TimeseriesImportJob` (background job + progress broadcasts + cancel + rollback)
  - `TimeseriesUploadChannel` (ActionCable channel)
  - `Admin::Timeseries::UploadsController` (index, preview, create, cancel)
  - `app/javascript/pages/admin/timeseries/Uploads.tsx` (full UI: drag-and-drop, preview cards, WebSocket progress, paginated/filterable/sortable history table)
- Sidebar badge pattern from `AdminShell` (Inbox unread count) — to mirror for the Data Integrity badge
- `cn()` utility, `Badge`, `Button`, `Input`, `Select`, `Dialog`, and pagination/filter UI primitives from the design system
- `User` model + the existing admin profile / preferences page — extended (rather than newly built) to host the global "Include PROGRAM data in Data Integrity checks" preference
- The `flag_program` column on `timeseries_transactions` — populated by the existing `TimeseriesFileParser` (Excel header `"Flag Program"`); no parser changes are needed for this feature

---

### Out of scope

- **Auto-correction / sync** — the app never pulls SoT values into the DB on the admin's behalf; admins always drive reconciliation manually via the Timeseries upload flow
- **Email / Slack notification on mismatch** — admins discover mismatches by visiting the Data Integrity page; the sidebar badge is the only out-of-page indicator
- **Tolerance threshold configuration** — hard zero-tolerance is the rule; even a 1-rupiah delta is a mismatch
- **Per-row / per-product drill-down** — integrity stops at the region-aggregate level; identifying which specific transactions caused a delta is out of scope
- **Delete integrity check from history** — data-loss risk; deferred (matches the Timeseries history policy)
- **Scheduled / automated SoT upload** — no FTP drop, no API push, no cron; admin upload only
- **Export mismatch report to .xlsx / .csv** — the report is on-screen only in v1
- **Comparing two historical checks side-by-side** — each check is viewed in isolation
- **Bulk re-upload** — re-upload shortcuts are per-region; no "fix all mismatched regions at once" action
- **Inline delete affordance for "extra-in-DB" rows** — the admin is shown the discrepancy and must investigate via the Timeseries upload list manually
- **Role-based access** — all admins retain full read/write access
- **Quarantine / freeze flag on `TimeseriesTransaction`** — the integrity status is purely observational; no flag is propagated to the underlying records
- **Multi-file SoT upload** — one file per check; multi-file SoT batches are deferred
- **CSV format** — `.xlsx` only
- **Full re-run history with diff views** — only the most recent comparison result is stored per check; re-running rewrites results in place, retaining only `last_rerun_at`
- **Per-check filter toggle on the upload screen** — admins do not pick the `flag_program` filter per upload; the filter comes from the global per-admin preference and is snapshotted onto the check at creation time. There is no checkbox on the Data Integrity upload panel itself
- **Fuzzy matching of `flag_program` beyond `"PROGRAM"` (any case)** — the program filter is case-insensitive (e.g. `"PROGRAM"`, `"Program"`, `"program"` are all treated as Program), but does not do substring or prefix matching. Variant labels like `"PROGRAM_A"`, `"Prog"`, `"PROMO"` are treated as non-program and stay in the aggregation. `NULL` rows are also treated as non-program.

---

### Data model

**IntegrityCheck** — one record per uploaded SoT file (= one integrity-check session). The app remembers:
- filename — original `.xlsx` filename
- the attached `.xlsx` file itself (preserved so the check can be re-run later without re-uploading)
- status — pending, processing, completed, failed, cancelled
- period_min, period_max — earliest and latest (year, month) covered by the SoT file (for display in history and detail)
- total_rows_in_sot — count of (region, period) tuples read from the SoT file
- matched_count, mismatched_count, missing_in_db_count, extra_in_db_count — outcome aggregates updated when the check completes (and again on re-run)
- error_message — populated when status is failed
- uploaded_by — link to the admin User who initiated the check
- checked_at — timestamp of the original comparison run
- last_rerun_at — timestamp of the most recent manual re-run (null if never re-run)
- include_program — boolean, default `false` (= PROGRAM rows excluded from DB aggregation). Snapshotted from the uploader's `User#include_program_in_integrity_checks?` at check creation. Both the original check job and every re-run job read this field — never the live user preference — so the check stays reproducible if the admin changes the preference later

**IntegrityCheckResult** — one record per (region, year, month) tuple within a check. Created when the check completes and rewritten on re-run. The app remembers:
- a link back to its parent IntegrityCheck
- region — the region name (matches `timeseries_transactions.region`)
- period_year, period_month — the period this row covers
- sot_netto_wise — the value declared by the SoT file for this tuple (null when the tuple is extra-in-DB and absent from the file)
- db_netto_wise — the aggregated sum from `timeseries_transactions` for this region + period at compare time (null when no rows exist in the DB for that tuple)
- delta — sot_netto_wise minus db_netto_wise, in rupiah at full decimal precision (null when one side is null)
- outcome — one of matched / mismatched / missing_in_db / extra_in_db
- resolved_at — set when a re-run finds that a previously-mismatched tuple now matches; cleared if the tuple goes back to mismatched in a subsequent re-run

**Existing entities:**
- **TimeseriesTransaction** — read-only source of the DB-side aggregation (`SUM(netto_wise)` grouped by region + period). No schema change. A new model-level scope **`non_program`** is added: `where("UPPER(flag_program) IS DISTINCT FROM ?", "PROGRAM")`. `IS DISTINCT FROM` keeps `NULL` rows (Postgres NULL semantics would otherwise drop them). `UPPER(...)` makes the comparison case-insensitive — necessary because real data uses sentence case `"Program"`, not uppercase. The scope is designed to be reusable: the Pivot feature (Feature 4) has already marked `flag_program` as a filter-only field and will consume this same scope.
- **TimeseriesUpload** — referenced only to surface the "which upload covered this region+period" context where useful; not modified
- **User** — gains one new boolean field, `include_program_in_integrity_checks` (default `false` — exclude PROGRAM). Exposed on the existing admin profile / preferences page as a checkbox labeled in plain language (e.g. "Sertakan data dengan Flag Program 'PROGRAM' saat menjalankan Data Integrity check"). Default unchecked. This value is read **only at the moment an integrity check is created** — afterwards the snapshot on `IntegrityCheck.include_program` is authoritative.

---

## Milestone 1 — Foundation

This milestone delivers the end-to-end integrity loop at a minimal level of polish: the new "Data" menu group in the sidebar, the SoT upload page, the comparison background job with live progress, and a minimal result detail page showing the four summary counts (without the full filterable table yet). Verifies the core flow works before investing in dashboard polish.

### What gets built

- The sidebar in `AdminShell` is restructured: the flat "Timeseries" item is replaced with a collapsible **"Data"** menu group (Database icon) containing **Timeseries** and **Data Integrity** as children
- The "Data" group is expanded by default when the current URL is under `/admin/timeseries/*` or `/admin/data/*`, and its expanded/collapsed state persists across navigations via `localStorage`
- Clicking the group header toggles expand/collapse; clicking a child item navigates; the active child highlights using the existing nav-active style
- New page at `/admin/data/integrity` with an upload zone (single `.xlsx` file via drag-and-drop or picker)
- Upload preview panel showing: total rows in file, period range covered (min/max year+month), distinct regions detected, and a 10-row table preview of the SoT data
- Malformed-row validation: missing region, non-numeric netto_wise, invalid year/month all listed with their row numbers; the file is rejected wholesale until fixed
- "Mulai Check" button (disabled until a valid preview is shown) triggers a background `IntegrityCheckJob`
- **`flag_program` filter scaffolding:**
  - A migration adds `include_program_in_integrity_checks` (boolean, `default: false`, `null: false`) to the `users` table
  - A migration adds `include_program` (boolean, `default: false`, `null: false`) to the new `integrity_checks` table
  - `TimeseriesTransaction` gains a model-level scope **`non_program`** (`where("UPPER(flag_program) IS DISTINCT FROM ?", "PROGRAM")` — case-insensitive); placed in `app/models/timeseries_transaction.rb` alongside the existing `for_period` scope so it is reusable by the planned Pivot feature
  - The existing admin profile / preferences page is extended with a single checkbox: **"Sertakan data dengan Flag Program 'PROGRAM' saat menjalankan Data Integrity check"** (default unchecked, mapped to `User#include_program_in_integrity_checks`)
  - `Admin::Data::IntegrityChecksController#create` snapshots `current_user.include_program_in_integrity_checks` onto `IntegrityCheck#include_program` at the moment the check record is built — after that the snapshot is authoritative
- The job aggregates `SUM(netto_wise)` from `timeseries_transactions` per (region, year, month) for every tuple in the SoT file, compares to the SoT value, and writes one IntegrityCheckResult per tuple with outcome matched / mismatched / missing_in_db; comparison runs at full decimal precision (no float rounding). The aggregation query honors the snapshot: when `integrity_check.include_program` is `false`, the scope is chained through `.non_program` before the `SUM`; when `true`, the scope is used as-is so PROGRAM rows are included
- The job also finds extra-in-DB tuples: (region, period) combinations present in `timeseries_transactions` within the period range covered by the SoT file but absent from the SoT, written as outcome extra_in_db with `sot_netto_wise = null`. Extra-in-DB detection uses the same `non_program` filter when the check excludes PROGRAM, so PROGRAM-only regions don't surface as false extras
- Real-time WebSocket progress UI: status transitions and an "X of N rows compared" counter, with a "Batalkan" button while pending/processing
- Cancelling discards partial results, sets status = cancelled, and the check has zero IntegrityCheckResult rows preserved
- On successful completion, the app auto-redirects to a minimal result detail page at `/admin/data/integrity/:id` showing only the four summary count cards (Matched / Mismatched / Missing in DB / Extra in DB), file metadata strip, and a basic non-paginated list of the first 50 results sorted by absolute delta desc (no filter, no tabs, no fancy table — this is the M1 "it works" view). The metadata strip includes a one-line filter label: **"Filter: data PROGRAM di-exclude"** when `include_program = false`, or **"Filter: termasuk data PROGRAM"** when `true`, so the admin always knows which filter produced these numbers
- The integrity check never reads or writes `timeseries_transactions` beyond `SELECT SUM(netto_wise) ... GROUP BY ...` (with the optional `non_program` scope chained on); no flags or updates anywhere outside the new tables, and no change to existing Timeseries upload/import behavior

### What milestone 1 explicitly does NOT include

- Full mismatch dashboard with tabs, sortable/filterable table, and IDR formatting — comes in M2
- Re-upload shortcut button + Timeseries banner + return-to flow — comes in M2
- Sidebar badge counter for unresolved mismatches — comes in M2
- Paginated, filterable, sortable history table on the index page — comes in M3
- "Latest check" callout card pinning the most recent check — comes in M3
- Manual re-run button + re-run job — comes in M3
- "Resolved" tagging on previously-mismatched results — comes in M3

### Done when

The admin can open the new "Data" group in the sidebar, navigate to Data Integrity, upload a valid `.xlsx` SoT file containing region/year/month/netto_wise rows, see a preview and confirm, watch the background job run with live progress, cancel mid-flight (and observe the check is marked cancelled with no results retained), upload again and let it complete, and land on the minimal detail page showing four count cards plus a list of the highest-delta results — all without any modification to existing Timeseries data and without any disruption to other admin features.

Additionally, an admin who has not touched their profile preference runs a check and sees **"Filter: data PROGRAM di-exclude"** in the metadata strip; the same admin opens their profile, ticks the "Sertakan data Program" checkbox, saves, runs a new check, and sees **"Filter: termasuk data PROGRAM"** on the new check while the prior check's metadata strip still reads "di-exclude" (proving the snapshot held). Running a SQL check on `timeseries_transactions` for a sample region+period shows that the DB total reported by an `include_program=false` check equals `SUM(netto_wise) WHERE flag_program IS DISTINCT FROM 'PROGRAM'` for that group.

---

## Milestone 2 — Dashboard + Shortcut

This milestone turns the minimal M1 result page into the full mismatch dashboard described in the PRD: tabbed views, sortable filterable paginated table, summary cards with IDR formatting, and the per-row re-upload shortcut that deeplinks to the Timeseries upload page with a banner identifying the affected region and period. Also adds the sidebar badge counter for unresolved mismatches.

### What gets built

- The result detail page at `/admin/data/integrity/:id` is expanded into the full dashboard:
  - Four summary cards: Matched (green), Mismatched (red, with total absolute delta formatted as IDR), Missing in DB (amber), Extra in DB (amber)
  - Metadata strip: filename, uploaded by, checked at, period range covered, total rows in SoT, **plus the `flag_program` filter label carried over from M1** ("Filter: data PROGRAM di-exclude" / "Filter: termasuk data PROGRAM") — styled as a subtle badge so it is always visible at-a-glance
  - Tab / segmented filter to switch view: All / Mismatched only / Missing in DB only / Extra in DB only / Matched only — default tab is **Mismatched**
  - Results table columns: Region · Period (e.g. "Mei 2025") · SoT Netto Wise · DB Netto Wise · Delta · Outcome badge · Action button
  - Outcome badges are color-coded; deltas display with sign (positive = SoT > DB, negative = SoT < DB) and IDR formatting
  - Sortable columns: Region, Period, SoT, DB, Delta (abs); default sort is Delta (abs) desc
  - Server-side search by region name and dropdown filters for year and month
  - Pagination at 25/page; all filter/sort/page state reflected in URL
  - Empty state when the active tab has no rows (e.g., "Semua data konsisten" with green checkmark for the Matched-tab empty case on a perfect check)
- Each actionable row (mismatched, missing_in_db, extra_in_db) has a button labeled **"Upload ulang Timeseries"** that opens `/admin/timeseries/uploads` with query params indicating the target region, year, month, and a `return_to` URL pointing back to this integrity check
- The existing Timeseries Uploads page renders a banner at the top when these query params are present:
  - For mismatched / missing_in_db: _"Anda sedang memperbaiki Region **{X}** untuk periode **{Mei 2025}**. Upload file Timeseries yang sesuai. Setelah selesai, kembali ke Data Integrity dan jalankan ulang check."_
  - For extra_in_db: _"Verifikasi: data untuk Region **{X}** periode **{Mei 2025}** ada di database tapi tidak ada di SoT. Pertimbangkan apakah upload Timeseries-nya valid atau perlu diperbaiki."_
  - Banner includes a "← Kembali ke Data Integrity" link that returns to the originating check detail page
- The sidebar item for "Data Integrity" inside the "Data" group shows a badge counter equal to the count of mismatched + missing_in_db results from the latest completed check (`extra_in_db` excluded from the badge by default). Badge styling matches the existing Inbox unread badge. Badge is shared via `inertia_share` from `Admin::BaseController` so it appears on every admin page

### What milestone 2 explicitly does NOT include

- Paginated/filterable/sortable history table on the index page — comes in M3
- "Latest check" callout card on the index — comes in M3
- Manual re-run button and job — comes in M3
- "Resolved" tags on previously-mismatched rows (depends on re-run existing) — comes in M3
- Pre-filling or locking the Timeseries upload form based on the deeplink params — banner only; admin still uploads the file normally
- Bulk re-upload action; multi-select on the dashboard table
- Inline delete affordance for extra-in-DB rows
- Export the table to CSV / Excel

### Done when

After an integrity check completes, the admin sees the full dashboard with summary cards, switches between tabs to filter by outcome, sorts the table by delta absolute desc, searches a specific region, paginates through results, clicks "Upload ulang Timeseries" on a mismatched row, lands on the Timeseries upload page with the banner identifying the region and period to fix, clicks the return link and is taken back to the integrity check, and across every admin page sees the sidebar badge on Data Integrity reflecting the current unresolved mismatch count.

---

## Milestone 3 — History + Manual Re-run

This milestone fills out the Data Integrity index page with a complete history of past checks (paginated, filterable, sortable), pins the latest check in a callout for quick access, and adds the manual re-run button that re-compares the originally uploaded SoT file against the current database state.

### What gets built

- The Data Integrity index page (`/admin/data/integrity`) layout is reorganized: upload zone at the top, a "Latest check" callout card pinning the most recent completed check (filename, period range, key counts, "Lihat detail" button), then a paginated history table below
- History table columns: Filename · Period range covered · Uploaded by · Checked at · Status badge · Matched · Mismatched · Missing in DB · Extra in DB · Total rows. The Filename column also shows a small inline filter badge — **"PROGRAM excl."** (default) or **"PROGRAM incl."** — so an admin scanning historical checks can immediately tell which filter produced each row, especially when the global preference has been changed at some point and checks were run under different settings
- Each row in the history table is clickable, navigating to the check's detail page at `/admin/data/integrity/:id`
- Pagination at 25/page, server-side; default sort is Checked at desc
- Filter bar: search by filename, filter by status, filter by period (year + month dropdowns), "Reset filter" button
- Sortable columns: Checked at, Period range, Status, Mismatched count
- All filter / sort / page state reflected in URL (bookmarkable)
- On the result detail page, a "Jalankan ulang check" button appears when status = completed (disabled if a re-run or another check is currently in flight)
- Clicking the button enqueues an `IntegrityCheckRerunJob` that re-aggregates `timeseries_transactions` for every (region, year, month) tuple in the originally uploaded SoT file (which was preserved on `IntegrityCheck.file`) and rewrites the IntegrityCheckResult rows in place. The re-run reads **`integrity_check.include_program` (the snapshot)** to decide whether to chain `.non_program` onto the aggregation — never the live `current_user` preference. This guarantees that re-running a historical check always reproduces the same filter behavior as the original run, even if the admin's profile preference has been toggled in the meantime
- The re-run uses the same WebSocket progress UI as the original check (live "X of N rows compared" counter, status transitions); cancellation is supported the same way
- Re-run rewrites:
  - All IntegrityCheckResult rows are replaced with the new comparison output
  - The IntegrityCheck's matched_count, mismatched_count, missing_in_db_count, extra_in_db_count are refreshed
  - `last_rerun_at` is updated
  - For each result whose previous outcome was mismatched and whose new outcome is matched, `resolved_at` is set to the re-run timestamp
  - For any result that becomes mismatched again after having been resolved, `resolved_at` is cleared
- On the result detail page, a small history strip shows: "Diperiksa pertama kali: {checked_at}. Terakhir di-rerun: {last_rerun_at}." (omits the re-run line if `last_rerun_at` is null)
- Results table on the detail page shows a small "Resolved" hint with the resolved date on rows whose `resolved_at` is set; resolved rows render slightly dimmed
- The sidebar badge counter (from M2) automatically reflects the latest completed check's mismatched + missing_in_db counts after a re-run

### What milestone 3 explicitly does NOT include

- Full history of past re-run results with diff views (only the most recent comparison is retained per check)
- Scheduled / auto re-run
- Undoing a re-run
- Comparing two historical integrity checks side-by-side
- Export the history table to CSV / Excel
- Delete a check from history
- Lock a check from being re-run

### Done when

With several historical integrity checks in the database, the admin can navigate the paginated history, filter by status and period, search by filename, sort by mismatched count desc to find the worst checks, click into any past check, click "Jalankan ulang check" on a completed one, watch the live progress, and after completion see the refreshed counts, the updated "Terakhir di-rerun" timestamp, and "Resolved" badges on any region that has been reconciled since the original check — all reflected immediately in the sidebar badge counter and bookmarkable via URL.

The admin can also verify the filter-reproducibility guarantee: pick a completed check with `include_program=false`, toggle the global preference to `true` on their profile, return to the check and click "Jalankan ulang check"; the re-run still excludes PROGRAM data (matching the snapshot), counts only change to the extent that the underlying timeseries data has changed, and the "PROGRAM excl." badge in the history row remains unchanged.
