# Milestone 3 — Pivot Mobile Mode

You are entering plan mode to plan and then build milestone 3 of **Mobile Responsiveness Overhaul**.

## Context

- Read `@_build_plan/INDEX.md` for an overview of all features in this project and what has been built so far across features.
- Read `@_build_plan/10-mobile-responsiveness/prd.md` for the full scope, affected screens, and the mobile-Pivot contract for this milestone.
- Read the previous milestone logs:
  - `@_build_plan/10-mobile-responsiveness/milestones/1-foundation-nav-touch-layout/milestone-log.md` — for the `BottomSheet`, modal-as-sheet, and sticky-action-bar primitives.
  - `@_build_plan/10-mobile-responsiveness/milestones/2-data-screens-cards-and-sheets/milestone-log.md` — for any reusable utilities or layout helpers introduced when retrofitting the eight data screens.
- Read the original Pivot PRD `@_build_plan/04-pivot/prd.md` and its three milestone logs to understand exactly what the desktop Pivot does — the URL config contract, the Period Filter, the Excel export, the >100-column guard, and the SQL engine. None of that contract is allowed to change in this milestone; the mobile layout consumes the same backend and the same client-side state machine.
- Study `app/javascript/pages/admin/Pivot.tsx` end-to-end before drafting the plan. The mobile layout is a presentation layer on top of the existing config + filter + result state.

## Your task

1. Plan the implementation for **only** milestone 3 as defined in the PRD. The desktop Pivot must continue to work unchanged at `md` and above. Below `md`, the page renders the three-tab layout with a sticky Generate button, and the result table has a sticky first column and a sticky header row with compact-notation numbers that expand on tap.
2. After the user confirms the plan, build only what is in milestone 3's scope.
3. Verify your work against the "Done when" criteria for milestone 3 in the PRD. Use the `agent-browser` skill at a 375 px viewport to: build a pivot config across the three tabs; verify Generate is disabled until min requirements are met; trigger Generate and confirm it lands in Hasil with a populated table; scroll horizontally and confirm the first column stays sticky; scroll vertically and confirm the header row stays sticky; tap a cell and confirm the full numeric value is revealed; tap "Download Excel" and confirm a valid `.xlsx` downloads. Also verify the desktop layout is unchanged at `md` and above.
4. When complete, write a `milestone-log.md` in this folder (`_build_plan/10-mobile-responsiveness/milestones/3-pivot-mobile-mode/milestone-log.md`) summarizing:
   - What was built (the mobile presentation layer, any shared helpers, screenshots stored under `tmp/screenshots/`).
   - Any decisions made during implementation that weren't pre-specified in the PRD (e.g. where the Download Excel button sits on mobile, how the compact-number formatter is implemented, the exact tab transition behavior).
   - Anything a hypothetical Milestone 4 might want to revisit (e.g. animations, micro-interactions, performance with very wide pivots).
   - Any deviations from the PRD and why.
5. After writing `milestone-log.md`, update `_build_plan/INDEX.md`:
   - Change this feature's Status to `✅ Complete` (this is the final milestone).
   - Append a line to the Changelog section: `- **{YYYY-MM-DD}** — Feature 10 (Mobile Responsiveness Overhaul), Milestone 3 complete: {one-line summary}`.

Ask me any clarifying questions using AskUserQuestion tool to lock in the implementation plan for this milestone.
