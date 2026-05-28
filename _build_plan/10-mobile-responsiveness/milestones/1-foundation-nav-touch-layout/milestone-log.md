# Milestone 1 — Foundation: Navigation, Touch Polish, Page Layout

Completed: 2026-05-27

## Summary

Delivered the foundation primitives that the data-screen rollout (M2) and the Pivot mobile mode (M3) will build on. After this milestone the admin app already feels dramatically better on a phone: a full-screen drawer for navigation, every modal automatically rendered as a bottom sheet below `md`, every form page (Settings, Profile, Password, Email Template edit) with a sticky primary submit pinned to the viewport bottom, every iOS-zoom-triggering input bumped to 16 px, and all interactive elements meeting the 44 × 44 px touch-target rule. Desktop is visually unchanged.

## What was built

### New primitives

| Path | What it is |
|---|---|
| `app/frontend/components/ui/bottom-sheet.tsx` | New `<BottomSheet>` primitive built on Radix Dialog (no new deps). Slide-up animation, sticky header/title/body/footer slots, ≥ 44 px X close, swipe-down-to-close gesture (pointer events on the header — closes when delta > 80 px), backdrop, body scroll-lock via Radix. Will back the Filter / Sort sheets in Milestone 2. |
| `app/frontend/components/ui/mobile-sticky-action-bar.tsx` | New `<MobileStickyActionBar>` wrapper. Renders inline at `md+` (matches the existing "actions row below a form" pattern) and as a fixed bottom bar below `md` with `bg-page` + top hairline + `env(safe-area-inset-bottom)` padding. Mobile bar stacks children vertically (`flex-col [&>*]:w-full`) so it works equally well for 1 button (Settings, Profile, Password) and 3 buttons (Email Template edit). |
| `app/frontend/components/design-system/sections/elements/BottomSheetSection.tsx` | New design-system section previewing the BottomSheet primitive with a live trigger and sample code, registered in `DesignSystem.tsx` + `SidebarNav.tsx`. |

### CSS foundation (`app/frontend/styles/design-system.css`)

- **Modal-as-sheet**: the existing `.modal` class now anchors to the bottom edge below `md` (full-width, top-rounded only, `max-h-[90vh] overflow-y-auto`) and reverts to the centered popover at `md+`. Slide-up + slide-down keyframes added (`sheet-slide-up`, `sheet-slide-down`, `overlay-fade-in`, `overlay-fade-out`, `drawer-slide-in`, `drawer-slide-out`). **Every existing `<Dialog>` usage automatically gets this on mobile** — confirmed working on the Email Template Show "Send test email" + "Reset to default" dialogs.
- **`.modal-close`** bumped to `h-11 w-11` (44 × 44 px) hit area on every viewport; previously was an unsized absolute icon.
- **`.modal-header`** now reserves right padding so the X never overlaps the title.
- **`.form-control`** now uses `text-base md:text-sm` so mobile gets 17 px input text (≥ 16 px) and desktop keeps the dense 14 px. This eliminates iOS Safari's focused-input auto-zoom across every form in the app.
- **Hover-media guard**: the only non-Tailwind hover declaration in the base layer (`a:hover`) is now wrapped in `@media (hover: hover)` so it does not stick after a tap on touch devices. Tailwind v4's `hover:` variant is already hover-media-aware, so utility classes (`hover:bg-surface`, `hover:text-ink-display`, etc.) needed no changes.
- New `.bottom-sheet`, `.bottom-sheet-grabber`, `.bottom-sheet-header`, `.bottom-sheet-title`, `.bottom-sheet-body`, `.bottom-sheet-footer`, `.bottom-sheet-close` component classes for the new primitive.

### Navigation (`app/frontend/components/MainNav.tsx`)

Full mobile-drawer rewrite:

- Hamburger bumped to `h-11 w-11` (44 × 44 px).
- Drawer is now **100 vw** (full screen) instead of 64 px wide.
- Brand bar holds the "M" logo + "Mata Langit" wordmark on the left and a 44 × 44 px X close on the right.
- Nav body shows every top-level item as a ≥ 48 px row with icon + label. Inside the body the `Data` group is rendered in always-expanded form on mobile (so every sub-item — Timeseries, Master Outlet Dist, Master Product Dist, Trans Sellout Account, Market Share B2B, KA Profitability, Pivot, Data Integrity — is reachable in one tap). Badge counters for Inbox + Data Integrity preserved.
- Account block at the bottom shows the user's email + avatar, then `Profile`, `Settings`, `Admin area` (when admin), the `<ThemeToggle block />`, and `Sign out` — every row ≥ 48 px.
- Tap any nav item → drawer closes + navigates.
- Tap backdrop → closes. Tap X → closes. Browser back button → closes (history-state aware via a pushed `main-nav-drawer-open` state).
- Swipe left (with vertical delta < 40 px) → closes.
- Body scroll is locked while the drawer is open.
- Desktop sidebar (`lg+`) is unchanged — same collapsed/expanded states, same per-group localStorage memory.

### Page header (`app/frontend/components/PageHeader.tsx`)

- Added optional `backHref` + `backLabel` props. Below `sm` they render as a ≥ 44 px tap-area `<Link>` with `ArrowLeft` above the title; at `sm+` they render as a smaller text-link above the title.
- Added support for `actions={[...]}` as an array of `PageHeaderAction` descriptors. When the array has ≥ 3 items, the actions collapse into a single full-width "Aksi" `DropdownMenu` trigger below `sm` while staying as individual buttons at `sm+`. JSX-style `actions={<>...</>}` callers still work as before (handled by the existing `flex-col gap-4 sm:flex-row` layout).

### Form pages

Pages where the primary submit is now wrapped in `<MobileStickyActionBar>`:

- `app/javascript/pages/Settings.tsx` — single "Simpan preferensi" button.
- `app/javascript/pages/profile/Details.tsx` — single "Update email" button. Also added `inputMode="email"` on the email input.
- `app/javascript/pages/profile/Password.tsx` — single "Update password" button.
- `app/javascript/pages/admin/email-templates/Show.tsx` — three-button action row (Save / Send test email / Reset to default). Also moved the desktop-only "← All templates" link into a ≥ 44 px back link visible above the title on mobile.

Pages where a small mobile back affordance was added (no submit wrapping needed):

- `app/javascript/pages/admin/inbox/Show.tsx` — "← Inbox" link bumped to a ≥ 44 px tap area with an `ArrowLeft` icon.

### Shells

- `app/frontend/components/AdminShell.tsx` and `app/frontend/components/AppShell.tsx` now apply `pb-24 lg:pb-8` on `<main>` so the fixed sticky action bar never covers the last form field on mobile.

### Design system

Registered the new "Bottom sheet" section under Elements and updated three existing sections with mobile previews:

- `ModalSection.tsx` — description now states that every modal becomes a sheet below `md`, plus a 375 px-frame preview of the mobile sheet shape.
- `PageHeadersSection.tsx` — two new mobile previews: "title above stacked actions with back link" and "3+ actions collapse into Aksi dropdown".
- `FormsSection.tsx` — new mobile preview frame showing the single-column form with the sticky submit pinned to the viewport bottom (plus prose pointing to `<MobileStickyActionBar>`).
- `BottomSheetSection.tsx` — new section with a live trigger, sample code, options reference.

### Touch-target & misc polish

- DesignSystem internal hamburger + close bumped to `h-11 w-11` (44 × 44 px).
- Modal close button bumped (CSS).
- Email Template Show pages no longer rely on a `text-sm` shrink link on mobile for "back to list" — the ≥ 44 px back link is now the primary affordance.

## Decisions / deviations from the PRD

1. **BottomSheet on Radix Dialog (not Vaul).** The PRD's primitive paragraph said the agent could pick Vaul or hand-built. We picked Radix Dialog since `@radix-ui/react-dialog` is already a dependency — we get the focus trap, escape-to-close, backdrop-click, body scroll-lock for free, and layer swipe-down-to-close + slide-up animation on top in ~140 LoC. No new dependencies.

2. **Modal-as-sheet is automatic via CSS, not opt-in.** The plan called for CSS-only at the existing `.modal` class so every Dialog usage gets it without code changes. Verified: the two existing dialogs on `/admin/email-templates/:id` (Send test, Reset to default) render as bottom sheets on mobile with no call-site changes.

3. **MobileStickyActionBar stacks vertically on mobile** (`flex-col [&>*]:w-full`) rather than putting all buttons side-by-side on one row. The PRD's "stack inline with the submit on small screens" left it ambiguous; the side-by-side approach overflowed the 375 px viewport for the 3-button Email Template Show case. The vertical stack works cleanly for 1 / 2 / 3 buttons and matches the design-system preview.

4. **Drawer full-screen (100 vw)** with no visible backdrop strip — per the locked-in design decision. Closing is via tap-X, tap-the-now-1px-backdrop, browser back, swipe-left, or selecting a nav item.

5. **No Tailwind v4 hover-media migration of every utility class.** Tailwind v4's `hover:` variant is already wrapped in `@media (hover: hover)` by default, so blanket utility usage is fine. We only guarded the one non-Tailwind base-layer rule (`a:hover`) explicitly.

6. **No `agent-browser` skill** is installed in this project. Used playwright directly (already a dev dep) at a 375 × 812 viewport with `isMobile + hasTouch`. Screenshots are under `tmp/screenshots/m1_*.png` (drawer open, settings sticky submit, profile/password, email template show, modal-as-sheet, plus desktop spot-checks).

## What the next milestone needs to know

- **Filter / Sort bottom sheets in M2** should use `<BottomSheet>` from `@/components/ui/bottom-sheet`. The grabber + the header double as the swipe-to-close handle (`data-bottom-sheet-handle`). `BottomSheetFooter` already applies `env(safe-area-inset-bottom)` padding — drop a "Reset" ghost button + a `flex-1` "Terapkan" primary inside it.
- **The data screens already use a full-width inline filter bar.** M2 needs to replace that, below `md` only, with two compact buttons ("Filter" + "Sort") and the existing controls inside two separate `<BottomSheet>` instances.
- **`<MobileStickyActionBar>`** can be re-used for the "Terapkan" footer pattern, but `BottomSheetFooter` is the better primitive for sheets.
- **`AdminShell` already pads `pb-24 lg:pb-8`** on mobile so a sticky element at the bottom of the viewport won't cover content. If M2's card-list pages add any sticky overlay (e.g. a multi-select bulk-action bar), there's already room.
- **Modal sheet behaviour is purely CSS-driven.** Any new `<Dialog>` introduced in M2/M3 gets the mobile sheet variant automatically — no `mobile="sheet"` prop needed.
- **The mobile drawer is in `MainNav.tsx`.** If M2/M3 needs to add a deep-link to a per-feature setting, just add it to the nav-items array passed into `<MainNav items={...} />` from the shell — the mobile drawer auto-expands groups.
- **All form pages still single-column under `md`** because of the design-system base rules. M3's Pivot mobile mode can rely on that without re-asserting it per-field.
