# Milestone 2 Log — KA Profitability: Real-time Progress (WebSocket)

**Completed:** 2026-05-26

## What was built

### New files

| File | Description |
|------|-------------|
| `app/channels/ka_profitability_upload_channel.rb` | ActionCable channel; streams per-upload progress to the subscribed admin |
| `_build_plan/09-ka-profitability/milestones/2-websocket-progress/milestone-log.md` | This file |

### Modified files

| File | Change |
|------|--------|
| `app/jobs/ka_profitability_import_job.rb` | Added `broadcast` + `broadcast_progress` calls, cancel-check-with-rollback inside batch loop |
| `app/controllers/admin/data/ka_profitability/uploads_controller.rb` | Added `cancel` action (`PATCH /:id/cancel`) |
| `config/routes.rb` | Added `member { patch :cancel }` to ka_profitability uploads resource |
| `app/javascript/pages/admin/data/ka_profitability/Uploads.tsx` | Full progress view: `TrackedUpload` state, two ActionCable `useEffect` hooks (progress + live history), `ProgressCard`, summary panel, `handleCancelUpload`, `handleUploadAgain` |

## Routes added

```
PATCH /admin/data/ka-profitability/uploads/:id/cancel  → cancel
```

## Key decisions

### Cancel check inside transaction
The cancel check (`upload.reload; raise ActiveRecord::Rollback if upload.cancelled?`) is placed inside the `ActiveRecord::Base.transaction` block after each `insert_all!`. When triggered, all inserted `KaProfitabilityRecord` rows for this upload are automatically rolled back. The `is_latest` flag management also rolls back, so the previous upload for the same fiscal year retains its `is_latest = true` value — correct behavior.

### `cancelled_during_import` guard
The `update!(status: "completed")` and `is_latest` flag logic are wrapped in `unless cancelled_during_import` to prevent them from running after a rollback (since after `raise ActiveRecord::Rollback`, execution continues after the `transaction` block). This mirrors the pattern from Trans Sellout and Market Share B2B.

### Progress metric is `record_count` (rows)
`broadcast_progress` sends `progress_rows` = total `KaProfitabilityRecord` rows inserted so far. This is consistent with existing features — the frontend shows "X records diproses…" in the progress card.

### Live history row updates
The second `useEffect` subscribes to `KaProfitabilityUploadChannel` for any `pending`/`processing` rows already visible in the history table (from the `uploads` prop). This covers the case where an admin navigates back to the page mid-import.

### `visibleUploads` excludes tracked uploads
History table renders `liveUploads.filter(u => !trackedIds.has(u.id))` to prevent double-showing an upload that is already in the progress view.

## Test results

- `npm run check` → 0 TypeScript errors
- `ruby bin/rails test` → 73 runs, 0 failures, 0 errors

## What M3 needs to know

1. The `index` action still loads only the 50 most recent uploads (no pagination/filter). M3 adds server-side pagination (25/page), Status + Fiscal Year filters, and multi-column sort with URL-reflected state.

2. The `uploads` prop is a flat array with no `total`, `page`, `per_page`, or `filters` keys. M3 will add these to the Inertia props and the Uploads.tsx component signature.

3. The history table headers are plain `<th>` elements — not sortable. M3 will replace them with `SortableHeader` components.

4. `available_fiscal_years` (distinct values from DB) needs to be passed as a prop for the Fiscal Year filter dropdown. The controller will need a `distinct.pluck(:fiscal_year)` query.
