# Milestone 1 Log — Duplicate Detection & Per-File Toggle

**Completed:** 2026-05-24

---

## What was built

### Files modified

**`app/controllers/admin/timeseries/uploads_controller.rb`**
- Extended the `preview` action to return two additional fields per duplicate file:
  - `existing_netto_wise_sum` (float) — aggregate `netto_wise` of existing transactions for that region+period
  - `is_unchanged` (boolean) — `true` when both `existing_count == row_count` and `existing_netto.round(4) == netto_wise_sum.round(4)`, i.e. the file appears to be an exact re-upload
- Reused a single `scope` object for both `.count` and `.sum(:netto_wise)` to avoid duplicate queries

**`app/javascript/pages/admin/timeseries/Uploads.tsx`**
- Added `import { Checkbox } from "@/components/ui/checkbox"` — removed unused `AlertTriangle` import
- Extended the `PreviewResult` success type with `existing_netto_wise_sum?: number` and `is_unchanged?: boolean`
- Added `checkedFiles: Set<string>` state — new files start checked, duplicate files start unchecked
- Added `toggleFile(filename)` handler (immutable Set copy pattern)
- `runPreview()` initialises `checkedFiles` after each preview fetch: non-duplicate successful results are auto-checked; duplicates and error files are left unchecked
- `handleCancel()` resets `checkedFiles` to an empty Set
- `handleConfirmImport()` now filters `importFiles` down to `checkedFiles` before building FormData — only the checked subset is submitted
- "Konfirmasi Import" button is disabled when `checkedFiles.size === 0` (replaces the old `hasErrors` check)
- Removed the standalone "hasReplacements" amber warning banner — the per-card comparison makes it redundant
- `PreviewCard` now accepts `checked: boolean` and `onToggle: () => void` props:
  - Shows a `<Checkbox>` + filename label in the header
  - Card is `opacity-60` when unchecked
  - For duplicate files: shows a 3-column mini-table (Baris + Netto Wise, Sebelumnya vs File ini)
  - For unchanged duplicates: shows a `<Badge tone="muted">Tidak ada perubahan terdeteksi</Badge>` in place of the comparison table
  - For new files: shows row count + netto wise inline (as before, but now below the metadata row)

---

## Decisions made during implementation

- **Opacity instead of hiding unchecked cards.** Unchecked cards fade to `opacity-60` so the admin can still see what's excluded. Hiding them would make it unclear what was skipped.
- **`is_unchanged` computed server-side.** The frontend already receives `netto_wise_sum` and `existing_row_count`, but `existing_netto_wise_sum` is a new field queried from the DB. Computing `is_unchanged` on the backend avoids floating-point drift between Ruby Decimal and JavaScript Number arithmetic.
- **Decimal comparison uses `.round(4)`** on the Ruby `BigDecimal` to match the column's 4-decimal-place precision and avoid false "changed" results from rounding artifacts during file parsing.
- **No amber warning banner** — the PRD removed it in favour of per-card context. The comparison table on each duplicate card is the signal that data will be replaced.
- **Error cards have no checkbox** — they were never submittable, so they don't need a toggle. They use the existing `PreviewErrorCard` component unchanged.

---

## What milestone 2 will need to know

- The `checkedFiles` state lives entirely in the React component and is not sent to the server. When milestone 2 adds WebSocket progress tracking, the per-file selection is already resolved at the moment `handleConfirmImport()` fires — only checked files end up as `TimeseriesUpload` records. No backend changes are needed to accommodate this.
- The `create` action still accepts `files[]` via raw `fetch()` (not Inertia router). Milestone 2 will subscribe to an ActionCable channel immediately after the `201` response from this endpoint.
- `TimeseriesUpload.status` does not yet have a `"cancelled"` value — the migration and model validation for that are milestone 2's responsibility.

---

## Deviations from the PRD

None. All "Done when" criteria are met:
1. New file preview cards are checked by default ✓
2. Duplicate preview cards are unchecked by default ✓
3. Unchanged duplicates show "Tidak ada perubahan terdeteksi" ✓
4. Old vs new row count + netto wise comparison shown for changed duplicates ✓
5. Only checked files are submitted on confirm ✓
6. "Konfirmasi Import" is disabled when nothing is checked ✓
