# Mata Langit — Data Integrity: Excel Export

## What we're building

This feature adds an Excel download button to the Data Integrity check result detail page. When the admin clicks "Download Excel", the app generates and returns a `.xlsx` file containing four worksheets — Mismatched, Missing in DB, Extra in DB, and Matched — each populated with the full result rows for that specific integrity check. The export always reflects the complete dataset regardless of any filters or tabs the admin has active on screen.

The feature is a focused addition to the existing Data Integrity feature (Feature 5), built on the same Rails 8 + React 19 + PostgreSQL + Inertia.js stack. It is delivered in a single milestone.

---

### What the app does

- A "Download Excel" button appears on the Data Integrity check result detail page (`/admin/data/integrity/:id`) for any check with status `completed`
- Clicking the button downloads a `.xlsx` file named `integrity-{original-sot-filename}-{check-date}.xlsx` (e.g. `integrity-sot-mei2025-2026-05-25.xlsx`)
- The file contains exactly four worksheets in this order: **Mismatched**, **Missing in DB**, **Extra in DB**, **Matched**
- Each sheet is populated with all rows of that outcome type for the check — the export always includes the full dataset, never just what's visible in the current filter/tab state
- If a sheet has zero rows (e.g. a perfect check with no mismatches), that sheet is still present in the file but contains only the header row
- Column layout per sheet:
  - **Mismatched** → Region, Period (e.g. "Mei 2025"), SoT Netto Wise, DB Netto Wise, Delta
  - **Missing in DB** → Region, Period, SoT Netto Wise
  - **Extra in DB** → Region, Period, DB Netto Wise
  - **Matched** → Region, Period, SoT Netto Wise, DB Netto Wise
- The button is disabled (or absent) for checks with status other than `completed` — no download for pending, processing, failed, or cancelled checks

---

### Already provided by the existing codebase

- The full Data Integrity feature (Feature 5): `IntegrityCheck`, `IntegrityCheckResult` models; result detail page at `/admin/data/integrity/:id`; `Admin::Data::IntegrityChecksController`; admin layout and auth
- `IntegrityCheckResult` already carries all fields needed for the export: region, period_year, period_month, sot_netto_wise, db_netto_wise, delta, outcome
- Rails admin auth and routing infrastructure
- Design system `<Button>` component for the download trigger

---

### Out of scope

- **CSV format** — Excel (`.xlsx`) only
- **Export from the history/index page** — the button lives only on the individual check detail page, not on the list of all checks
- **Custom column selection** — the column layout is fixed per sheet as described above
- **Charts or conditional formatting** — plain data rows and headers only; no cell coloring, formulas, or frozen panes
- **Scheduled or emailed delivery** — download is always on-demand, triggered by the admin clicking the button
- **Partial/filtered export** — the download always exports all rows for each outcome type; it does not respect the active tab, search, or sort state on screen
- **Export of checks in non-completed states** — pending, processing, failed, and cancelled checks have no download button

---

### Data model

No new data models are needed. The export reads directly from:

- **IntegrityCheck** — to get the check's metadata (original filename, checked_at date, status) for generating the download filename
- **IntegrityCheckResult** — all result rows for the check, filtered by outcome to populate each sheet

---

## Milestone 1 — Excel Export

A single milestone delivers the complete feature: the server-side file generation endpoint and the download button on the result detail page.

### What gets built

- A new download action on the integrity checks controller that accepts a check `id`, loads all associated `IntegrityCheckResult` rows, generates a `.xlsx` file with four sheets (Mismatched, Missing in DB, Extra in DB, Matched) in the column layout described above, and streams it to the browser as a file download
- The download is only available for checks with status `completed`; attempting to download a non-completed check returns a redirect back with an error notice
- The filename is derived from the check's original SoT filename (without extension) and `checked_at` date: `integrity-{sot-filename-slug}-{YYYY-MM-DD}.xlsx`
- A "Download Excel" button (or icon-button) is added to the result detail page, visible and enabled only when the check's status is `completed`
- The button triggers a standard browser file download (direct link or form submit to the download endpoint) — no JavaScript blob handling required
- Empty sheets (zero rows for an outcome type) still appear in the file with their header row intact
- Period is formatted in each sheet as a human-readable string (e.g. "Mei 2025") matching the display format used on the detail page

### What milestone 1 explicitly does NOT include

- Export from the history/index page
- CSV format option
- Charts, formatting, or frozen panes in the Excel file
- Bulk export of multiple checks at once
- Any change to the existing result table, filters, tabs, or pagination on the detail page

### Done when

The admin navigates to a completed integrity check detail page, clicks "Download Excel", and the browser downloads a `.xlsx` file. Opening the file in Excel shows four sheets in the correct order (Mismatched, Missing in DB, Extra in DB, Matched), each with the correct column headers and all rows for that outcome type. A sheet with zero rows contains only the header row. The filename matches the `integrity-{sot-filename}-{date}.xlsx` pattern. Attempting to access the download URL for a non-completed check results in a redirect with an error notice, not a file download.
