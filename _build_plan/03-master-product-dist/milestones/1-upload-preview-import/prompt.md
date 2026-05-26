# Milestone 1 — Upload, Preview & Import Dasar

You are entering plan mode to plan and then build milestone 1 of **Master Product Dist**.

## Context

- Read `@_build_plan/INDEX.md` for an overview of all features in this project and what has been built so far across features.
- Read `@_build_plan/03-master-product-dist/prd.md` for the full scope, data model, and tech stack for this specific feature.
- Read previous milestone logs in `@_build_plan/03-master-product-dist/milestones/` to understand what has already been built for this feature. If this is milestone 1, there are no prior logs to read.

## Your task

1. Plan the implementation for **only** milestone 1 as defined in the PRD. Do not plan or build anything from later milestones.
2. After the user confirms the plan, build only what is in milestone 1's scope.
3. Verify your work against the "Done when" criteria for milestone 1 in the PRD.
4. When complete, write a `milestone-log.md` in this folder (`_build_plan/03-master-product-dist/milestones/1-upload-preview-import/milestone-log.md`) summarizing:
   - What was built (files created, models added, routes added, etc.)
   - Any decisions made during implementation that weren't pre-specified in the PRD
   - Anything the next milestone will need to know
   - Any deviations from the PRD and why
5. After writing `milestone-log.md`, update `_build_plan/INDEX.md`:
   - Change this feature's Status to `🔄 In Progress (M1/3)`
   - Append a line to the Changelog section: `- **{YYYY-MM-DD}** — Feature 3 (Master Product Dist), Milestone 1 complete: {one-line summary of what was delivered}`

## Additional context for planning

The existing Timeseries Uploads feature (`app/models/timeseries_upload.rb`, `app/models/timeseries_transaction.rb`, `app/jobs/timeseries_import_job.rb`, `app/lib/timeseries_file_parser.rb`, `app/controllers/admin/timeseries/uploads_controller.rb`, `app/channels/timeseries_upload_channel.rb`) is the direct pattern to mirror. Read those files before planning — the architecture is nearly identical, with these key differences:

- **Filename pattern**: `PRODUCT_DIST_{distributor_name_slug}.xlsx` (no region or period in filename)
- **Sheet to parse**: `PRODUCT DIST` (not the first/default sheet)
- **Unique key**: `distributor_sap_code` (replaces the `region + period_year + period_month` key used by Timeseries)
- **Data columns**: 54 columns as described in the PRD data model — read the actual file at `Data/master-product-dist/PRODUCT_DIST_eka_jaya_putra_makmur_semarang.xlsx` to get exact header strings for the column map
- **No schema variants**: unlike Timeseries (4 schema variants), PRODUCT DIST has a single consistent schema across all distributor files
- **No netto_wise aggregate**: the data rows table does not have a numeric aggregate equivalent to `netto_wise`; use `row_count` only

Ask me any clarifying questions using AskUserQuestion tool to lock in the implementation plan for this milestone.
