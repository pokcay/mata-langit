# Milestone 3 — Export & Polish: Completion Log

## What was built

### Files modified

| File | Change |
|------|--------|
| `app/lib/pivot_query_builder.rb` | Added `TooManyColumnsError` inner class, `MAX_COL_DISPLAY = 100` constant, warning check in `call` before building column aggregates |
| `app/controllers/admin/pivot_controller.rb` | Added `export` action (POST → xlsx binary via caxlsx), `build_pivot_xlsx` private helper, rescued `TooManyColumnsError` in `generate` returning `{ col_warning: }` |
| `config/routes.rb` | Added `post "pivot/export"` route (after `pivot/generate`) |
| `app/javascript/pages/admin/Pivot.tsx` | Download button in canvas header, `handleDownloadExcel` function, `downloading` state, `colWarning` state with amber warning block, `buildRequestBody` extracted helper, `<th scope="row">` for first dim cell per row, `group-focus-within:opacity-100` on R/K/F button group |
| `test/controllers/admin/pivot_controller_test.rb` | Added `require "minitest/mock"`, 3 new tests: `export` auth, `export` valid config returns xlsx, `generate` returns `col_warning` for too-many-columns |

### New route

- `POST /admin/pivot/export` — accepts same JSON body as `generate`, returns `.xlsx` binary via `send_data`

---

## Decisions made during implementation

### Server-side Excel export via POST + fetch-blob

The export is triggered by a `fetch()` POST from the frontend (same JSON body as `generate`), which returns the xlsx binary. The frontend then uses `URL.createObjectURL` + a synthetic `<a>` click to trigger the browser download. This pattern avoids re-serialising the already-in-memory result data and stays consistent with the existing `generate` POST structure.

Alternative considered: GET with URL params (same serialization as the URL config). Rejected because the GET URL would duplicate the serialization format and could hit URL length limits with many filter values.

### `buildRequestBody` extracted helper

The request body construction was previously inline in `executeGenerate`. It was extracted to `buildRequestBody` so `handleDownloadExcel` can reuse it without duplication.

### Column warning threshold: 100

`MAX_COL_DISPLAY = 100` was added alongside the existing `MAX_COL_VALUES = 500` (the SQL LIMIT ceiling). If the DISTINCT query returns >100 values, `TooManyColumnsError` is raised and the full cross-tab aggregation is skipped. The controller catches it and returns `{ col_warning: }` (422) instead of `{ error: }`, so the frontend can distinguish and render an amber warning rather than a red error.

### `colWarning` cleared on each `executeGenerate` call

The amber warning is cleared at the top of `executeGenerate` alongside `setError(null)` and `setResult(null)`, so changing the config and re-running Generate always starts with a clean canvas state.

### `stub_new` lambda pattern in tests

Minitest's `stub(name, val)` calls `val.call(args...)` if `val` responds to `call`. Using a plain Object with a `define_singleton_method(:call)` for the fake builder would cause Minitest to forward `PivotQueryBuilder.new`'s kwargs to that `call` — wrong. The fix: use a lambda as the `stub` value that accepts kwargs and returns the fake builder. Then `fake_builder.call` (no args) raises the error as intended.

### Accessibility fixes

- `PivotTable`: first dimension cell per row changed from `<td>` to `<th scope="row" className="... font-normal text-ink-body">` — `font-normal` override prevents the default bold `<th>` styling from conflicting with the design system's base layer.
- Field picker R/K/F buttons: added `group-focus-within:opacity-100` so Tab-navigating to a button row reveals the assignment controls without requiring a mouse hover.

---

## Deviations from PRD

None. All M3 "Done when" criteria are satisfied:

- Generate → "Download Excel" button appears
- Download opens correctly formatted `.xlsx` (bold headers/totals, `#,##0.00` number format)
- >100 distinct column values → amber warning shown, full query not executed
- URL copy-paste still works (URL serialization unchanged)
- Keyboard: Tab reveals R/K/F buttons via `group-focus-within`
- First row dim cell is `<th scope="row">`
