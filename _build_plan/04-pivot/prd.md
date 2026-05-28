# Mata Langit — Pivot

## What we're building

Pivot is an interactive, browser-based pivot table builder for the Timeseries data. From a blank canvas, admins select dimension fields to use as row labels and column headers, choose a numeric measurement to aggregate (with the aggregation function of their choice), and optionally apply per-field filters. Clicking "Generate" executes the resulting cross-tab SQL query against the `timeseries_transactions` table and renders the result as a professional, cross-tab table in the canvas area. The current configuration is serialised into the URL so any pivot view can be bookmarked or shared. Completed tables can be downloaded as `.xlsx` files.

The feature is built on the existing Rails 8 + React 19 + PostgreSQL stack with Inertia.js. No new database tables are required. Implementation is broken into three milestones: core pivot engine with the field picker and basic table render, filters + URL config persistence, and Excel export + finishing polish.

---

### What the app does

- Admin opens `/admin/pivot` and sees a blank canvas with a configuration panel
- The configuration panel shows available dimension fields grouped by hierarchy (Geography/Distribution, Product, Time, People), plus a separate Measurement section
- Admin assigns dimension fields to Rows, Columns, or Filters by clicking; selected fields appear as chips in their respective zones
- Admin picks one measurement — **Netto Wise** (`netto_wise`), **Dist Netto** (`dist_netto`), or **Active Outlet** (always COUNT DISTINCT of `outlet_national_code`); for Netto Wise and Dist Netto, the admin also selects an aggregation function (Sum, Count, Average, Min, Max)
- Admin adds optional **regular filter** conditions: for each dimension field, a multi-select dropdown of distinct values fetched on demand
- A dedicated **Period Filter** section is always visible (not added on demand) with three mandatory controls the user must fill before Generate can run: **Fiscal Year** (multi-select), **Month** (multi-select), and a **day-range** (Start Day / End Day). These scope the data entering every aggregation cell — independently of what dimension fields the user places in Rows or Columns
- The "Generate" button is enabled only when at least one Row field and one Measurement are selected; clicking it fetches and renders the pivot table
- The canvas shows a true cross-tab table: row-dimension labels on the left, column-dimension values as headers, aggregated measurement values in cells, plus row totals, column totals, and a grand total
- If no Column field is selected, the table renders as a flat summary (one row per row-group, one value column)
- The full configuration is reflected in the URL query string; loading the URL restores the config and runs the pivot automatically
- A "Download Excel" button (visible after a table is generated) downloads the rendered table as a `.xlsx` file with basic formatting

---

### Already provided by the Build New starter

- Admin shell, authenticated routes, `Admin::BaseController`, design system components
- `timeseries_transactions` table with all dimension and numeric columns
- Background job infrastructure, Rails + Inertia controller patterns
- `caxlsx` or equivalent may need to be added for `.xlsx` generation (no prior gem present)

---

### Out of scope

- **Saved / named pivot configs** — persisted in the database for reuse; URL bookmarking is the v1 approach
- **Drag-and-drop field assignment** — clicking to assign/remove is sufficient; drag-and-drop is a UX enhancement for later
- **Multiple measurements simultaneously** — showing two numeric columns side-by-side; v1 picks exactly one
- **Custom formulas** — e.g. netto_wise / qty_total_pcs calculated on the fly
- **Conditional formatting** — color-coding cells based on value thresholds
- **Chart visualization** — bar or line chart alongside or instead of the table
- **Expandable/collapsible row groups** — drill-down within the rendered table
- **Cell-level click-through** — clicking a cell to see the underlying transaction rows
- **OR logic between filters** — all active filters are combined with AND
- **"Not equal" / exclusion filters** — only equality / "is one of" for v1
- **Scheduled or auto-refresh** — the pivot always requires a manual Generate click
- **CSV export** — Excel (.xlsx) only
- **Multiple sheets in the Excel export** — one sheet, the exact pivot table on screen

---

### Dimension fields (available for Rows, Columns, Filters)

Grouped by hierarchy as displayed in the field picker:

**Geography / Distribution**
- `region` — Region code
- `region_name` — Region name
- `area_name` — Area
- `area_sub_name` — Sub-area
- `dist_parent_name` — Distributor parent
- `dist_sap_code` — Distributor SAP code
- `dist_child_name` — Distributor child
- `channel_code` — Channel group
- `channel_sub_code` — Channel sub-code
- `outlet_national_group` — Outlet national group
- `outlet_dist_code` — Outlet distributor code
- `outlet_dist_name` — Outlet distributor name
- `outlet_national_code` — Outlet national code
- `outlet_national_name` — Outlet national name

**Product**
- `category_sub_name` — Category
- `brand_group_name` — Brand group
- `brand_name` — Brand
- `range_name` — Range
- `range_variant_name` — Range variant
- `variant_name` — Variant
- `product_code` — Product code
- `product_dist_code` — Product distributor code
- `product_dist_name` — Product distributor name
- `product_name` — Product name
- `sap_parent_code` — SAP parent code

**Time**
- `FY` — Fiscal Year (computed: Apr–Mar cycle; e.g. FY2526 = Apr 2025–Mar 2026)
- `period_year` — Year
- `period_month` — Month number
- `date_transaction` — Transaction date

**Transaction**
- `type_transaction` — Transaction type
- `invoice_no` — Invoice number
- `price_category` — Price category

**People**
- `spv_salesman_name` — SPV Salesman
- `salesman_name` — Salesman
- `tl_spv_name` — TL SPV
- `tl_name` — TL
- `bp_name` — BP
- `md_name` — MD
- `sap_customer_code` — SAP customer code
- `sap_customer_name` — SAP customer name
- `sap_customer_group` — SAP customer group
- `sap_customer_sub_group` — SAP customer sub-group
- `sap_customer_sub_group_2` — SAP customer sub-group 2

**Filter-only fields** (available in the Filter zone only, not as Row/Column headers)
- `flag_program` — Program flag

---

### Measurement fields

| Key | Label | Notes |
|-----|-------|-------|
| `netto_wise` | Netto Wise | Numeric column; supports aggregation function selection |
| `dist_netto` | Dist Netto | Numeric column; supports aggregation function selection |
| `active_outlet` | Active Outlet | Always computed as `COUNT(DISTINCT outlet_national_code)`; no aggregation function selector shown |

Aggregation functions (for `netto_wise` and `dist_netto` only): **Sum, Count, Average, Min, Max**

---

## Milestone 1 — Core Pivot Engine

This milestone delivers a working pivot builder: the field picker panel, measurement selector, Generate button, the cross-tab SQL engine, and the rendered result table. No filters yet — the admin can select rows, columns, and a measurement and see real data.

### What gets built

- New admin page at `/admin/pivot` with a two-panel layout: configuration panel on the left/top, canvas on the right/bottom
- Configuration panel contains three zones (Rows, Columns, Measurement) and a searchable field list grouped by the five dimension hierarchies
- Clicking a dimension field opens a small popover or inline toggle to assign it to Rows or Columns; the field then appears as a chip in the selected zone; clicking the chip removes it
- Measurement section: three choices — **Netto Wise**, **Dist Netto**, **Active Outlet**; selecting Netto Wise or Dist Netto also shows an aggregation function dropdown (Sum, Count, Average, Min, Max); selecting Active Outlet hides the aggregation dropdown (always COUNT DISTINCT)
- "Generate" button — enabled only when at least one Row field and one Measurement are selected
- The backend receives the config, builds a dynamic cross-tab SQL using `CASE WHEN` aggregates over `timeseries_transactions`, and returns the result
- The FY computed dimension is supported: the backend translates it to a SQL expression `CASE WHEN period_month >= 4 THEN 'FY' || LPAD((period_year % 100)::text, 2, '0') || LPAD(((period_year + 1) % 100)::text, 2, '0') ELSE 'FY' || LPAD(((period_year - 1) % 100)::text, 2, '0') || LPAD((period_year % 100)::text, 2, '0') END`
- Canvas renders the result: row-dimension labels on the left, column-dimension distinct values as headers, aggregated measurement values in cells
- Row totals column on the right; column totals row at the bottom; grand total at bottom-right
- If no Column field is selected, renders as a flat summary table
- Numbers formatted with thousands separators; empty cells shown as `—`
- Table is horizontally scrollable for wide result sets
- Loading skeleton shown while the query runs
- Error message shown in the canvas area if the query fails

### What milestone 1 explicitly does NOT include

- Filter builder (no WHERE clause conditions yet)
- FY dimension filter value population
- URL config persistence (config is not in the URL yet)
- Excel export
- The field picker does not yet support the Filters zone

### Done when

The admin can open `/admin/pivot`, assign one or more dimension fields to Rows, optionally assign a field to Columns, select a measurement + aggregation, click Generate, and see a correctly aggregated cross-tab table with row totals, column totals, and a grand total.

---

## Milestone 2 — Filters & URL Config

This milestone adds the filter builder (including the `flag_program` filter-only field and the FY dimension in filters) and makes the full configuration live in the URL so any pivot view can be bookmarked or shared.

### What gets built

#### Regular Filters

- The configuration panel gains a **Filters** zone alongside Rows and Columns
- All dimension fields can be added as filters; `flag_program` is available in Filters only (not Rows/Columns)
- Adding a filter for a dimension field opens a multi-select dropdown populated by fetching the distinct values for that field from the database (on-demand API call, not pre-loaded)
- Active filter conditions shown as chips; clicking a chip removes the filter
- Multiple filters are combined with AND logic in the SQL WHERE clause
- The FY dimension works correctly in both the field picker and filters: the SQL expression is applied consistently
- Filter values are fetched respecting any currently active filters on other fields (dependent filtering: e.g. selecting Region first narrows the Outlet list)

#### Period Filter (always visible, mandatory)

The configuration panel always shows a dedicated **Period Filter** section above the regular Filters zone. All three controls are required — the Generate button remains disabled until each has at least one value selected / set:

1. **Fiscal Year** — **multi-select** dropdown populated on demand with distinct FY values from the database (e.g. `FY2526`, `FY2425`). User may select one or more FYs.
2. **Month** — **multi-select** dropdown of calendar months (Jan–Dec / 1–12). User may select one or more months.
3. **Days** — two side-by-side comboboxes defining a day-of-month range (applied uniformly to every selected FY × Month combination):
   - **Start Day** — values `1`–`31`, default `1`
   - **End Day** — values `1`–`31` plus `"End of Month"` (last option), default `"End of Month"`
   - `"End of Month"` resolves in SQL to the actual last day of the given month

**How this scopes the data (important):**

The Period Filter is a *data scope*, not a structural pivot control. It limits which rows from `timeseries_transactions` enter the aggregation, independently of what the user has placed in the Rows / Columns / Measurement zones.

Example — user selects FY2324 + FY2425 + FY2526, months Apr + May, days 1–15. If the user then also puts FY and Month as pivot *columns*, the resulting cross-tab shows all six FY × Month combinations as column headers, and every cell reflects only transactions from days 1–15 of that month:

```
              FY2324          |       FY2425         |       FY2526
         Apr    |    May      |   Apr    |    May    |   Apr    |    May
Row ...   X     |     X       |    X     |     X     |    X     |     X
```

The Period Filter translates to a SQL WHERE clause applied before any regular filters:
- `fy_computed IN (:selected_fys)` — using the same FY SQL expression as the FY dimension
- `period_month IN (:selected_months)` — calendar month numbers
- `EXTRACT(DAY FROM date_transaction) BETWEEN :start_day AND :end_day` — where `"End of Month"` is evaluated per-row as the last day of that row's month

The Period Filter config (all selected FYs, selected months, start day, end day) is included in the serialised URL alongside regular filters.

#### URL Persistence

- The full pivot config (row fields, column fields, measurement, aggregation function, regular filter conditions, and period filter values) is serialised into the URL query string on every change
- On page load with a pre-filled URL, the config is restored and the pivot query is executed automatically (no need to click Generate again)

### What milestone 2 explicitly does NOT include

- Excel export
- Saving named configs to the database
- OR logic between filter conditions
- "Not equal" / exclusion filters

### Done when

The admin selects multiple FYs (e.g. FY2324 + FY2425 + FY2526), multiple months (e.g. Apr + May), and a day range (e.g. 1–15) in the Period Filter, optionally adds regular filter conditions (e.g. `region = "JAVA"`), and clicks Generate. The pivot table reflects only data within that scope. If the admin also places FY and Month as pivot columns, the cross-tab shows all selected FY × Month combinations as headers with day-scoped values in every cell. Copying the URL and pasting it in a new tab restores the exact same config and reruns the pivot immediately.

---

## Milestone 3 — Export & Polish

This milestone adds Excel export and completes all finishing touches: robust error handling, loading UX, number formatting, and empty-state messaging.

### What gets built

- A "Download Excel" button appears in the canvas area after a table is generated
- Clicking it downloads the rendered pivot table as a `.xlsx` file
- Filename format: `pivot-{measurement-name}-{YYYY-MM-DD}.xlsx`
- Excel formatting: bold header row (column dimension values), bold totals row and totals column, numeric cells formatted with thousands separators and 2 decimal places, auto-column width
- If a query returns too many distinct column values (more than a configurable limit, e.g. 100), a warning message is shown in the canvas: "Too many column values to display (N). Add a column filter to reduce the result." — Generate does not run the query
- Empty-state messaging on a fresh blank canvas: a prompt explaining what to do ("Select rows and a measurement, then click Generate")
- All error states have clear, human-readable messages
- The "Generate" button shows a spinner and is disabled while loading
- The page is accessible: table uses proper `<thead>` / `<tbody>` / `<th scope>` markup; the config panel is keyboard-navigable

### What milestone 3 explicitly does NOT include

- Multiple sheets in the Excel file
- CSV export
- Embedded charts in Excel
- Conditional formatting in the table

### Done when

The admin generates a pivot, clicks "Download Excel", opens the downloaded `.xlsx`, and sees the correctly formatted cross-tab table with bold headers and totals. Large column-count results show a warning before running the query. The blank canvas shows a helpful prompt on first load.
