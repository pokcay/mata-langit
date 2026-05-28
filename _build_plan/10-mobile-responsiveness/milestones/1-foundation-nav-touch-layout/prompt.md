# Milestone 1 — Foundation: Navigation, Touch Polish, Page Layout

You are entering plan mode to plan and then build milestone 1 of **Mobile Responsiveness Overhaul**.

## Context

- Read `@_build_plan/INDEX.md` for an overview of all features in this project and what has been built so far across features.
- Read `@_build_plan/10-mobile-responsiveness/prd.md` for the full scope, affected screens, and primitives for this specific feature.
- This is milestone 1 — there are no prior milestone logs for this feature. Take care to study how `MainNav.tsx`, `AdminShell.tsx`, `AppShell.tsx`, and the existing `Dialog` primitive work before drafting your plan.

## Your task

1. Plan the implementation for **only** milestone 1 as defined in the PRD. Do not plan or build anything from later milestones. The Pivot mobile mode and the card-list / filter-sheet rollout across the seven uploads/integrity tables are explicitly out of scope for this milestone — only the foundation primitives + the full-screen mobile drawer + the page header / form layout / sticky submit pattern + the touch-target audit + the modal-as-sheet treatment belong here.
2. After the user confirms the plan, build only what is in milestone 1's scope.
3. Verify your work against the "Done when" criteria for milestone 1 in the PRD. Use the `agent-browser` skill to walk through the app at a phone-sized viewport (≈ 375 px wide) and verify the drawer, the modal-as-sheet behavior, every touched form page, and the design system's new sections.
4. When complete, write a `milestone-log.md` in this folder (`_build_plan/10-mobile-responsiveness/milestones/1-foundation-nav-touch-layout/milestone-log.md`) summarizing:
   - What was built (files created, components added, design-system sections added, primitives introduced).
   - Any decisions made during implementation that weren't pre-specified in the PRD (e.g. whether `BottomSheet` is built from scratch or layered on Vaul, how the modal-as-sheet variant is implemented in the existing `Dialog`).
   - Anything the next milestone will need to know — especially the names and import paths of new primitives so milestone 2 can reuse them without re-discovering them.
   - Any deviations from the PRD and why.
5. After writing `milestone-log.md`, update `_build_plan/INDEX.md`:
   - Change this feature's Status to `🔄 In Progress (M1/3)`.
   - Append a line to the Changelog section: `- **{YYYY-MM-DD}** — Feature 10 (Mobile Responsiveness Overhaul), Milestone 1 complete: {one-line summary}`.

Ask me any clarifying questions using AskUserQuestion tool to lock in the implementation plan for this milestone.
