# Milestone 3 Log — KA Profitability: History Filters + Pagination

**Completed:** 2026-05-26

## What was built

### Modified files

| File | Change |
|------|--------|
| `app/controllers/admin/data/ka_profitability/uploads_controller.rb` | Added `PER_PAGE`, `SORT_COLUMNS`; rewrote `index` with status/fiscal_year filters, multi-column sort, server-side pagination, and `available_fiscal_years` prop |
| `app/javascript/pages/admin/data/ka_profitability/Uploads.tsx` | Extended props type; added `navigate()` helper, filter bar, `SortableHeader` component, row-range indicator, prev/next pagination; changed `handleUploadAgain` to full `router.reload()` |

No new files, no new routes, no migrations.

## Key decisions

### Sort defaults to `created_at DESC`
When no `sort`/`direction` params are present, the controller defaults to the most recent uploads first — consistent with all other M3 features.

### `navigate()` omits default values from URL
`sort=created_at` and `direction=desc` (the defaults) are not written to the URL, keeping bookmark URLs clean. Only non-default values appear as query params.

### `handleUploadAgain` does a full `router.reload()` (no `only`)
After completing a batch of imports and clicking "Upload lagi", all props are refreshed — including `total`, `page`, `available_fiscal_years` — so the pagination indicator is accurate.

### `handleConfirmImport` keeps `only: ["uploads"]`
The partial reload immediately after queuing uploads is fine with a stale `total` because the user is about to see the progress view, not the history table.

### Fiscal Year filter hidden when no uploads exist yet
The Fiscal Year `<select>` only renders when `available_fiscal_years.length > 0`, avoiding an empty dropdown on a fresh install.

### Empty-state message distinguishes filtered vs. unfiltered
When filters are active and no rows match, the message reads "Tidak ada upload yang cocok dengan filter ini." instead of "Belum ada upload." — clearer UX.

## Test results

- `npm run check` → 0 TypeScript errors
- `ruby bin/rails test` → 73 runs, 0 failures, 0 errors
