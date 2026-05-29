# Milestone 3 — Pivot Mobile Mode

Completed: 2026-05-29

## Summary

Gave `/admin/pivot` a dedicated mobile presentation below `md` while leaving the
desktop two-panel layout (config sidebar + canvas) byte-identical at `md` and above.
On a phone the page is now a three-tab interface — **Konfigurasi / Filter / Hasil** —
with a sticky **Generate** button visible from every tab and a result table whose
first column and header row stay pinned while scrolling, rendering numbers in compact
Indonesian notation (Rb / Jt / M / T) that expand to the full value on tap. The whole
mobile layer is pure presentation over the existing Pivot state machine: no backend,
route, SQL-engine, Period-Filter, URL-serializer, or Excel-export contract changed.

## What was built

All changes are in a single file: **`app/javascript/pages/admin/Pivot.tsx`**.

### Shared render helpers (DRY across desktop + mobile)

Rather than duplicate ~280 lines of config markup, the inline JSX blocks were lifted
into closures defined inside `Pivot()` that close over the existing state and handlers
— so both layouts render the exact same controls with no prop threading and no second
source of truth:

- `renderZones()` — the Baris/Kolom chip zones.
- `renderMeasurement(mobile)` — the measurement radio list + aggregation `<Select>`
  (the `agg-func` element id is suffixed `-m` on mobile to avoid a duplicate-id clash,
  since both trees are in the DOM at once and toggled via CSS `display`).
- `renderPeriodFilter()` — FY / Bulan multi-selects + day-range selects.
- `renderActiveFilters()` — the per-field filter multi-selects.
- `renderFieldPicker(mobile)` — catalog status/refresh + progress bar + search +
  field-group accordions + the Filter-Only group.
- `renderResultStates(mobile)` — blank / skeleton / col-warning / error / `<PivotTable>`.
- `generateHint` — the "what's missing" hint string, shared by both Generate buttons.

The desktop block was reduced to call these helpers; the mobile tree calls the same
ones. `FieldGroupAccordion` and `FieldRow` gained a `mobile` prop: on mobile the
R / K / F assignment buttons are always visible (touch has no hover) and sized as
real `h-9 min-w-9` tap targets, and field rows get taller `py-2.5` hit areas.

### Mobile three-tab layout (`md:hidden`)

A viewport-height flex column (`h-[calc(100vh-4rem)]`, accounting for the 4rem mobile
top bar): an `sr-only` `<h1>Pivot</h1>` heading landmark, a `flex-1` equal-width tab
strip (underline-active styling mirroring `IntegrityCheckDetail`), a `min-h-0 flex-1`
tab body that mounts exactly one panel at a time, and a sticky Generate bar pinned as
the last flex child. The Hasil tab uses a `flex-col` with a non-scrolling toolbar
(row count + Download Excel) above a single `overflow-auto` scroll box that holds the
table. Tapping Generate runs the query and switches to Hasil; a complete config in the
URL seeds the initial tab to Hasil so the existing mount-time auto-run lands there.

### `PivotTable` mobile enhancements (additive `mobile?` prop)

Desktop callers are unchanged. When `mobile` is set: `<thead>` becomes `sticky top-0`;
the first row-dimension cell (header corner + each `th[scope=row]`) becomes
`sticky left-0` with an opaque background and explicit z-index layering (corner `z-30`
over header `z-20` over the body sticky column `z-10`); numeric cells render via the new
`formatCompact()`; and each numeric cell is a tap target that toggles between compact
and full (`formatNum`) via an `expanded` cell-key state.

### `formatCompact()`

New helper next to `formatNum`: Rb / Jt / M / T short scale, 1 decimal (`id-ID` comma),
sign-aware, drops the decimal at ≥ 100 of a unit, falls back to the full grouped format
below 1.000 and `"—"` for null.

## Decisions made during implementation (not pre-specified)

1. **Download Excel = pinned top toolbar** in the Hasil tab (row count left, button
   right) — confirmed with the user. It sits *outside* the table's scroll container
   (as a non-scrolling flex header) rather than being `position: sticky`, which avoids a
   stacking conflict with the `sticky` table header.
2. **Cell reveal = inline tap-toggle** (compact → full in place, tap again to collapse)
   — confirmed with the user. Robust on touch and trivially verifiable.
3. **Compact abbreviations = Rb / Jt / M / T** — confirmed with the user.
4. **Sticky Generate via flex layout, not `position: fixed`.** The mobile tree is a
   viewport-height flex column and the Generate bar is its last `shrink-0` child, so it
   is always visible and never overlaps scrolled content — simpler and more robust than
   a fixed overlay with manual bottom-padding.
5. **`sr-only` h1.** The visible chrome is the tab strip; a screen-reader/SSR `<h1>`
   landmark is kept without spending scarce vertical space on a large heading.
6. **Shared render-helper closures instead of extracted components or duplicated JSX.**
   Keeps one source of truth for every control while keeping desktop output identical.
7. **No new design-system section.** M3's PRD doesn't ask for one; the tab strip is a
   small page-local control, not a reusable primitive.

## Deviations from the PRD

None of substance. The PRD's "large chip toggle" field picker is realized with the
existing field-row + R/K/F assignment pattern (drag-and-drop is explicitly out of
scope), now always-visible and enlarged for touch — the assignment model is unchanged
from desktop, only its presentation.

## Verification

- `npm run check` — TypeScript clean.
- `ruby bin/rails test` — **114 runs, 293 assertions, 0 failures, 0 errors** (incl. the
  SSR smoke test, which exercises the rendered Pivot tree).
- Browser, Playwright at **375 × 812** `isMobile + hasTouch` (the `agent-browser` skill
  is not installed in this project; M1/M2 used Playwright directly and so does this
  milestone — script at `tmp/m3_verify.mjs`). **18/18 checks passed**, walking every
  "Done when" criterion:
  - three tabs present; Generate disabled with a "what's missing" hint on empty config.
  - built a config by tapping Region→Rows + Netto Wise in Konfigurasi and FY + month in
    Filter → Generate enabled.
  - tapping Generate switched to Hasil with a populated table.
  - a complete-config URL auto-ran and landed on Hasil.
  - on a 57-row, wide pivot (`sw 601 > cw 375`, `sh 1823 > ch 573`): first column stayed
    pinned (`x ≈ 0`) after scrolling fully right; header row stayed pinned (`y ≈ 170`)
    after scrolling to the bottom.
  - numeric cells rendered compact ("2,1 M"); tap revealed the full value
    ("2.059.423.957"); tap again collapsed back.
  - Download Excel produced a valid `.xlsx` (PK zip header, ~8 KB).
  - at 1280 px: desktop `w-72` sidebar shown, mobile tab strip absent from the a11y
    tree, numbers full (not compact).
- Screenshots under `tmp/screenshots/`: `m3_config_empty.png`, `m3_config_built.png`,
  `m3_filter.png`, `m3_hasil_flat.png`, `m3_hasil_sticky_col.png`, `m3_cell_expanded.png`,
  `m3_desktop.png`.

Note: the dev admin login `admin@test.com` had a non-seed password; it was reset to the
documented seed value `test123` to run the browser verification.

## What a hypothetical Milestone 4 might revisit

- **Tab transitions.** Tabs swap instantly (conditional mount). A horizontal
  slide/scroll animation between tabs (the PRD mentioned "sliding/scrolling") was left
  out for robustness; revisit if motion polish is wanted.
- **Very wide / very tall pivots.** The result renders the full table (the >100-column
  guard still applies server-side); for extreme pivots, windowing/virtualization of rows
  could help scroll performance on low-end phones.
- **Cell reveal UX.** Inline tap-toggle was chosen over a floating tooltip; a tooltip/
  popover variant could be revisited if simultaneous multi-cell comparison is desired.
- **Second sticky column.** Only the first row-dimension column is pinned (per PRD);
  multi-row-dimension pivots could optionally pin all dimension columns.
