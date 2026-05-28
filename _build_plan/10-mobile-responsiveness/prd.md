# Mata Langit — Mobile Responsiveness Overhaul

## What we're building

A comprehensive mobile-first and touch-first overhaul of the entire Mata Langit admin app so that every page — Dashboard, Pivot, all Uploads (Timeseries, Master Outlet Dist, Master Product Dist, Trans Sellout Account, Market Share B2B, KA Profitability), Data Integrity, Inbox, Users, Email Templates, Settings, and Profile — is comfortable to use with one thumb on a handheld screen. Navigation becomes a full-screen drawer in the style of modern mobile apps, dense tables collapse into card lists, filter and sort controls move into bottom sheets, every touch target meets a 44 px minimum, and complex screens (most notably the Pivot builder) get a dedicated mobile variant. Desktop is unchanged — this is purely about giving the existing screens an adaptive mobile presentation.

The work is delivered on the existing Rails 8 + React 19 + PostgreSQL + Inertia.js stack with Tailwind CSS v4 and the in-repo design system. No new database tables, no new external integrations. A small amount of new shared frontend infrastructure (a `BottomSheet` primitive, a responsive card-list pattern, a sticky mobile action-bar pattern) is added under `app/frontend/components/` and previewed in the design system. The build is broken into three milestones: foundation (navigation + touch polish + page-layout responsiveness), data screens (cards + filter/sort sheets across the seven uploads/integrity tables), and Pivot mobile mode.

---

### What the app does

- Opening the app on a phone shows a clean, touch-comfortable interface with a single hamburger affordance at the top-left.
- Tapping the hamburger opens a **full-screen** navigation drawer with the brand bar, every top-level menu item, every Data sub-item already expanded, badge counters for unread inbox / integrity mismatches, the account section (email, Profile, Settings, theme toggle, Sign out), and a close button.
- Tapping any menu item navigates to that route and auto-closes the drawer.
- Every page header (`<h1>` + action buttons) reflows cleanly on small screens: the title stacks above the actions; 3-plus actions collapse into a single "Aksi" dropdown.
- Every long, multi-column table on the uploads + integrity-check screens automatically becomes a vertical card list below the `md` breakpoint, with the most important field (filename / code / name) prominent at the top, status as a corner badge, secondary fields in a tidy two-column grid, and inline action buttons full-width at the bottom of the card.
- Filter and sort controls on those same screens collapse into two compact "Filter" and "Sort" buttons that open bottom sheets containing the full control set. The Filter button shows a count badge when filters are active; the Sort button shows the current sort label. URL query state stays in sync regardless of which form the user sees.
- The Pivot builder at `/admin/pivot` switches to a three-tab layout (Konfigurasi / Filter / Hasil) on phones, with a sticky "Generate" button visible from any tab and a sticky first column + sticky header row in the result table so wide pivots remain navigable.
- All form pages (Settings, Email Template edit, Inbox Show, Profile) become single-column with label-above-input layouts and a sticky bottom action bar that holds the primary submit button.
- Every modal that currently centers in the viewport switches to a full-screen sheet on phones with a tap-to-close backdrop, an X button in the corner, scrollable content, and sticky footer actions.
- Touch behavior is consistent across the app: 44 × 44 px minimum hit area on every interactive element, ≥ 16 px input text size to avoid iOS auto-zoom, correct `inputmode` / `autocomplete` per field, no sticky hover states on touch devices.

---

### Already provided by the existing codebase

- The `AdminShell` and `AppShell` layouts, including the `MainNav` sidebar with its existing (narrow) mobile drawer and hamburger trigger.
- The design system at `/admin/design-system` plus all primitives under `app/frontend/components/ui/` (`Button`, `Input`, `Select`, `Checkbox`, `Radio`, `Badge`, `Dialog`, `DropdownMenu`, `DataTable`, `ThemeToggle`).
- Tailwind CSS v4 with the `@theme` block, the `xs: 400px` custom breakpoint, and the rest of the default Tailwind breakpoint scale (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536).
- Inertia client-side routing and the shared props pattern (`current_user`, `flash`, `errors`, `admin_inbox_unread_count`, `data_integrity_mismatch_count`).
- All current route URLs, controllers, models, jobs, and WebSocket channels — none of these change.
- The base typographic system (`<h1>`–`<h6>`, `<p>`, `<a>` already styled via `design-system.css`).
- Dark mode tokens and the `ThemeToggle` component.

---

### Out of scope

- **Native mobile app or installable PWA.** No manifest, no service worker, no add-to-home-screen flow. This remains a web app accessed through the mobile browser.
- **Offline mode.** No caching of API responses for offline use.
- **Push notifications.** All notifications stay where they are today (email, in-app WebSocket toasts on open tabs).
- **Advanced gestures.** No pinch-to-zoom, double-tap-to-zoom, long-press menus, or drag-to-reorder. Only tap and the drawer/sheet swipe-to-close are supported.
- **Cutting or downgrading the desktop experience.** Desktop stays fully featured; mobile receives adaptive variants only.
- **Net-new mobile-only screens or features.** No "mobile dashboard," "upload via camera," or "share via WhatsApp." Every page is the same page, presented differently below the `md` breakpoint.
- **Visual rebrand.** Color tokens, typography, and brand stay as they are. Only layout and interaction change.
- **Bundle-size optimization, code-splitting, or image lazy-loading.** Permitted if a concrete problem appears, but not a goal.
- **Internationalization changes.** Existing mixed Indonesian + English labels are kept.
- **Full WCAG 2.1 AA accessibility audit.** Existing accessibility behavior is preserved (and improved where it is in the path of this work — e.g. modal focus traps, keyboard escape, `aria-label` on icon buttons), but a comprehensive audit is not in scope.
- **User-toggleable "force desktop view" on mobile.** Layout is purely viewport-driven.

---

### Data model

This feature is UI-only. **No database changes.** No new tables, no new columns on existing models, no migrations. All UI state (drawer open/closed, bottom-sheet open/closed, filter draft state inside a sheet) lives in React component state. The existing `localStorage` keys for sidebar collapsed-state and per-group expansion preferences are kept and respected.

---

### Affected screens (master list)

The following screens receive mobile-specific treatment as part of this PRD. Desktop layout is preserved for all of them.

**Shell-level (touches every page):**
- `MainNav` (used by both `AdminShell` and `AppShell`) — full-screen drawer
- All page headers (`<h1>` + actions pattern)
- All modal `Dialog` usages — full-screen sheet on mobile

**Admin pages with tables → card list + filter/sort bottom-sheet:**
- `/admin/timeseries/uploads`
- `/admin/master-outlet-dist/uploads`
- `/admin/master-product-dist/uploads`
- `/admin/trans-sellout-account/uploads`
- `/admin/market-share-b2b/uploads`
- `/admin/data/ka-profitability/uploads`
- `/admin/data/integrity` (history table)
- `/admin/data/integrity/:id` (detail table — mismatch / missing / extra / matched rows)

**Pivot:**
- `/admin/pivot` — three-tab mobile layout

**Form-heavy pages with sticky bottom action bar + single-column layout on mobile:**
- `/settings`
- `/admin/email-templates` and `/admin/email-templates/:id`
- `/admin/inbox` and `/admin/inbox/:id`
- `/admin/users` and `/admin/users/:id`
- `/profile` and `/profile/password`

**List/stat pages where existing grid + list patterns are double-checked:**
- `/admin` (Dashboard — stats grid + recent users list)
- `/dashboard` (user Dashboard)
- Auth pages (`/login`, `/signup`, `/passwords/new`, `/passwords/:token/edit`) — basic touch-target + 16 px input audit only.

---

### New shared frontend primitives (to be built, previewed in design system)

These primitives are introduced as part of Milestone 1 and reused in Milestones 2 and 3:

- **`<BottomSheet>`** — a slide-up sheet from the bottom of the viewport. Backdrop, body scroll-lock, swipe-down-to-close, tap-backdrop-to-close, X button, sticky header and sticky footer slots. Used by the mobile Filter, Sort, and mobile modal patterns. May be backed by an external library (Vaul or similar) if hand-built feels under-polished — that decision is the agent's call in plan mode.
- **Responsive table → card list pattern.** A reusable approach (component, render-prop helper, or convention — agent's choice in plan mode) that lets a page declare its data once and render a real `<table>` at `md` and above, or a card list below `md`. Reused by all seven uploads/integrity tables in Milestone 2.
- **Mobile sticky action bar** for forms — a small wrapper that pins the primary submit button to the bottom of the viewport on mobile with `bg-page` + top border, full-width, while leaving desktop layout unchanged.

Each new primitive gets a section under `/admin/design-system` so it is discoverable and re-usable for future features.

---

## Milestone 1 — Foundation: Navigation, Touch Polish, Page Layout

This milestone delivers the foundation that the rest of the overhaul builds on: a real mobile navigation drawer, a `BottomSheet` primitive and full-screen mobile modal pattern, an audit of every interactive element for the 44 × 44 px touch-target rule, and the responsive page-header + form-layout + sticky-submit pattern applied across the form-heavy pages. After this milestone the app already feels dramatically better on a phone even though the heavy data screens are still in their old layout.

### What gets built

**Mobile navigation (Fitur 1).**

- Hamburger trigger at the top-left in `MainNav` is resized to ≥ 44 × 44 px hit area with clear active-state visual on tap.
- Tapping it opens a full-screen drawer (not the current 64-wide one) that slides in from the left with a 200 ms animation.
- The drawer contains: a brand bar with the "M" logo, "Mata Langit" wordmark, and a close X (≥ 44 px) at the right; a vertical list of every top-level menu item where each row is ≥ 48 px tall with icon + label clearly visible and the entire row is tappable; the "Data" group is rendered in its expanded form by default on mobile so all sub-items are immediately visible with indent; badge counters for unread inbox and integrity mismatches stay in place; the account section at the bottom shows the user's email, then Profile, Settings, theme toggle (sun/moon), and Sign out as ≥ 48 px rows.
- Tap any menu item → navigate and auto-close the drawer.
- Swipe the drawer left → close. Tap the backdrop → close. Browser back button → close (history-state aware).
- Body scroll is locked while the drawer is open.
- Desktop behavior of `MainNav` (the sidebar at `lg` and above) is unchanged.

**Touch polish + modal sheet (Fitur 6).**

- New `<BottomSheet>` primitive added under `app/frontend/components/ui/bottom-sheet.tsx` (or similar) with: slide-up animation, backdrop, body lock, X button, swipe-down-to-close, sticky header/footer slots, ≥ 85% viewport max-height with scrollable interior. Available for the Filter/Sort sheets in Milestone 2 and for any other mobile-only sheet.
- The existing `Dialog` primitive gets a mobile presentation: below `md`, modals render as a full-screen sheet (sliding up from the bottom with corner radius only at the top) instead of a centered popover. Header bar with the modal title plus an X button (≥ 44 px) at the top right; content scrollable; footer actions sticky to the bottom and full-width.
- Every interactive element across the app (links, buttons, icon buttons, chips, checkboxes, radios, dropdown triggers, pagination prev/next, sort arrows in table headers, modal close buttons, hamburger, theme toggle, back buttons) is verified to meet a 44 × 44 px hit area. Visual size may stay smaller — invisible padding is used where appropriate. Adjacent tap targets keep at least 8 px between them.
- All hover-only effects across the app are guarded behind `@media (hover: hover)` so they don't fire as "sticky hover" after a tap on touch devices.

**Page layout + headers + forms (Fitur 5).**

- Every page header (`<h1>` + action buttons) reflows on mobile: title above, action buttons stacked below. If a header has 0–2 action buttons they render full-width stacked; if it has 3 or more, they collapse into a single "Aksi" dropdown trigger that opens a vertical menu with each item ≥ 48 px tall.
- Back / breadcrumb affordances (used on Email Template Show, Integrity Check Detail, etc.) appear above the title at the top of the content area on mobile, ≥ 44 × 44 px hit area.
- Form pages — Settings, Email Template edit, Inbox Show (reply UI), Users edit, Profile, Password — adopt a single-column layout below `md`, with labels above inputs and 16 px minimum input text size.
- Primary submit buttons on form pages become sticky to the bottom of the viewport on mobile with `bg-page` background, a top hairline border, and full-width primary styling. Secondary actions (Cancel, Reset) stack inline with the submit on small screens.
- Input types are corrected where wrong (`type="email"`, `type="tel"`, `type="number"`, `type="date"`) and `inputmode` / `autocomplete` attributes are added where missing.
- New primitives are documented in `/admin/design-system`: a "Bottom Sheet" section under Elements, an updated "Modal" section showing the mobile sheet variant, an updated "Page Headers" section showing the mobile stacked variant, and an updated "Forms" section showing the sticky-submit pattern.

### What milestone 1 explicitly does NOT include

- Card-list transformation of the seven uploads/integrity tables (that is Milestone 2).
- Filter and sort bottom sheets on those tables (Milestone 2).
- The Pivot mobile three-tab layout (Milestone 3).
- A full WCAG audit. Only the items above are in scope.
- Saving any UI state to the database.
- Changes to controllers, routes, jobs, or models.

### Done when

Opening the app on a phone-sized viewport (e.g. 375 px wide) shows the new full-screen drawer when the hamburger is tapped; closing the drawer via tap-item / tap-X / tap-backdrop / swipe / back-button all work. Every form page (Settings, Email Template edit, Profile, Password) shows a single-column layout with sticky submit at the bottom. Opening any existing modal on mobile shows it as a full-screen sheet rather than a centered popover. Tapping every clickable element on every screen at 375 px wide registers reliably without misfires. A check of `/admin/design-system` shows the new "Bottom Sheet" section and the updated Modal / Page Headers / Forms sections rendering correctly in both light and dark mode.

---

## Milestone 2 — Data Screens: Card Lists + Filter/Sort Bottom Sheets

This milestone applies the responsive card-list pattern and the mobile Filter/Sort bottom sheets to every dense data screen in the admin. The seven affected pages all currently render a wide multi-column table with a horizontal filter bar above it — they are the worst pages on a phone today and the biggest win from this overhaul.

### What gets built

**Responsive tables → card lists (Fitur 2).**

A responsive table → card list rendering pattern is established and applied to all of the following:

- `/admin/timeseries/uploads`
- `/admin/master-outlet-dist/uploads`
- `/admin/master-product-dist/uploads`
- `/admin/trans-sellout-account/uploads`
- `/admin/market-share-b2b/uploads`
- `/admin/data/ka-profitability/uploads`
- `/admin/data/integrity` (history table)
- `/admin/data/integrity/:id` (detail page — mismatch, missing, extra, matched tables)

For each affected screen:

- At `md` (≥ 768 px) and above, the existing table renders unchanged.
- Below `md`, every row becomes a card in a vertical list with ~12 px gap and `border-hairline` border, ~16 px internal padding:
  - The most important field for that screen is at the top of the card with `text-ink-display` (e.g. filename for the uploads pages, distributor code + period for Sellout, record-pair label for Integrity Detail).
  - The status badge (where present) sits in the top-right corner of the card with the same colors as today.
  - Secondary fields (Region, Period, Row Count, Netto, Filesize, Uploaded By, dates, etc.) render in a compact two-column grid below, with `text-ink-muted` labels and `text-ink-body` values.
  - Inline row actions (e.g. "Batalkan" while a row is processing, or "Lihat detail" for navigable rows) render as full-width tap targets at the bottom of the card with ≥ 44 px height.
  - Tapping a card's body navigates to the corresponding detail screen where the desktop row currently does so.
- Pagination stays below the list; prev/next buttons are ≥ 44 px with a clear current-page label.
- Empty state is card-friendly: large icon, primary line, secondary line, primary CTA if relevant.
- Live WebSocket updates (in-flight upload progress, status flips) continue to work in the card list — the progress bar and live counters render inside the card the same way they render inside a row on desktop.

**Filter + Sort bottom sheets (Fitur 3).**

For each of the eight affected screens above:

- Desktop: existing horizontal filter bar + sort dropdown above the table is unchanged.
- Below `md`, the filter bar is replaced by two compact controls above the card list:
  - **Filter** button with a funnel icon and a badge showing the count of active filters (omitted when zero).
  - **Sort** button with an arrow icon and the current sort label (e.g. "Tanggal ↓").
- Tapping **Filter** opens a `BottomSheet` titled "Filter" with all of that page's filter inputs stacked vertically (label above input, comfortable gap). The bottom of the sheet has a "Reset" text button on the left and a full-width primary "Terapkan" button on the right. Changes inside the sheet are draft — they apply only when "Terapkan" is tapped, and the sheet closes on apply. Tapping the X / swiping down / tapping the backdrop discards the draft and closes.
- Tapping **Sort** opens a smaller `BottomSheet` titled "Urutkan" with a vertical list of sort options. Each option is a tappable row (≥ 48 px) showing the column name and the direction (asc/desc) as a clear radio-style indicator. Tapping any option applies immediately and closes the sheet.
- URL query string stays the canonical source of filter + sort state. The mobile controls read from and write to the same URL parameters used by the desktop controls, so a URL shared between desktop and mobile restores the same state on either.
- Page count, badge counts, and live updates continue to honor the active filter as today.

### What milestone 2 explicitly does NOT include

- A user toggle between "table view" and "card view" on the same viewport — purely viewport-driven.
- Filter quick-chips outside the sheet (active filters shown as tappable removable chips above the list).
- Saved filter presets ("My uploads," "Last 7 days," etc.).
- Multi-column sort.
- Bulk select / multi-select of cards for batch actions.
- Pull-to-refresh.
- Changes to backend filter SQL or pagination logic — UI only.
- The Pivot screen (Milestone 3).

### Done when

Each of the eight affected pages, viewed at a 375 px viewport, shows a vertical card list with the right primary field, status badge, secondary grid, and inline actions instead of a horizontal-scrolling table. Tapping the Filter button opens a bottom sheet with all of that page's filter controls; choosing values and tapping "Terapkan" updates the URL and the list, and the count badge on the Filter button reflects the number of active filters. Tapping the Sort button opens a smaller bottom sheet, and choosing an option immediately re-sorts and updates the URL. Loading the resulting URL on desktop restores the same filter + sort state in the existing desktop UI.

---

## Milestone 3 — Pivot Mobile Mode

This milestone gives the Pivot builder at `/admin/pivot` a dedicated mobile presentation. The desktop two-panel layout (config left, canvas right) is unworkable on a phone; on mobile the page becomes a three-tab interface with a sticky Generate button so a user can build, filter, generate, and download a pivot entirely from their phone.

### What gets built

- At `md` and above, `/admin/pivot` renders the existing desktop layout unchanged.
- Below `md`, the page renders as three horizontal tabs at the top of the content area, sliding/scrolling between them as the active tab:
  - **Konfigurasi** — the field picker (Geography / Distribution, Product, Time, Transaction groups), a vertical scrollable list where each available field is a large chip toggle. Tapping a field assigns it to the currently selected zone (Rows, Columns, or Filters). The Rows / Columns / Filters zones each render as a clearly-titled vertical section below the field picker with the chips that have been assigned to them; tapping a chip's X removes it from that zone. The Measurement section sits at the bottom: three large radio-style choices (Netto Wise, Netto Dist, Active Outlet); when Netto Wise or Netto Dist is selected, a follow-up radio set picks the aggregation function (Sum, Count, Average, Min, Max).
  - **Filter** — the Period Filter (Fiscal Year multi-select, Month multi-select, Start Day, End Day) and the per-field regular filter controls (multi-select per active filter field), stacked vertically, each input ≥ 48 px tall with label above.
  - **Hasil** — empty state until Generate has been run: "Tap Generate untuk lihat hasil." After Generate runs, the rendered pivot table appears here.
- A **sticky "Generate" button** is fixed to the bottom of the viewport on all three tabs. It is disabled until the minimum requirements are met (at least one Row, one Measurement, and a non-empty Period Filter), with a small hint line above it stating what is missing. Tapping it runs the pivot query and switches the active tab to Hasil while the result is loading.
- The result table in Hasil:
  - Scrolls horizontally if its width exceeds the viewport.
  - First column (row-dimension labels) is sticky — fixed to the left while horizontal scroll happens — so row context is preserved.
  - Header row is sticky on vertical scroll.
  - Cell values are right-aligned. On mobile, numeric values render in compact notation (e.g. "1,2 Jt", "532 Rb") to save horizontal space; tapping a cell briefly shows the full underlying number (e.g. via a tooltip or inline expansion).
  - Row totals, column totals, and grand total are presented with bold styling consistent with the existing desktop pivot.
- A **"Download Excel"** button appears in Hasil after a successful Generate. On mobile it renders as a pinned action at the top of the Hasil tab or as a FAB at the bottom right — agent's choice in plan mode, consistent with the Fitur 5 + 6 patterns established in earlier milestones.
- URL state already serializes the full pivot config; tabs are not part of the URL (purely client UI state). Loading a URL with a complete config auto-runs the pivot, and on mobile auto-switches to Hasil after Generate completes.
- The existing >100-column warning, accessibility markup (`<th scope="row">`), and error / loading states from the desktop Pivot continue to work in mobile mode.

### What milestone 3 explicitly does NOT include

- Drag-and-drop field assignment (out of scope in the original Pivot PRD too).
- A separate bottom-sheet for the field picker — the picker stays inline inside Tab 1.
- Multi-pivot views (compare two pivots side by side on mobile).
- Mini-charts or sparklines in the mobile pivot cells.
- Cell drill-down (tapping a cell to see underlying transaction rows).
- A user toggle to force the desktop pivot layout on a mobile viewport.
- Changes to the SQL engine, the field catalog, the FY computation, the Period Filter contract, or the Excel export contract — these all stay as built in features 4.1–4.3.

### Done when

A user opening `/admin/pivot` on a 375 px viewport sees the three-tab mobile layout with a disabled Generate button at the bottom. They can build a config by tapping fields in Tab 1, set the Period Filter and any regular filters in Tab 2, and tap the sticky Generate to land in Tab 3 with a rendered pivot table. The first column of the result table stays visible while they scroll horizontally; the header row stays visible while they scroll vertically. Tapping a cell reveals the full numeric value. Tapping "Download Excel" produces the same `.xlsx` file the desktop produces today. The URL reflects the full config and reproduces the same state on desktop.
