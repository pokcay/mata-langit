# Milestone 1 — Upload, Preview & Import

You are entering plan mode to plan and then build milestone 1 of **Master Listing**.

## Context

- Read `@_build_plan/INDEX.md` for an overview of all features in this project and what has been built so far across features.
- Read `@_build_plan/13-master-listing/prd.md` for the full scope, data model, and tech stack for this specific feature.
- Read previous milestone logs in `@_build_plan/13-master-listing/milestones/` to understand what has already been built for this feature. If this is milestone 1, there are no prior logs to read.
- The just-shipped **Master Rental** feature (`_build_plan/12-master-rental/`, `app/lib/master_rental_file_parser.rb`, `MasterRentalImportJob`, `Admin::MasterRental::*`) is the closest reference — Master Listing mirrors it, with a simpler data model (no fixture/item column; the sheet is named `Listing Cost` and the period title is `MAY - 2026` in cell `A1`).

## Your task

1. Plan the implementation for **only** milestone 1 as defined in the PRD. Do not plan or build anything from later milestones.
2. After the user confirms the plan, build only what is in milestone 1's scope.
3. Verify your work against the "Done when" criteria for milestone 1 in the PRD.
4. When complete, write a `milestone-log.md` in this folder (`_build_plan/13-master-listing/milestones/1-upload-preview-import/milestone-log.md`) summarizing:
   - What was built (files created, models added, routes added, etc.)
   - Any decisions made during implementation that weren't pre-specified in the PRD
   - Anything the next milestone will need to know
   - Any deviations from the PRD and why
5. After writing `milestone-log.md`, update `_build_plan/INDEX.md`:
   - Change this feature's Status to `🔄 In Progress (M1/3)`
   - Append a line to the Changelog section: `- **{YYYY-MM-DD}** — Feature 13 (Master Listing), Milestone 1 complete: {one-line summary of what was delivered}`

Ask me any clarifying questions using AskUserQuestion tool to lock in the implementation plan for this milestone.
