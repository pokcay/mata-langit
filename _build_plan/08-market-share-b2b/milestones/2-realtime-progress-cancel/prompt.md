# Milestone 2 — Real-time Progress + Cancel

You are entering plan mode to plan and then build milestone 2 of **Market Share B2B**.

## Context

- Read `@_build_plan/INDEX.md` for an overview of all features in this project and what has been built so far across features.
- Read `@_build_plan/08-market-share-b2b/prd.md` for the full scope, data model, and feature description.
- Read `@_build_plan/08-market-share-b2b/milestones/1-template-detection-upload-pipeline/milestone-log.md` to understand what was built in milestone 1 and any notes for this milestone.

## Your task

1. Plan the implementation for **only** milestone 2 as defined in the PRD. Do not plan or build anything from milestone 3.
2. After the user confirms the plan, build only what is in milestone 2's scope.
3. Verify your work against the "Done when" criteria for milestone 2 in the PRD.
4. When complete, write a `milestone-log.md` in this folder (`_build_plan/08-market-share-b2b/milestones/2-realtime-progress-cancel/milestone-log.md`) summarizing:
   - What was built (files created/modified, channel name, broadcast message shapes, etc.)
   - Any decisions made during implementation not pre-specified in the PRD
   - Anything the next milestone will need to know
   - Any deviations from the PRD and why
5. After writing `milestone-log.md`, update `_build_plan/INDEX.md`:
   - Change this feature's Status to `🔄 In Progress (M2/3)`
   - Append a line to the Changelog section: `- **{YYYY-MM-DD}** — Feature 8 (Market Share B2B), Milestone 2 complete: {one-line summary}`

## Key implementation notes

- **Reference pattern**: Follow `app/channels/trans_sellout_account_upload_channel.rb` and the WebSocket broadcast calls in `app/jobs/trans_sellout_account_import_job.rb`.
- **Channel name**: `MarketShareB2bUploadChannel`
- **Broadcast types**: `status_update` (final state) and `progress_update` (row count during import)
- **Cancel**: `PATCH /admin/market-share-b2b/uploads/:id/cancel` marks upload "cancelled"; job detects flag between batches and raises `ActiveRecord::Rollback`
- **"Batalkan" button** in the per-file progress card (Indonesian, consistent with Trans Sell Out Account UI)

Ask me any clarifying questions using AskUserQuestion tool to lock in the implementation plan for this milestone.
