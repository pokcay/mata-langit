# Milestone Log — Master Product Dist, Milestone 2

Date: 2026-05-26

## What was built

### Routes
- Added `member { patch :cancel }` to `master_product_dist/uploads` resources in `config/routes.rb`
- New URL: `PATCH /admin/master-product-dist/uploads/:id/cancel`

### Controller
- Added `cancel` action to `app/controllers/admin/master_product_dist/uploads_controller.rb`:
  - Finds upload by id, verifies ownership (`upload.user == Current.user`), returns 403 if not
  - Updates status to `"cancelled"` if currently `pending` or `processing`
  - Broadcasts current state via `MasterProductDistUploadChannel`
  - Returns `head :ok`

### Frontend
- Rewrote `app/javascript/pages/admin/master_product_dist/Uploads.tsx` to add full WebSocket progress flow:
  - **New types**: `TrackedUpload`, `StatusUpdate`, `ProgressUpdate`
  - **New imports**: `consumer` from `@/lib/actioncable`
  - **New state**: `trackedUploads` (current-session progress view), `liveUploads` (live-updates for history table rows that are in-flight from a previous session)
  - **Modified `handleConfirmImport`**: now builds `TrackedUpload[]` from server response, calls `setTrackedUploads(initial)` + `router.reload({ only: ["uploads"] })` instead of `router.visit`
  - **WebSocket subscription effect** for `trackedUploads`: per-upload `MasterProductDistUploadChannel` subscription; handles both `status_update` and `progress_update` messages; subscriptions cleaned up on unmount / when upload ids change
  - **Live-update subscription effect** for in-flight history uploads: subscribes to `MasterProductDistUploadChannel` for any upload visible in the history table that is `pending` or `processing`; updates `liveUploads` state on `status_update`
  - **`handleCancelUpload`**: fires `PATCH /admin/master-product-dist/uploads/:id/cancel` via `fetch()`
  - **`handleUploadAgain`**: clears `trackedUploads`, calls `router.reload({ only: ["uploads"] })`
  - **Computed**: `isInProgressView`, `allDone`, `successCount`, `cancelCount`, `failCount`, `trackedIds`, `visibleUploads`
  - **Updated `ProgressBar`** to support `indeterminate` prop (uses `progress-slide` animation already in design-system.css)
  - **New `ProgressCard` sub-component**: shows filename, distributor name, live progress row count, error message, status badge, "Batalkan" button for in-flight uploads, indeterminate progress bar while pending/processing
  - **Progress view section**: shown when `isInProgressView`; per-file `ProgressCard`s + final summary when `allDone` ("X berhasil, Y dibatalkan, Z gagal" + "Upload lagi" button)
  - **Header upload buttons** hidden during `isInProgressView`
  - **History table** uses `visibleUploads` (hides uploads currently shown in progress view to avoid duplication)

## Decisions made during implementation

1. **History table `liveUploads` pattern included**: Although M2 scope is primarily the progress view, live-updating history rows for in-flight uploads from previous sessions is part of the complete WebSocket integration and mirrors the Outlet Dist pattern exactly. Added at no extra complexity.

2. **Ownership check returns 403**: The cancel action checks `upload.user == Current.user` and returns `head :forbidden` rather than raising an exception, consistent with a fetch()-called endpoint (not Inertia router).

3. **No new channel needed**: `MasterProductDistUploadChannel` was already fully implemented in M1. M2 is purely a frontend addition plus the cancel endpoint.

## Deviations from PRD

None. All M2 scope delivered as specified.

## What next milestone needs to know

- **M3 (List Management)**:
  - Replace `limit(50)` in controller `index` with full pagination (25/page), filter by region + status, search by filename, sortable columns
  - Add filter/sort/pagination props to Inertia render in `index`
  - Add filter bar + sort headers + pagination controls to `Uploads.tsx`
  - The `liveUploads` + `trackedIds` / `visibleUploads` pattern is already in place and works with pagination — the `visibleUploads` filter will correctly hide tracked uploads from whatever page is currently visible
