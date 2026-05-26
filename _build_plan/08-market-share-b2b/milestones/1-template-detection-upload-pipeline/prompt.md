# Milestone 1 — Template Detection + Upload Pipeline + Basic Import

You are entering plan mode to plan and then build milestone 1 of **Market Share B2B**.

## Context

- Read `@_build_plan/INDEX.md` for an overview of all features in this project and what has been built so far across features.
- Read `@_build_plan/08-market-share-b2b/prd.md` for the full scope, data model, known template formats, and detection fingerprints for this feature.
- This is milestone 1 — there are no prior milestone logs to read.

## Your task

1. Plan the implementation for **only** milestone 1 as defined in the PRD. Do not plan or build anything from later milestones.
2. After the user confirms the plan, build only what is in milestone 1's scope.
3. Verify your work against the "Done when" criteria for milestone 1 in the PRD.
4. When complete, write a `milestone-log.md` in this folder (`_build_plan/08-market-share-b2b/milestones/1-template-detection-upload-pipeline/milestone-log.md`) summarizing:
   - What was built (files created, models added, routes added, etc.)
   - Any decisions made during implementation that weren't pre-specified in the PRD
   - Anything the next milestone will need to know
   - Any deviations from the PRD and why
5. After writing `milestone-log.md`, update `_build_plan/INDEX.md`:
   - Change this feature's Status to `🔄 In Progress (M1/3)`
   - Append a line to the Changelog section: `- **{YYYY-MM-DD}** — Feature 8 (Market Share B2B), Milestone 1 complete: {one-line summary}`

## Key implementation notes

- **Reference pattern**: Follow `app/controllers/admin/trans_sellout_account/`, `app/jobs/trans_sellout_account_import_job.rb`, and `app/channels/trans_sellout_account_upload_channel.rb` as the closest structural reference.
- **Client-side detection**: The TypeScript parser must read sheet names and key header cell content (specific rows/cells as described in the PRD's "Known template formats" table) to fingerprint each file before upload. Use `fflate` the same way `app/frontend/lib/xlsxPreviewParser.ts` does.
- **5 template parsers in Ruby**: IDG (wide format — each month column becomes a separate DB record), IDM Reguler (multi-sheet, one sheet per category), IDM Skincare (single sheet), MIDI (9-row header, tall format), SAT (9-row header, tall format similar to MIDI).
- **Advisory lock**: Use a new advisory lock key distinct from the Timeseries one.
- **No WebSocket in M1**: Import job runs, updates the upload record, and that's it. The history table reflects final state only after a page refresh.
- **Sample data** lives in `Data/market-share-b2b/` — use it to test detection and parsing during development.

Ask me any clarifying questions using AskUserQuestion tool to lock in the implementation plan for this milestone.
