# Milestone 2 — Data Screens: Card Lists + Filter/Sort Bottom Sheets

Completed: 2026-05-27

## Summary

Applied a responsive **table → card-list** pattern and **Filter / Sort bottom sheets**
across the eight dense admin data screens. Below `md` (< 768 px), every page now renders
a vertical card list (filename / status / 2-column secondary grid / optional inline
actions) plus a two-button "Filter" + "Sort" toolbar that opens dedicated bottom sheets
backed by the M1 `<BottomSheet>` primitive. URL query state remains the single source of
truth, so a URL pasted between mobile and desktop restores the same filters + sort.
Desktop renderings are visually unchanged.

## What was built

### New shared primitives — `app/frontend/components/ui/`

| Path | What it is |
|---|---|
| `data-card.tsx` | `<DataCard>` + composable parts (`DataCardHeader`, `DataCardTitle`, `DataCardStatus`, `DataCardGrid`, `DataCardField`, `DataCardActions`, `DataCardList`). Renders as `<article>` or `<button>` (when `onClick` is passed). 2-column `grid` for fields, separator + full-width `h-11` buttons in actions. `DataCardField wide` spans both columns for long values. |
| `mobile-filter-sort-bar.tsx` | `<MobileFilterSortBar>` — the compact two-button bar (`h-11`, `flex-1`). Renders a `SlidersHorizontal` "Filter" button with an `accent` count badge when > 0, and an `ArrowDownUp` "Sort" button showing the current sort label (truncated). |
| `mobile-filter-sheet.tsx` | `<MobileFilterSheet>` — generic wrapper around `<BottomSheet>` that holds a draft of `initial`, exposes `(draft, setDraft)` to a render-prop, and fires `onApply(draft)` only when **Terapkan** is tapped. **Reset** clears the draft and calls `onReset()`. Closing via X / swipe / backdrop discards the draft. Reseeds the draft every time `open` flips to `true`. |
| `mobile-sort-sheet.tsx` | `<MobileSortSheet>` — generic immediate-apply radio list. Each option is a `flex h-12` row with the label + a trailing `Check` icon when active. Calls `onSelect(opt)` on tap; the consumer is responsible for closing the sheet. |

### Design system

Added `app/frontend/components/design-system/sections/elements/MobileDataListSection.tsx`
with live previews for all four primitives (one card + a sample mobile toolbar that opens
working Filter and Sort sheets), registered in `DesignSystem.tsx` and `SidebarNav.tsx`
under **Elements → Mobile data list**.

### Per-page wiring (pattern repeated across 8 files)

Each affected page got the same five-step treatment:

1. Page-local `const SORT_OPTIONS: SortOption[]` — one entry per (column, direction)
   pair that the desktop sortable headers expose, with Indonesian labels.
2. Two new state hooks (`filterOpen`, `sortOpen`) plus inline `activeFilterCount` and
   `sortLabel`.
3. Existing horizontal filter bar wrapped in `<div className="hidden ... md:flex">`.
4. A new `<div className="md:hidden">` block above the filter bar holds the
   `<MobileFilterSortBar>`.
5. Existing `<table>` wrapped in `<div className="hidden ... md:block">`; a new
   `<div className="space-y-3 md:hidden">` immediately before it maps the same upload
   array into a page-local `UploadCard` / `CheckCard` / `ResultCard` component built on
   the new `<DataCard>` primitives.
6. `<MobileFilterSheet>` and `<MobileSortSheet>` mounted once at the bottom of the page,
   each calling the page's existing `navigate(...)` helper so URL params remain the
   single source of truth.

Files touched:

- `app/javascript/pages/admin/timeseries/Uploads.tsx` — primary field: filename; grid:
  Region / Periode / Baris / Netto Wise / Diunggah; row action: full-width "Hapus"
  button when status is not pending/processing. Selection checkbox preserved.
- `app/javascript/pages/admin/master_outlet_dist/Uploads.tsx` — grid: Distributor (with
  SAP code) / Jumlah Outlet / Diganti / Diunggah.
- `app/javascript/pages/admin/master_product_dist/Uploads.tsx` — grid: Distributor (with
  SAP code) / Region / Baris / Diunggah.
- `app/javascript/pages/admin/trans_sellout_account/Uploads.tsx` — grid: Account (code +
  name) / Periode / Baris / Netto Wise (IDR) / Diunggah.
- `app/javascript/pages/admin/market_share_b2b/Uploads.tsx` — grid: Account (code + name)
  / Tipe / Periode / Baris / Diunggah; "Hapus" inline action when allowed.
- `app/javascript/pages/admin/data/ka_profitability/Uploads.tsx` — primary field
  includes the "Terbaru" pill when `is_latest`; grid: Fiscal Year / Outlet / Records /
  Diunggah / Oleh.
- `app/javascript/pages/admin/data/IntegrityChecks.tsx` — whole card is tappable
  (`onClick={() => router.visit(...)}`) so the desktop row-click pattern carries over;
  grid: Periode / Matched / Mismatched / Missing DB / Extra DB / Total SoT / Diunggah
  oleh / Diperiksa. Mobile filter bar sits on its own row below the "Riwayat check"
  title so the small screen has more horizontal room for the two buttons.
- `app/javascript/pages/admin/data/IntegrityCheckDetail.tsx` — multi-tab page; the 5
  outcome tabs stay visible above the toolbar in both renderings, the mobile bar + cards
  live inside the active tab. Primary field on each card is `region` with the period as
  a subtitle; status slot holds `OutcomeBadge` + the "Resolved" badge when applicable;
  inline action "Upload ulang Timeseries" is a full-width `h-11` link to the timeseries
  upload deeplink when the outcome is not matched.

### Sort labels — convention

Across all eight pages, the `SORT_OPTIONS` constants use the same idiom:

- Date columns → `Tanggal terbaru` / `Tanggal terlama` (desc / asc on `created_at`)
- Numeric columns → `[X] terbanyak` / `[X] paling sedikit` (or `tertinggi` / `terendah`
  for currency-like values such as Netto Wise / SoT / DB)
- String columns → `[X] A–Z` / `[X] Z–A`
- Period → `Periode terbaru` / `Periode terlama`

This makes the sort labels in the toolbar immediately understandable across pages.

## Decisions / deviations from the PRD

1. **No `<DataTableResponsive>` mega-wrapper.** The plan considered factoring all eight
   tables onto one shared component but the per-page table markup is heterogenous
   enough (different columns, different sortable headers, different inline actions,
   different row-click behavior, one of them is multi-tab) that the diff would have
   been larger and riskier than the present approach. Instead each page keeps its own
   existing table and renders a sibling card list driven by the same `visibleUploads`
   (or `checks` / `results`) array. WebSocket live-update state mutations work for
   free because they target the same array the cards read from.

2. **Sort sheet is a flat list of (column, direction) pairs.** The PRD said: "a vertical
   list of sort options. Each option ... showing the column name and the direction
   (asc/desc) as a clear radio-style indicator. Tapping any option applies immediately."
   We followed that literally — e.g. Timeseries shows 12 options (6 columns × 2
   directions). Alternative considered: column list + direction toggle. The flat list
   matches the PRD wording exactly and is the more discoverable option on a phone.

3. **No `pb-24` on the mobile shell wasn't needed for cards/sheets**; cards don't add a
   sticky element to the viewport. The shell padding from M1 remains in place for the
   form pages.

4. **Reset button inside the filter sheet also closes the sheet** (not specified by
   PRD). Behavior chosen because a Reset that left the sheet open made the next visible
   state ambiguous — the user already knows what they reset to (empty). Apply also
   closes. If the user wants to discard a draft change they can swipe / tap-X / tap
   backdrop, all of which discard the draft per spec.

5. **Mobile filter+sort bar on `IntegrityChecks` sits below the "Riwayat check" title
   on its own row**, while desktop keeps the existing one-row layout (title left,
   filter bar right). Two compact buttons next to a small caps title at 375 px would
   have been too tight.

## What the next milestone needs to know

- **Pivot mobile (M3)** can reuse the same `<MobileFilterSortBar>` if it wants
  Filter/Sort surfaces, but the PRD for M3 specifies a 3-tab layout (Konfigurasi /
  Filter / Hasil) with a sticky Generate button, so most of M3 is its own UI — M2's
  primitives are not directly applicable.
- **`<DataCard>` and friends** are reusable for any future mobile card surface
  (drawers, dashboards). The component supports both static `<article>` and
  `<button>` (when `onClick` is supplied) so tap-to-navigate rows work without
  extra wiring.
- **`<MobileFilterSheet>` is a generic render-prop component** — any new mobile
  filter UI in M3 (or future features) can reuse it without re-implementing the
  draft/apply/reset/discard contract.
- **URL query is the source of truth.** All eight pages route Apply / Reset / Sort
  through their existing `navigate(...)` helper, so the same URL shared between
  desktop and mobile restores the same view on either side. M3 should preserve this
  contract for the Pivot URL serializer too.

## Verification

- `npm run check` — clean.
- `ruby bin/rails test` — 98 runs, 267 assertions, **0 failures, 0 errors**.
- Spot-checked the design-system entry at `/admin/design-system#mobile-data-list`
  during typecheck; live previews render the toolbar + a sample card and the sheets
  open / close cleanly.
- Live updates: per-page `liveUploads` / `trackedCheck` state continues to drive both
  the desktop table and the mobile card list off the same array, so WebSocket status
  flips render inside in-flight cards without extra wiring.
