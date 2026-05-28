# Milestone 1 — Core Pivot Engine: Log

## What was built

### Files created
- `app/controllers/admin/pivot_controller.rb` — two actions: `show` (Inertia page) and `generate` (raw fetch POST returning JSON)
- `app/lib/pivot_query_builder.rb` — SQL engine service object
- `app/javascript/pages/admin/Pivot.tsx` — full pivot builder page
- `test/controllers/admin/pivot_controller_test.rb` — 7 controller tests (auth, validation, JSON shape)

### Files modified
- `config/routes.rb` — added `GET /admin/pivot` and `POST /admin/pivot/generate`
- `app/frontend/components/AdminShell.tsx` — added `full?: boolean` prop (removes `max-w-5xl`); added `Grid3x3` "Pivot" entry inside the Data nav group; updated `matchGroup` to include `/admin/pivot`

## Architecture decisions

**`netto_dist` column name.** The PRD referred to the measurement as `dist_netto`, but the actual DB schema column is `netto_dist`. Confirmed with the user — `netto_dist` is used throughout.

**Full-width layout.** The AdminShell gained a `full` boolean prop that, when set, removes the `max-w-5xl mx-auto` wrapper and also sets `overflow-hidden` on `<main>` so the pivot layout can manage its own scrolling. The config panel + canvas use `flex h-[calc(100vh-4rem)] lg:h-screen` so both panels are independently scrollable without page-level scroll.

**Two-step cross-tab SQL.** Step 1: `SELECT DISTINCT (col_expr) AS v FROM timeseries_transactions … LIMIT 500` to get column values. Step 2: build a `CASE WHEN (col_expr) = '<quoted_val>' THEN <agg>(<measure>) END` SQL with one aggregate per distinct column value. Column values from our own database are safely escaped via `ActiveRecord::Base.connection.quote(v)`.

**GROUP BY ordinal positions.** The main pivot query uses `GROUP BY 1, 2, ...` ordinal positions to avoid repeating potentially complex expressions (e.g. the FY CASE WHEN). PostgreSQL supports this reliably.

**Safety cap of 500 column values.** Enforced in `PivotQueryBuilder#fetch_col_values`. No user-visible warning yet — that's M3.

**Field button labels.** The +Row / +Column action buttons in the field picker are labelled "R" and "K" (Kolom = Column in Indonesian) to keep them compact in the narrow sidebar.

**`active_outlet` in cross-tab.** Uses `COUNT(DISTINCT CASE WHEN (col_expr) = '...' THEN outlet_national_code END)` per column slot, which PostgreSQL handles correctly for count-distinct cross-tabs.

**Flat summary.** When no col_field is selected: `column_headers = []`, each row's `values` array is empty, `total` holds the single aggregate. Frontend renders a single "Nilai" (Value) column. `col_totals = [grand_total]` in this mode.

## What milestone 2 needs to know

- The `PivotQueryBuilder` has a `validate!` method — M2 should extend it to validate `filter_conditions` (field + values pairs) and the Period Filter params.
- The `execute_pivot` method currently builds the SQL without a WHERE clause. M2 will add WHERE clause construction for regular filters and the Period Filter. The method signature should gain `filter_conditions:` and `period_filter:` kwargs.
- The `fetch_col_values` method in M2 should optionally narrow by active filter conditions (dependent filtering).
- The AdminShell `full` prop is in place and tested — the Pivot page uses it.
- URL config persistence (M2): the Pivot page currently keeps all config in React state only. M2 should serialize `{ rowFields, colField, measurement, aggFunc }` into the URL query string and restore on mount; the `generate` call should happen automatically on mount when the URL has a config.
- The `generate` endpoint intentionally accepts `col_field: null` (flat summary); M2's Period Filter params will be separate required keys.

## Deviations from PRD

- PRD described field assignment via "a small popover or inline toggle". Implemented as two always-visible (on hover) "R" and "K" buttons per field row — simpler to build and works well on the narrow panel.
- PRD's description of the config panel noted "Filters zone" as out-of-scope for M1. Confirmed — no Filters zone is shown in M1.
