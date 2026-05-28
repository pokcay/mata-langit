# Milestone 2 — Data Screens: Card Lists + Filter/Sort Bottom Sheets

You are entering plan mode to plan and then build milestone 2 of **Mobile Responsiveness Overhaul**.

## Context

- Read `@_build_plan/INDEX.md` for an overview of all features in this project and what has been built so far across features.
- Read `@_build_plan/10-mobile-responsiveness/prd.md` for the full scope, affected screens, and primitives for this specific feature.
- Read the previous milestone log at `@_build_plan/10-mobile-responsiveness/milestones/1-foundation-nav-touch-layout/milestone-log.md` to learn the import paths and behavior of the `BottomSheet` primitive (and the modal-as-sheet pattern, sticky action bar, etc.) introduced in Milestone 1. Reuse those primitives — do not build new ones for the same job.
- Study the existing implementations of the eight affected pages (`app/javascript/pages/admin/timeseries/Uploads.tsx`, `app/javascript/pages/admin/master_outlet_dist/Uploads.tsx`, `app/javascript/pages/admin/master_product_dist/Uploads.tsx`, `app/javascript/pages/admin/trans_sellout_account/Uploads.tsx`, `app/javascript/pages/admin/market_share_b2b/Uploads.tsx`, `app/javascript/pages/admin/data/ka_profitability/Uploads.tsx`, `app/javascript/pages/admin/data/IntegrityChecks.tsx`, `app/javascript/pages/admin/data/IntegrityCheckDetail.tsx`) before drafting the plan. They share a lot of structure (filter bar, sort headers, pagination, WebSocket live updates) and the implementation should establish a reusable approach rather than rewriting the same logic eight times.

## Your task

1. Plan the implementation for **only** milestone 2 as defined in the PRD. Do not plan or build anything from milestone 3 (Pivot mobile). Establish the responsive table → card list pattern, then apply it to each of the eight affected screens. Establish the Filter and Sort bottom-sheet behavior on top of the `BottomSheet` primitive from Milestone 1, then apply that to each of the eight affected screens. URL query state remains the canonical source for filters + sort; the mobile sheets read and write the same parameters as the desktop controls.
2. After the user confirms the plan, build only what is in milestone 2's scope.
3. Verify your work against the "Done when" criteria for milestone 2 in the PRD. Use the `agent-browser` skill to walk each of the eight pages at a 375 px viewport: verify the card list renders correctly with primary field / status badge / secondary grid / inline actions; verify the Filter button opens a sheet with all controls and that "Terapkan" updates the URL + list + count badge; verify the Sort button opens a sheet and an option applies immediately; verify WebSocket live updates still flow into in-flight cards.
4. When complete, write a `milestone-log.md` in this folder (`_build_plan/10-mobile-responsiveness/milestones/2-data-screens-cards-and-sheets/milestone-log.md`) summarizing:
   - What was built (the reusable pattern, the per-page changes, any new shared components).
   - Any decisions made during implementation that weren't pre-specified in the PRD.
   - Anything the next milestone will need to know.
   - Any deviations from the PRD and why.
5. After writing `milestone-log.md`, update `_build_plan/INDEX.md`:
   - Change this feature's Status to `🔄 In Progress (M2/3)`.
   - Append a line to the Changelog section: `- **{YYYY-MM-DD}** — Feature 10 (Mobile Responsiveness Overhaul), Milestone 2 complete: {one-line summary}`.

Ask me any clarifying questions using AskUserQuestion tool to lock in the implementation plan for this milestone.
