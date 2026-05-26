# Milestone 1 Log — KA Profitability: Upload Pipeline + History Table

**Completed:** 2026-05-26

## What was built

### New files

| File | Description |
|------|-------------|
| `db/migrate/20260526600001_create_ka_profitability_tables.rb` | Creates `ka_profitability_uploads` and `ka_profitability_records` tables |
| `app/models/ka_profitability_upload.rb` | ActiveRecord model; status predicates, `in_flight?` |
| `app/models/ka_profitability_record.rb` | ActiveRecord model; `belongs_to :ka_profitability_upload` |
| `app/lib/ka_profitability_file_parser.rb` | Ruby xlsx parser — `detect` + `each_batch`; reads "Detail" sheet by name |
| `app/jobs/ka_profitability_import_job.rb` | Background import job; sets `is_latest` after transaction, no WebSocket in M1 |
| `app/controllers/admin/data/ka_profitability/uploads_controller.rb` | `index`, `preview`, `create` actions |
| `app/frontend/lib/kaProfitabilityPreviewParser.ts` | Browser-side xlsx parser using fflate |
| `app/javascript/pages/admin/data/ka_profitability/Uploads.tsx` | Inertia page — picker + preview cards + history table |
| `_build_plan/09-ka-profitability/milestones/1-upload-pipeline/milestone-log.md` | This file |

### Modified files

| File | Change |
|------|--------|
| `config/routes.rb` | Added `namespace :ka_profitability` inside `namespace :data` |
| `app/frontend/components/AdminShell.tsx` | Added "KA Profitability" sidebar entry (TrendingUp icon); also tightened "Data Integrity" match from `startsWith("/admin/data")` to `startsWith("/admin/data/integrity")` to avoid conflict |

## Route

```
GET  /admin/data/ka-profitability/uploads          → index
POST /admin/data/ka-profitability/uploads          → create
POST /admin/data/ka-profitability/uploads/preview  → preview
```

## Key decisions

### `is_latest` flag (not record deletion)
Unlike Trans Sellout / Market Share B2B which delete old records on supersede, KA Profitability
keeps all historical records. Only the `is_latest` flag is toggled. Old uploads remain in the
history table, old records stay in DB. The import job:
1. Inserts new records
2. Sets `new_upload.is_latest = true`
3. Sets all other uploads with same `fiscal_year` to `is_latest = false`

All within a single transaction with `pg_advisory_xact_lock`.

### No WebSocket in M1
The import job does not broadcast any ActionCable messages. History table is static (admin
must refresh to see status changes). M2 adds the channel and live updates.

### `index` action limits to 50 rows
No pagination in M1. The controller loads the 50 most recent uploads. M3 adds server-side
pagination with URL-reflected state.

### Data Integrity match fix
The existing "Data Integrity" nav match was `startsWith("/admin/data")` — broadened to catch
any `/admin/data/*` URL. After adding KA Profitability at `/admin/data/ka-profitability/*`,
this would have highlighted both items simultaneously. Fixed to `startsWith("/admin/data/integrity")`.

### Column detection (first 3 columns = outlet_group, level, description)
The parser assumes columns 0/1/2 are Outlet Group / Level / Description based on the PRD
description of the wide format. Column positions before the first period header are treated
as identifiers. If the real file has different ordering, the parser needs adjustment.

### Fiscal year detection
Scans the first 10 rows of the Detail sheet for a string matching `/\d{4}-\d{4}/` (e.g.
"2026-2027"). This is intentionally broad — if there are multiple such patterns in the header
area, the first match wins. If the fiscal year format differs in real files, this regex may
need tuning after testing with actual data.

## Test results

- `ruby bin/rails db:migrate` → clean
- `npm run check` → 0 TypeScript errors
- `ruby bin/rails test` → 73 runs, 0 failures, 0 errors

## What M2 needs to know

1. The import job currently has no broadcast calls. M2 adds `KaProfitabilityUploadChannel`
   and inserts `broadcast(upload)` / `broadcast_progress(upload, rows)` calls in the job.

2. The controller `create` action returns JSON with `upload_ids`. The M2 progress view
   subscribes to ActionCable for each upload_id.

3. The `cancel` action is not yet implemented. M2 adds:
   - `PATCH /admin/data/ka-profitability/uploads/:id/cancel` route
   - Controller `cancel` action that sets status to "cancelled"
   - Job checks `upload.cancelled?` before processing

4. The `KaProfitabilityUpload` model needs `in_flight?` (already present) for the cancel logic.

5. After M2 adds WebSocket, the `Uploads.tsx` page transitions from
   "redirect to history" to "stay on page with progress view".
