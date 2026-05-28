import * as React from "react"
import { Trash2 } from "lucide-react"
import { SectionShell } from "@/components/design-system/SectionShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DataCard,
  DataCardActions,
  DataCardField,
  DataCardGrid,
  DataCardHeader,
  DataCardStatus,
  DataCardTitle,
} from "@/components/ui/data-card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { MobileFilterSheet } from "@/components/ui/mobile-filter-sheet"
import { MobileFilterSortBar } from "@/components/ui/mobile-filter-sort-bar"
import {
  MobileSortSheet,
  type SortOption,
} from "@/components/ui/mobile-sort-sheet"

const code = `// 1. Card list
<DataCard>
  <DataCardHeader>
    <DataCardTitle>OUTLET_DIST_JAKARTA_2025-04.xlsx</DataCardTitle>
    <DataCardStatus><Badge tone="success">Completed</Badge></DataCardStatus>
  </DataCardHeader>
  <DataCardGrid>
    <DataCardField label="Region" value="Jabodetabek" />
    <DataCardField label="Period" value="Apr 2025" />
    <DataCardField label="Rows" value="12.480" />
    <DataCardField label="Diunggah" value="Hari ini, 14:02" />
  </DataCardGrid>
  <DataCardActions>
    <Button variant="ghost" size="sm"><Trash2 className="h-4 w-4" /> Hapus</Button>
  </DataCardActions>
</DataCard>

// 2. Toolbar + sheets
<MobileFilterSortBar
  filterCount={activeFilters.length}
  sortLabel="Tanggal terbaru"
  onFilterClick={() => setFilterOpen(true)}
  onSortClick={() => setSortOpen(true)}
/>

<MobileFilterSheet
  open={filterOpen}
  onOpenChange={setFilterOpen}
  initial={{ region, status, search }}
  onApply={(values) => router.get(path, values, { preserveState: true })}
  onReset={() => router.get(path, {}, { preserveState: true })}
>
  {(draft, setDraft) => (
    <>
      <label className="block text-sm">Region
        <Select value={draft.region} onChange={...} />
      </label>
      {/* ... */}
    </>
  )}
</MobileFilterSheet>

<MobileSortSheet
  open={sortOpen}
  onOpenChange={setSortOpen}
  current={{ sort, direction }}
  options={SORT_OPTIONS}
  onSelect={(opt) => { /* router.get with opt.sort + opt.direction */ }}
/>`

const SORT_OPTIONS: SortOption[] = [
  { sort: "created_at", direction: "desc", label: "Tanggal terbaru" },
  { sort: "created_at", direction: "asc", label: "Tanggal terlama" },
  { sort: "filename", direction: "asc", label: "Filename A–Z" },
  { sort: "filename", direction: "desc", label: "Filename Z–A" },
  { sort: "row_count", direction: "desc", label: "Jumlah baris terbanyak" },
  { sort: "row_count", direction: "asc", label: "Jumlah baris paling sedikit" },
]

export function MobileDataListSection() {
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [sortOpen, setSortOpen] = React.useState(false)
  const [filters, setFilters] = React.useState({ region: "Jabodetabek", status: "", search: "" })
  const [sort, setSort] = React.useState<{ sort: string; direction: "asc" | "desc" }>({
    sort: "created_at",
    direction: "desc",
  })

  const filterCount = [filters.region, filters.status, filters.search].filter(Boolean).length
  const sortLabel =
    SORT_OPTIONS.find((o) => o.sort === sort.sort && o.direction === sort.direction)?.label ??
    "Urutkan"

  return (
    <SectionShell
      id="mobile-data-list"
      title="Mobile data list"
      description={
        <>
          The mobile presentation of any dense admin table: a vertical{" "}
          <code>&lt;DataCard&gt;</code> list, with a two-button{" "}
          <code>&lt;MobileFilterSortBar&gt;</code> that opens a{" "}
          <code>&lt;MobileFilterSheet&gt;</code> (draft → Terapkan) and a{" "}
          <code>&lt;MobileSortSheet&gt;</code> (tap-to-apply). Use the same
          state and URL query params as the desktop table so a URL pasted from
          either side restores the same view.
        </>
      }
      whenToUse={
        <ul>
          <li>Below <code>md</code> on any page that renders a multi-column table on desktop.</li>
          <li>The page's URL query string already drives filter + sort + page state.</li>
        </ul>
      }
      whenNotToUse={
        <ul>
          <li>Trivial 2-column tables that already fit at 375 px — keep them as tables.</li>
          <li>Forms or settings pages — those have their own primitives (sticky action bar, single-column layout).</li>
        </ul>
      }
      preview={
        <div className="mx-auto max-w-sm space-y-4 rounded-lg border border-hairline bg-page p-3">
          <MobileFilterSortBar
            filterCount={filterCount}
            sortLabel={sortLabel}
            onFilterClick={() => setFilterOpen(true)}
            onSortClick={() => setSortOpen(true)}
          />

          <div className="space-y-3">
            <DataCard>
              <DataCardHeader>
                <DataCardTitle>OUTLET_DIST_JAKARTA_2025-04.xlsx</DataCardTitle>
                <DataCardStatus>
                  <Badge tone="success">Completed</Badge>
                </DataCardStatus>
              </DataCardHeader>
              <DataCardGrid>
                <DataCardField label="Region" value="Jabodetabek" />
                <DataCardField label="Period" value="Apr 2025" />
                <DataCardField label="Rows" value="12.480" />
                <DataCardField label="Diunggah" value="Hari ini, 14:02" />
              </DataCardGrid>
              <DataCardActions>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Trash2 className="h-4 w-4" /> Hapus
                </Button>
              </DataCardActions>
            </DataCard>

            <DataCard>
              <DataCardHeader>
                <DataCardTitle>OUTLET_DIST_SURABAYA_2025-03.xlsx</DataCardTitle>
                <DataCardStatus>
                  <Badge tone="signal">Processing</Badge>
                </DataCardStatus>
              </DataCardHeader>
              <DataCardGrid>
                <DataCardField label="Region" value="Jawa Timur" />
                <DataCardField label="Period" value="Mar 2025" />
                <DataCardField label="Rows" value="—" />
                <DataCardField label="Diunggah" value="Hari ini, 13:55" />
              </DataCardGrid>
            </DataCard>
          </div>

          <MobileFilterSheet
            open={filterOpen}
            onOpenChange={setFilterOpen}
            initial={filters}
            onApply={(values) => {
              setFilters(values)
              setFilterOpen(false)
            }}
            onReset={() => setFilters({ region: "", status: "", search: "" })}
          >
            {(draft, setDraft) => (
              <>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-ink-display">Region</span>
                  <Select
                    value={draft.region}
                    onChange={(e) => setDraft({ ...draft, region: e.target.value })}
                  >
                    <option value="">Semua region</option>
                    <option value="Jabodetabek">Jabodetabek</option>
                    <option value="Jawa Tengah">Jawa Tengah</option>
                    <option value="Jawa Timur">Jawa Timur</option>
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-ink-display">Status</span>
                  <Select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  >
                    <option value="">Semua status</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-ink-display">Cari filename</span>
                  <Input
                    value={draft.search}
                    onChange={(e) => setDraft({ ...draft, search: e.target.value })}
                    placeholder="OUTLET_DIST..."
                  />
                </label>
              </>
            )}
          </MobileFilterSheet>

          <MobileSortSheet
            open={sortOpen}
            onOpenChange={setSortOpen}
            current={sort}
            options={SORT_OPTIONS}
            onSelect={(opt) => {
              setSort({ sort: opt.sort, direction: opt.direction })
              setSortOpen(false)
            }}
          />
        </div>
      }
      code={code}
      options={
        <ul className="list-disc pl-5">
          <li>
            <code>&lt;DataCard&gt;</code> &mdash; pass <code>onClick</code> to make the whole card tappable
            (uses <code>&lt;button&gt;</code>); omit for a static <code>&lt;article&gt;</code>.
          </li>
          <li>
            <code>&lt;DataCardField wide&gt;</code> &mdash; spans both columns of the 2-column grid for long values.
          </li>
          <li>
            <code>&lt;MobileFilterSortBar filterCount&gt;</code> &mdash; the count badge auto-hides at 0.
          </li>
          <li>
            <code>&lt;MobileFilterSheet&gt;</code> &mdash; render-prop receives <code>(draft, setDraft)</code>;
            <code>onApply</code> fires only when the user taps Terapkan. Closing via X / swipe / backdrop
            discards the draft.
          </li>
          <li>
            <code>&lt;MobileSortSheet&gt;</code> &mdash; <code>onSelect</code> fires on tap; the consumer is
            responsible for closing the sheet.
          </li>
        </ul>
      }
    />
  )
}
