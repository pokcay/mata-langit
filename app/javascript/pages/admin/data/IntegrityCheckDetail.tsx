import * as React from "react"
import { Head, router } from "@inertiajs/react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react"
import { AdminShell } from "@/components/AdminShell"
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
import { MobileFilterSheet } from "@/components/ui/mobile-filter-sheet"
import { MobileFilterSortBar } from "@/components/ui/mobile-filter-sort-bar"
import { MobileSortSheet, type SortOption } from "@/components/ui/mobile-sort-sheet"
import { Select } from "@/components/ui/select"
import { consumer } from "@/lib/actioncable"

const RESULT_SORT_OPTIONS: SortOption[] = [
  { sort: "region", direction: "asc", label: "Region A–Z" },
  { sort: "region", direction: "desc", label: "Region Z–A" },
  { sort: "period", direction: "desc", label: "Periode terbaru" },
  { sort: "period", direction: "asc", label: "Periode terlama" },
  { sort: "sot", direction: "desc", label: "SoT tertinggi" },
  { sort: "sot", direction: "asc", label: "SoT terendah" },
  { sort: "db", direction: "desc", label: "DB tertinggi" },
  { sort: "db", direction: "asc", label: "DB terendah" },
  { sort: "delta_abs", direction: "desc", label: "Delta terbesar" },
  { sort: "delta_abs", direction: "asc", label: "Delta terkecil" },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CheckStatus = "pending" | "processing" | "completed" | "failed" | "cancelled"
type Outcome = "matched" | "mismatched" | "missing_in_db" | "extra_in_db"
type Tab = "all" | Outcome
type SortKey = "region" | "period" | "sot" | "db" | "delta_abs"

type CheckProps = {
  id: number
  filename: string
  status: CheckStatus
  period_min_year: number | null
  period_min_month: number | null
  period_max_year: number | null
  period_max_month: number | null
  total_rows_in_sot: number
  matched_count: number
  mismatched_count: number
  missing_in_db_count: number
  extra_in_db_count: number
  include_program: boolean
  total_abs_delta: number | null
  total_matched_sot: number | null
  total_missing_sot: number | null
  total_extra_db: number | null
  error_message: string | null
  checked_at: string | null
  last_rerun_at: string | null
  uploaded_by: string | null
  created_at: string
}

type ResultRow = {
  id: number
  region: string
  period_year: number
  period_month: number
  sot_netto_wise: number | null
  db_netto_wise: number | null
  delta: number | null
  outcome: Outcome
  resolved_at: string | null
}

type StatusUpdate = {
  type: "status_update"
  check_id: number
  status: CheckStatus
  matched_count: number
  mismatched_count: number
  missing_in_db_count: number
  extra_in_db_count: number
  error_message: string | null
}

type ProgressUpdate = {
  type: "progress_update"
  check_id: number
  compared: number
  total: number
}

type PageFilters = {
  search: string | null
  year: string | null
  month: string | null
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminDataIntegrityCheckDetail({
  check: initialCheck,
  results,
  total,
  page,
  per_page,
  tab,
  sort,
  direction,
  filters,
  available_years,
  available_months,
}: {
  check: CheckProps
  results: ResultRow[]
  total: number
  page: number
  per_page: number
  tab: Tab
  sort: SortKey
  direction: "asc" | "desc"
  filters: PageFilters
  available_years: number[]
  available_months: number[]
}) {
  const [check, setCheck]     = React.useState(initialCheck)
  const [compared, setCompared] = React.useState(0)
  const [rerunning, setRerunning] = React.useState(false)

  // Sync local state when Inertia partial-reload updates initialCheck (e.g. after re-run completes).
  React.useEffect(() => { setCheck(initialCheck) }, [initialCheck])

  const [searchDraft, setSearchDraft] = React.useState(filters.search ?? "")

  const TERMINAL: CheckStatus[] = ["completed", "failed", "cancelled"]
  const inFlight = !TERMINAL.includes(check.status)

  const baseUrl = `/admin/data/integrity/${check.id}`

  // Subscribe to WebSocket while check is in-flight (original check or re-run)
  React.useEffect(() => {
    if (!inFlight) return
    const sub = consumer.subscriptions.create(
      { channel: "IntegrityCheckChannel", check_id: check.id },
      {
        received(data: StatusUpdate | ProgressUpdate) {
          if (data.type === "progress_update") {
            setCompared(data.compared)
          } else {
            setCheck((prev) => ({
              ...prev,
              status:              data.status,
              matched_count:       data.matched_count,
              mismatched_count:    data.mismatched_count,
              missing_in_db_count: data.missing_in_db_count,
              extra_in_db_count:   data.extra_in_db_count,
              error_message:       data.error_message ?? null,
            }))
            if (TERMINAL.includes(data.status)) {
              router.reload({ only: ["check", "results", "total", "available_years", "available_months"] })
            }
          }
        },
      }
    )
    return () => { sub.unsubscribe() }
  }, [check.id, inFlight])

  async function handleCancel() {
    await fetch(`/admin/data/integrity/${check.id}/cancel`, {
      method:  "PATCH",
      headers: { "X-CSRF-Token": getCsrfToken() },
    })
  }

  async function handleRerun() {
    setRerunning(true)
    try {
      const resp = await fetch(`/admin/data/integrity/${check.id}/rerun`, {
        method:  "PATCH",
        headers: { "X-CSRF-Token": getCsrfToken() },
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `HTTP ${resp.status}`)
      }
      // Optimistically set status to processing so the WebSocket subscription starts
      setCheck((prev) => ({ ...prev, status: "processing" }))
      setCompared(0)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal memulai re-run.")
    } finally {
      setRerunning(false)
    }
  }

  function navigate(params: Record<string, string | number | null | undefined>) {
    const merged: Record<string, string> = {
      tab,
      sort,
      direction,
      page:   String(page),
      search: filters.search ?? "",
      year:   filters.year   ?? "",
      month:  filters.month  ?? "",
      ...Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => [k, String(v)])
      ),
    }
    const clean: Record<string, string> = {}
    for (const [k, v] of Object.entries(merged)) {
      if (v !== "") clean[k] = v
    }
    router.get(baseUrl, clean, { replace: true, preserveScroll: true })
  }

  function changeTab(t: Tab) {
    navigate({ tab: t, page: "1", search: "", year: "", month: "" })
    setSearchDraft("")
  }

  function changeSort(col: SortKey) {
    const newDir = sort === col && direction === "desc" ? "asc" : "desc"
    navigate({ sort: col, direction: newDir, page: "1" })
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    navigate({ search: searchDraft, page: "1" })
  }

  function changeYear(y: string) {
    navigate({ year: y || undefined, page: "1" })
  }

  function changeMonth(m: string) {
    navigate({ month: m || undefined, page: "1" })
  }

  const totalPages = Math.ceil(total / per_page)

  // Mobile filter / sort sheets
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [sortOpen, setSortOpen]     = React.useState(false)
  const activeFilterCount = [filters.search, filters.year, filters.month].filter(Boolean).length
  const sortLabel =
    RESULT_SORT_OPTIONS.find((o) => o.sort === sort && o.direction === direction)?.label ??
    "Urutkan"

  const periodLabel = buildPeriodLabel(
    check.period_min_year, check.period_min_month,
    check.period_max_year, check.period_max_month
  )

  return (
    <>
      <Head title={`Integrity Check — ${check.filename}`}>
        <meta name="description" content="Detail hasil integrity check data timeseries." />
        <meta property="og:title" content={`Integrity Check — ${check.filename}`} />
        <meta property="og:description" content="Detail hasil integrity check data timeseries." />
      </Head>
      <AdminShell>
        {/* Header */}
        <div className="border-b border-hairline pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate" title={check.filename}>{check.filename}</h1>
                <StatusBadge status={check.status} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                Diupload oleh {check.uploaded_by ?? "—"} ·{" "}
                {check.checked_at
                  ? `Diperiksa ${formatDate(check.checked_at)}`
                  : `Dibuat ${formatDate(check.created_at)}`}
                {periodLabel && ` · Periode: ${periodLabel}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {check.status === "completed" && (
                <a
                  href={`/admin/data/integrity/${check.id}/download`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 text-sm font-medium text-ink-body hover:bg-surface-raised"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Excel
                </a>
              )}
              {check.status === "completed" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRerun}
                  disabled={rerunning}
                >
                  {rerunning ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Memulai…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      Jalankan ulang check
                    </>
                  )}
                </Button>
              )}
              {inFlight && (
                <Button variant="secondary" size="sm" onClick={handleCancel}>
                  <Ban className="mr-1 h-4 w-4" />
                  Batalkan
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* In-flight progress */}
        {inFlight && (
          <div className="mt-6 rounded-md border border-hairline bg-surface p-4">
            <div className="flex items-center gap-2 text-ink-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">
                {check.status === "pending"
                  ? "Menunggu giliran…"
                  : compared > 0
                  ? `${compared.toLocaleString("id-ID")} baris dibandingkan…`
                  : "Memproses…"}
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-hairline">
              <div className="h-full w-1/3 animate-[progress-slide_1.4s_ease-in-out_infinite] rounded-full bg-accent" />
            </div>
          </div>
        )}

        {/* Error state */}
        {check.status === "failed" && (
          <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span className="font-medium text-ink-display">Check gagal</span>
            </div>
            {check.error_message && (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">{check.error_message}</p>
            )}
          </div>
        )}

        {/* Cancelled state */}
        {check.status === "cancelled" && (
          <div className="mt-6 rounded-md border border-hairline bg-surface p-4">
            <p className="text-sm text-ink-muted">Check ini dibatalkan. Tidak ada hasil yang disimpan.</p>
          </div>
        )}

        {/* Completed: full dashboard */}
        {check.status === "completed" && (
          <>
            {/* Summary cards */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CountCard
                label="Matched"
                value={check.matched_count}
                tone="success"
                subtitle={
                  check.matched_count > 0 && check.total_matched_sot != null
                    ? formatIDR(check.total_matched_sot)
                    : undefined
                }
              />
              <CountCard
                label="Mismatched"
                value={check.mismatched_count}
                tone={check.mismatched_count > 0 ? "danger" : "normal"}
                subtitle={
                  check.mismatched_count > 0 && check.total_abs_delta != null
                    ? formatIDR(check.total_abs_delta)
                    : undefined
                }
              />
              <CountCard
                label="Missing in DB"
                value={check.missing_in_db_count}
                tone={check.missing_in_db_count > 0 ? "warning" : "normal"}
                subtitle={
                  check.missing_in_db_count > 0 && check.total_missing_sot != null
                    ? formatIDR(check.total_missing_sot)
                    : undefined
                }
              />
              <CountCard
                label="Extra in DB"
                value={check.extra_in_db_count}
                tone={check.extra_in_db_count > 0 ? "warning" : "normal"}
                subtitle={
                  check.extra_in_db_count > 0 && check.total_extra_db != null
                    ? formatIDR(check.total_extra_db)
                    : undefined
                }
              />
            </div>

            {/* Metadata strip */}
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-ink-muted">
              <span>Total SoT rows: <strong className="text-ink-body">{check.total_rows_in_sot.toLocaleString("id-ID")}</strong></span>
              {periodLabel && <span>Periode: <strong className="text-ink-body">{periodLabel}</strong></span>}
              <span>Diupload oleh: <strong className="text-ink-body">{check.uploaded_by ?? "—"}</strong></span>
              {check.checked_at && (
                <span>Diperiksa pertama kali: <strong className="text-ink-body">{formatDate(check.checked_at)}</strong></span>
              )}
              {check.last_rerun_at && (
                <span>Terakhir di-rerun: <strong className="text-ink-body">{formatDate(check.last_rerun_at)}</strong></span>
              )}
              <span className="inline-flex items-center gap-1">
                Filter:
                <Badge tone={check.include_program ? "muted" : "accent"}>
                  {check.include_program
                    ? "termasuk data PROGRAM"
                    : "data PROGRAM di-exclude"}
                </Badge>
              </span>
            </div>

            {/* Tab strip */}
            <div className="mt-6 border-b border-hairline">
              <nav className="-mb-px flex gap-1">
                {(["mismatched", "missing_in_db", "extra_in_db", "matched", "all"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => changeTab(t)}
                    className={[
                      "whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-sm transition-colors",
                      tab === t
                        ? "border-accent font-medium text-ink-display"
                        : "border-transparent text-ink-muted hover:border-hairline hover:text-ink-body",
                    ].join(" ")}
                  >
                    {TAB_LABELS[t]}
                    {TAB_COUNT[t] !== undefined && (
                      <span className={[
                        "ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                        tab === t ? "bg-accent/15 text-accent" : "bg-hairline text-ink-muted",
                      ].join(" ")}>
                        {tabCount(check, t).toLocaleString("id-ID")}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* Filter + Sort bar (mobile) */}
            <div className="mt-4 md:hidden">
              <MobileFilterSortBar
                filterCount={activeFilterCount}
                sortLabel={sortLabel}
                onFilterClick={() => setFilterOpen(true)}
                onSortClick={() => setSortOpen(true)}
              />
            </div>

            {/* Filter bar (desktop) */}
            <div className="mt-4 hidden flex-wrap items-center gap-2 md:flex">
              <form onSubmit={submitSearch} className="flex gap-2">
                <Input
                  type="search"
                  placeholder="Cari region…"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  className="w-48"
                />
                <Button type="submit" variant="secondary" size="sm">Cari</Button>
              </form>
              <Select
                value={filters.year ?? ""}
                onChange={(e) => changeYear(e.target.value)}
                className="w-28"
              >
                <option value="">Semua tahun</option>
                {available_years.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </Select>
              <Select
                value={filters.month ?? ""}
                onChange={(e) => changeMonth(e.target.value)}
                className="w-36"
              >
                <option value="">Semua bulan</option>
                {available_months.map((m) => (
                  <option key={m} value={String(m)}>{MONTHS[m]}</option>
                ))}
              </Select>
              {(filters.search || filters.year || filters.month) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchDraft("")
                    navigate({ search: "", year: "", month: "", page: "1" })
                  }}
                >
                  Reset filter
                </Button>
              )}
            </div>

            {/* Results table */}
            <div className="mt-4">
              {results.length === 0 ? (
                <EmptyState tab={tab} />
              ) : (
                <>
                  {/* Mobile card list */}
                  <div className="space-y-3 md:hidden">
                    {results.map((row) => (
                      <ResultCard key={row.id} row={row} checkId={check.id} />
                    ))}
                  </div>

                  <div className="hidden overflow-hidden rounded-md border border-hairline md:block">
                    <table className="w-full text-sm">
                      <thead className="bg-surface">
                        <tr>
                          <SortableHeader col="region"    label="Region"         current={sort} direction={direction} onSort={changeSort} />
                          <SortableHeader col="period"    label="Periode"        current={sort} direction={direction} onSort={changeSort} />
                          <SortableHeader col="sot"       label="SoT Netto Wise" current={sort} direction={direction} onSort={changeSort} align="right" />
                          <SortableHeader col="db"        label="DB Netto Wise"  current={sort} direction={direction} onSort={changeSort} align="right" />
                          <SortableHeader col="delta_abs" label="Delta"          current={sort} direction={direction} onSort={changeSort} align="right" />
                          <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Outcome</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {results.map((row) => (
                          <ResultTableRow key={row.id} row={row} checkId={check.id} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
                      <span>
                        {((page - 1) * per_page + 1).toLocaleString("id-ID")}–
                        {Math.min(page * per_page, total).toLocaleString("id-ID")} dari{" "}
                        {total.toLocaleString("id-ID")} hasil
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={page <= 1}
                          onClick={() => navigate({ page: page - 1 })}
                        >
                          ← Prev
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={page >= totalPages}
                          onClick={() => navigate({ page: page + 1 })}
                        >
                          Next →
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Mobile filter sheet */}
            <MobileFilterSheet
              open={filterOpen}
              onOpenChange={setFilterOpen}
              initial={{
                search: filters.search ?? "",
                year: filters.year ?? "",
                month: filters.month ?? "",
              }}
              onApply={(v) => {
                setSearchDraft(v.search)
                navigate({ search: v.search, year: v.year, month: v.month, page: "1" })
                setFilterOpen(false)
              }}
              onReset={() => {
                setSearchDraft("")
                navigate({ search: "", year: "", month: "", page: "1" })
                setFilterOpen(false)
              }}
            >
              {(draft, setDraft) => (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-ink-display">Cari region</span>
                    <Input
                      type="search"
                      value={draft.search}
                      onChange={(e) => setDraft({ ...draft, search: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-ink-display">Tahun</span>
                    <Select
                      value={draft.year}
                      onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                    >
                      <option value="">Semua tahun</option>
                      {available_years.map((y) => (
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                    </Select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-ink-display">Bulan</span>
                    <Select
                      value={draft.month}
                      onChange={(e) => setDraft({ ...draft, month: e.target.value })}
                    >
                      <option value="">Semua bulan</option>
                      {available_months.map((m) => (
                        <option key={m} value={String(m)}>{MONTHS[m]}</option>
                      ))}
                    </Select>
                  </label>
                </>
              )}
            </MobileFilterSheet>

            {/* Mobile sort sheet */}
            <MobileSortSheet
              open={sortOpen}
              onOpenChange={setSortOpen}
              current={{ sort, direction }}
              options={RESULT_SORT_OPTIONS}
              onSelect={(opt) => {
                navigate({ sort: opt.sort, direction: opt.direction, page: "1" })
                setSortOpen(false)
              }}
            />
          </>
        )}
      </AdminShell>
    </>
  )
}

function ResultCard({ row, checkId }: { row: ResultRow; checkId: number }) {
  const actionable = row.outcome !== "matched"
  const returnTo   = `/admin/data/integrity/${checkId}`
  const uploadUrl  = actionable
    ? `/admin/timeseries/uploads?region=${encodeURIComponent(row.region)}&year=${row.period_year}&month=${row.period_month}&return_to=${encodeURIComponent(returnTo)}&integrity_outcome=${row.outcome}`
    : null
  const isResolved = !!row.resolved_at

  return (
    <DataCard className={isResolved ? "opacity-50" : undefined}>
      <DataCardHeader>
        <DataCardTitle>
          <span className="break-words">{row.region}</span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            {MONTHS[row.period_month]} {row.period_year}
          </span>
        </DataCardTitle>
        <DataCardStatus>
          <div className="flex flex-col items-end gap-1.5">
            <OutcomeBadge outcome={row.outcome} />
            {isResolved && (
              <Badge tone="success">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Resolved {formatDateShort(row.resolved_at!)}
              </Badge>
            )}
          </div>
        </DataCardStatus>
      </DataCardHeader>
      <DataCardGrid>
        <DataCardField
          label="SoT Netto Wise"
          value={row.sot_netto_wise != null ? formatIDR(row.sot_netto_wise) : "—"}
        />
        <DataCardField
          label="DB Netto Wise"
          value={row.db_netto_wise != null ? formatIDR(row.db_netto_wise) : "—"}
        />
        <DataCardField
          wide
          label="Delta"
          value={
            row.delta != null ? (
              <span className={row.delta !== 0 ? "font-medium text-danger-display" : ""}>
                {row.delta > 0 ? "+" : ""}
                {formatIDR(row.delta)}
              </span>
            ) : (
              <span className="text-ink-muted">—</span>
            )
          }
        />
      </DataCardGrid>
      {uploadUrl && (
        <DataCardActions>
          <a
            href={uploadUrl}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-hairline text-sm text-accent hover:bg-surface"
          >
            Upload ulang Timeseries
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </DataCardActions>
      )}
    </DataCard>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CountCard({
  label,
  value,
  tone = "normal",
  subtitle,
}: {
  label: string
  value: number
  tone?: "normal" | "success" | "danger" | "warning"
  subtitle?: string
}) {
  const valueColor = {
    normal:  "text-ink-display",
    success: "text-success",
    danger:  "text-danger-display",
    warning: "text-signal",
  }[tone]

  return (
    <div className="rounded-md border border-hairline bg-surface p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>
        {value.toLocaleString("id-ID")}
      </p>
      {subtitle && (
        <p className={`mt-0.5 text-xs tabular-nums ${valueColor} opacity-75`}>{subtitle}</p>
      )}
    </div>
  )
}

function SortableHeader({
  col,
  label,
  current,
  direction,
  onSort,
  align = "left",
}: {
  col: SortKey
  label: string
  current: SortKey
  direction: "asc" | "desc"
  onSort: (col: SortKey) => void
  align?: "left" | "right"
}) {
  const isActive = current === col
  const Icon = isActive ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th
      className={[
        "px-4 py-2.5 font-medium text-ink-muted",
        align === "right" ? "text-right" : "text-left",
      ].join(" ")}
    >
      <button
        onClick={() => onSort(col)}
        className={[
          "inline-flex items-center gap-1 hover:text-ink-display",
          isActive ? "text-ink-display" : "",
        ].join(" ")}
      >
        {align === "right" && <Icon className="h-3.5 w-3.5" />}
        {label}
        {align === "left" && <Icon className="h-3.5 w-3.5" />}
      </button>
    </th>
  )
}

function ResultTableRow({ row, checkId }: { row: ResultRow; checkId: number }) {
  const actionable = row.outcome !== "matched"
  const returnTo   = `/admin/data/integrity/${checkId}`
  const uploadUrl  = actionable
    ? `/admin/timeseries/uploads?region=${encodeURIComponent(row.region)}&year=${row.period_year}&month=${row.period_month}&return_to=${encodeURIComponent(returnTo)}&integrity_outcome=${row.outcome}`
    : null
  const isResolved = !!row.resolved_at

  return (
    <tr className={isResolved ? "opacity-50" : undefined}>
      <td className="px-4 py-3 text-ink-body">{row.region}</td>
      <td className="px-4 py-3 text-ink-body whitespace-nowrap">
        {MONTHS[row.period_month]} {row.period_year}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-body">
        {row.sot_netto_wise != null ? formatIDR(row.sot_netto_wise) : "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-body">
        {row.db_netto_wise != null ? formatIDR(row.db_netto_wise) : "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {row.delta != null ? (
          <span className={row.delta !== 0 ? "font-medium text-danger-display" : "text-ink-body"}>
            {row.delta > 0 ? "+" : ""}
            {formatIDR(row.delta)}
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <OutcomeBadge outcome={row.outcome} />
          {isResolved && (
            <Badge tone="success">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Resolved {formatDateShort(row.resolved_at!)}
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        {uploadUrl && (
          <a
            href={uploadUrl}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline whitespace-nowrap"
          >
            Upload ulang Timeseries
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </td>
    </tr>
  )
}

function OutcomeBadge({ outcome }: { outcome: ResultRow["outcome"] }) {
  switch (outcome) {
    case "matched":       return <Badge tone="success">Matched</Badge>
    case "mismatched":    return <Badge tone="danger">Mismatched</Badge>
    case "missing_in_db": return <Badge tone="signal">Missing in DB</Badge>
    case "extra_in_db":   return <Badge tone="signal">Extra in DB</Badge>
  }
}

function StatusBadge({ status }: { status: CheckStatus }) {
  switch (status) {
    case "pending":    return <Badge tone="muted"><Clock className="mr-1 h-3 w-3" />Pending</Badge>
    case "processing": return <Badge tone="accent"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Processing</Badge>
    case "completed":  return <Badge tone="success"><CheckCircle2 className="mr-1 h-3 w-3" />Selesai</Badge>
    case "failed":     return <Badge tone="danger"><XCircle className="mr-1 h-3 w-3" />Gagal</Badge>
    case "cancelled":  return <Badge tone="muted"><Ban className="mr-1 h-3 w-3" />Dibatalkan</Badge>
  }
}

function EmptyState({ tab }: { tab: Tab }) {
  if (tab === "matched" || tab === "all") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-hairline py-12 text-center">
        <CheckCircle2 className="mb-2 h-8 w-8 text-success" />
        <p className="text-sm font-medium text-ink-display">Semua data konsisten</p>
        <p className="mt-1 text-xs text-ink-muted">Tidak ada perbedaan antara SoT dan database.</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-hairline py-12 text-center">
      <CheckCircle2 className="mb-2 h-8 w-8 text-success" />
      <p className="text-sm font-medium text-ink-display">Tidak ada {TAB_LABELS[tab].toLowerCase()}</p>
      <p className="mt-1 text-xs text-ink-muted">Filter aktif tidak menghasilkan data.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_LABELS: Record<Tab, string> = {
  mismatched:    "Mismatched",
  missing_in_db: "Missing in DB",
  extra_in_db:   "Extra in DB",
  matched:       "Matched",
  all:           "Semua",
}

const TAB_COUNT: Partial<Record<Tab, true>> = {
  mismatched:    true,
  missing_in_db: true,
  extra_in_db:   true,
  matched:       true,
}

function tabCount(check: CheckProps, t: Tab): number {
  switch (t) {
    case "mismatched":    return check.mismatched_count
    case "missing_in_db": return check.missing_in_db_count
    case "extra_in_db":   return check.extra_in_db_count
    case "matched":       return check.matched_count
    default:             return 0
  }
}

const MONTHS: Record<number, string> = {
  1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "Mei", 6: "Jun",
  7: "Jul", 8: "Agu", 9: "Sep", 10: "Okt", 11: "Nov", 12: "Des",
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function getCsrfToken(): string {
  return (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content ?? ""
}

function formatIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style:                "currency",
    currency:             "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    year: "numeric", month: "short", day: "numeric",
  })
}

function buildPeriodLabel(
  minY: number | null, minM: number | null,
  maxY: number | null, maxM: number | null
): string | null {
  if (!minY || !minM) return null
  const min = `${MONTHS[minM]} ${minY}`
  if (!maxY || !maxM) return min
  const max = `${MONTHS[maxM]} ${maxY}`
  return min === max ? min : `${min} – ${max}`
}
