# Milestone 2 — WebSocket Progress & Cancel

You are entering plan mode to plan and then build milestone 2 of **Master Product Dist**.

## Context

- Read `@_build_plan/INDEX.md` for an overview of all features in this project and what has been built so far across features.
- Read `@_build_plan/03-master-product-dist/prd.md` for the full scope, data model, and tech stack for this specific feature.
- Read previous milestone logs in `@_build_plan/03-master-product-dist/milestones/1-upload-preview-import/milestone-log.md` to understand what was already built in milestone 1 and any implementation decisions made there.

## Your task

1. Plan the implementation for **only** milestone 2 as defined in the PRD. Do not plan or build anything from later milestones.
2. After the user confirms the plan, build only what is in milestone 2's scope.
3. Verify your work against the "Done when" criteria for milestone 2 in the PRD.
4. When complete, write a `milestone-log.md` in this folder (`_build_plan/03-master-product-dist/milestones/2-websocket-progress-cancel/milestone-log.md`) summarizing:
   - What was built (files created, models added, routes added, etc.)
   - Any decisions made during implementation that weren't pre-specified in the PRD
   - Anything the next milestone will need to know
   - Any deviations from the PRD and why
5. After writing `milestone-log.md`, update `_build_plan/INDEX.md`:
   - Change this feature's Status to `🔄 In Progress (M2/3)`
   - Append a line to the Changelog section: `- **{YYYY-MM-DD}** — Feature 3 (Master Product Dist), Milestone 2 complete: {one-line summary of what was delivered}`

## Additional context for planning

The existing `TimeseriesUploadChannel` (`app/channels/timeseries_upload_channel.rb`) and the WebSocket integration in `TimeseriesImportJob` (`app/jobs/timeseries_import_job.rb`) are the direct pattern to mirror for the ActionCable channel and the cancel-with-rollback logic. The existing frontend progress view in `app/javascript/pages/admin/timeseries/Uploads.tsx` shows exactly how the client subscribes and renders live status updates.

The key pattern: after each batch of rows inserted, the job broadcasts a progress update, then checks if status has been set to `cancelled` (by a separate cancel endpoint) and raises `ActiveRecord::Rollback` if so — this restores deleted rows for the replacement scenario.

Ask me any clarifying questions using AskUserQuestion tool to lock in the implementation plan for this milestone.
