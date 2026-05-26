# Milestone 1 — Full Feature

You are entering plan mode to plan and then build milestone 1 of **Master Outlet Dist**.

## Context

- Read `@_build_plan/INDEX.md` for an overview of all features in this project and what has been built so far.
- Read `@_build_plan/02-master-outlet-dist/prd.md` for the full scope, data model, and technical requirements for this feature.
- The **Timeseries feature** is the direct reference implementation — follow its patterns closely:
  - Models: `app/models/timeseries_upload.rb`, `app/models/timeseries_transaction.rb`
  - Parser: `app/lib/timeseries_file_parser.rb`
  - Job: `app/jobs/timeseries_import_job.rb`
  - Channel: `app/channels/timeseries_upload_channel.rb`
  - Controller: `app/controllers/admin/timeseries/uploads_controller.rb`
  - UI: `app/javascript/pages/admin/timeseries/Uploads.tsx`
  - Nav: `app/frontend/components/AdminShell.tsx`

## Key implementation notes

- The xlsx parser must open the **"OUTLET DISTRIBUTOR"** sheet (not Sheet 1). Use `book.sheets.find { |s| s.name == "OUTLET DISTRIBUTOR" }`.
- The distributor identity (`dist_sap_code`, `dist_name`) is extracted from the **first data row** of that sheet (row index 1, not the header at row index 0). Do not rely on the filename to identify the distributor.
- The unique key for duplicate detection is `dist_sap_code`. When importing, delete existing `MasterOutletDistRecord`s linked to *other* uploads for the same `dist_sap_code` (not the current upload) before inserting new ones — inside a transaction so rollback on cancel is complete.
- There is no `netto_wise_sum` equivalent. The only summary metric is `row_count` (total outlets imported).
- Routes use kebab-case in the URL: `/admin/master-outlet-dist/uploads`. In Rails, use `path: "master-outlet-dist"` on the namespace.
- The preview comparison card should show "Jumlah Outlet" (old vs. new) instead of Timeseries's "Baris" / "Netto Wise".
- The filter bar on the history table should filter by distributor name (not region + year + month). Available distributors come from `MasterOutletDistUpload.distinct.pluck(:dist_name).sort`.
- This is a Windows-compatible project. The dev server uses `.\bin\dev.ps1` (not `bin/dev`). Jobs run in-process (`:async` adapter) on Windows — no separate Solid Queue process needed.

## Your task

1. Plan the implementation for **all of** milestone 1 as defined in the PRD. Cover models, migration, parser, job, channel, controller, routes, React page, and nav.
2. After the user confirms the plan, build everything in milestone 1's scope.
3. Run `npm run check` (TypeScript) and `ruby bin/rubocop` to verify no type or lint errors.
4. Verify your work against the "Done when" criteria in the PRD.
5. When complete, write a `milestone-log.md` in this folder (`_build_plan/02-master-outlet-dist/milestones/1-full-feature/milestone-log.md`) summarizing:
   - What was built (files created, models added, routes added, etc.)
   - Any decisions made during implementation that weren't pre-specified in the PRD
   - Any deviations from the PRD and why
6. After writing `milestone-log.md`, update `_build_plan/INDEX.md`:
   - Change this feature's Status to `✅ Complete`
   - Append a line to the Changelog section: `- **{YYYY-MM-DD}** — Feature 2 (Master Outlet Dist), Milestone 1 complete: {one-line summary}`

Ask me any clarifying questions using AskUserQuestion tool to lock in the implementation plan before you start building.
