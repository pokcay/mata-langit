# Feature 11 — Trans SL Factory · Milestone 2: WebSocket Progress & Cancel

**Date:** 2026-05-30
**Status:** Complete

Replaces Milestone 1's static "Import Diproses" confirmation with a live,
WebSocket-driven progress view and adds per-file cancellation with full data
rollback. Built as a 1:1 port of the **Trans Sell Out Account** (Feature 7)
WebSocket + cancel implementation, which M1 explicitly designated as the
template.

## What was built

### Channel
- `app/channels/trans_sl_factory_upload_channel.rb` — mirrors
  `TransSelloutAccountUploadChannel`. `subscribed` finds the upload, authorizes
  on `upload.user == current_user` (else `reject`), `stream_for upload`, and
  immediately `transmit`s a `status_update` snapshot (`upload_id`, `status`,
  `row_count`, `error_message`).

### Job (`app/jobs/trans_sl_factory_import_job.rb`)
- Added private `broadcast(upload)` (`type: "status_update"`) and
  `broadcast_progress(upload, rows)` (`type: "progress_update"`, `progress_rows:`).
- Broadcasts on the cancelled early-return, right after flipping to
  `processing`, after each inserted batch (rolling row count), on final
  completion (`broadcast(upload.reload)`), and in the `rescue` before re-raising.
- Mid-loop cancel detection: after each `insert_all` + `broadcast_progress`, the
  job does `upload.reload`; if `cancelled?`, it `raise ActiveRecord::Rollback`,
  which unwinds the entire transaction — both the freshly-inserted rows **and**
  the `delete_all` of the prior period's rows — so a cancelled replacement keeps
  its old data intact. The `ActiveRecord::Rollback` is swallowed by the
  transaction (not re-raised), so the job ends cleanly with the upload still
  marked `cancelled` and does **not** flip it to `failed`.

### Routes + Controller
- `config/routes.rb` — added `member { patch :cancel }` to the
  `trans_sl_factory` uploads resource.
- `Admin::TransSlFactory::UploadsController#cancel` — finds the upload,
  `update!(status: "cancelled") if upload.in_flight?`, returns `head :ok`.
  Called via raw `fetch()` (not Inertia's router), so `head :ok` is correct per
  the CLAUDE.md Inertia exception.

### Frontend (`app/javascript/pages/admin/trans_sl_factory/Uploads.tsx`)
- Removed the static `submitted` / `SubmittedFile` panel and the `RotateCw`
  import; replaced with the Feature 7 live progress view:
  - New `TrackedUpload`, `StatusUpdate`, `ProgressUpdate` types; `trackedUploads`
    + `liveUploads` state; `consumer` imported from `@/lib/actioncable`.
  - Two `useEffect` ActionCable subscriptions keyed on stable id-join strings:
    one drives the per-file progress cards, one live-updates in-flight rows in
    the history table.
  - `handleConfirmImport` builds `TrackedUpload[]` from the returned `upload_ids`
    + the preview map (period label) and switches to the progress view.
  - `ProgressCard` shows filename + period, a rolling "X baris diproses…" count
    while processing, an indeterminate bar, the live `StatusBadge`, and a
    "Batalkan" button while the upload is `pending`/`processing`.
  - Final summary panel: "X berhasil, Y dibatalkan, Z gagal" + "Upload lagi"
    (resets to the idle upload view).
  - History table renders `visibleUploads` (live rows minus the ids currently in
    the progress view) so a file isn't shown twice.
  - `ProgressBar` gained an `indeterminate` variant
    (`animate-[progress-slide_…]`, same as Feature 7).

### Tests (all green)
- `test/channels/trans_sl_factory_upload_channel_test.rb` — subscribe + immediate
  transmit, cancelled-status reflection, reject for a different user, reject for
  a missing upload. Added a `cancelled` fixture to
  `test/fixtures/trans_sl_factory_uploads.yml`.
- `test/controllers/.../uploads_controller_test.rb` — `cancel` marks an in-flight
  upload cancelled; `cancel` is a no-op on a completed upload.
- `test/jobs/trans_sl_factory_import_job_test.rb` — added an **atomicity** test:
  an exception mid-import rolls back the delete + inserts and preserves the prior
  period's rows, marking the upload `failed`.
- `test/jobs/trans_sl_factory_import_job_cancel_test.rb` (new, non-transactional)
  — proves the literal "DB identical after cancel" criterion: imports a baseline
  period, then on the replacement upload commits a cancel from a **separate
  connection** (a joined `Thread`) during the first batch; asserts the upload
  ends `cancelled`, the replacement wrote zero rows, and the baseline upload's
  rows for the period are fully preserved.
- **Targeted: 19 runs, 67 assertions, 0 failures.** Full suite:
  **152 runs, 393 assertions, 0 failures, 0 errors, 0 skips.** `npm run check` clean.

## Decisions made during implementation (not pre-specified)

1. **Progress card shows a rolling row count** ("X baris diproses…") with an
   indeterminate bar, mirroring Feature 7 — confirmed with the user. This is a
   live row *count*, not a *percentage*, so it stays within the PRD's "no
   granular row-level progress percentage" exclusion.
2. **The cancel-rollback unit test runs without transactional fixtures and
   commits the cancel on a separate thread/connection.** This is the only way to
   faithfully reproduce production: in the real app the cancel is committed by a
   separate PATCH request, so the job's in-transaction `upload.reload` observes
   it and the subsequent `ActiveRecord::Rollback` undoes only the job's own
   writes. A cancel committed inside the job's transaction would be rolled back
   with it, so a same-connection stub could not prove the guarantee. The test
   scopes its teardown to its own upload filenames so it leaves the shared
   fixtures untouched.
3. **`require "minitest/mock"`** added to both job test files — `stub` is not
   loaded by the project's `test_helper` by default.

## Deviations from the PRD

- **None.** All M2 "What gets built" items are present; all three M2 exclusions
  (row-level percentage, multi-upload cancel from history, pagination/filter/sort)
  are respected.

## Verification performed

- Full `bin/rails test` (incl. the SSR smoke test) and `npm run check` both green.
- The cancel-rollback guarantee is proven by an automated test that exercises the
  real separate-connection cancel path end-to-end (job + ActionCable broadcast +
  transaction rollback), plus a transactional atomicity test for the
  prior-data-preservation property.
- **Not performed: live browser/e2e.** No browser-automation tooling
  (Playwright/agent-browser MCP) is available in this environment — confirmed via
  a tool search this session, consistent with M1. The page typechecks and is a
  line-for-line port of the proven Feature 7 WebSocket UI.

## What the next milestone (M3 — History List Management) needs to know

- `UploadsController#index` still returns all rows via `recent` (no pagination).
  M3 should add `PER_PAGE = 25`, year/month/status filters + filename search, a
  `period` composite sort, URL-reflected state, and the mobile filter/sort bottom
  sheets — all already implemented in the Feature 7 `UploadsController#index` +
  `Uploads.tsx` to copy from.
- The frontend already maintains `liveUploads` (a mutable copy of the `uploads`
  prop) and renders `visibleUploads`. M3's server-driven pagination must keep
  feeding the `uploads` prop; the existing `React.useEffect(() => setLiveUploads(uploads), [uploads])`
  will pick up each paginated page. The Feature 7 page combines pagination with
  the same live-update machinery, so port its `navigate()` + `SORT_OPTIONS` +
  filter bar wholesale.
