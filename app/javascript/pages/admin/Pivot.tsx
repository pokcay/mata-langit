import { useState, useMemo, useEffect, useRef } from "react"
import { Head } from "@inertiajs/react"
import { AlertCircle, ChevronDown, ChevronRight, FileDown, Loader2, RefreshCw, TriangleAlert, X } from "lucide-react"
import { AdminShell } from "@/components/AdminShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { consumer } from "@/lib/actioncable"

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

type FieldDef = { key: string; label: string }
type FieldGroup = { label: string; fields: FieldDef[] }

const DIMENSION_GROUPS: FieldGroup[] = [
  {
    label: "Geography / Distribution",
    fields: [
      { key: "region", label: "Region" },
      { key: "region_name", label: "Region name" },
      { key: "area_name", label: "Area" },
      { key: "area_sub_name", label: "Sub-area" },
      { key: "channel_code", label: "Channel group" },
      { key: "channel_sub_code", label: "Channel sub-code" },
      { key: "outlet_national_group", label: "Outlet national group" },
    ],
  },
  {
    label: "Product",
    fields: [
      { key: "category_sub_name", label: "Category" },
      { key: "brand_group_name", label: "Brand group" },
      { key: "brand_name", label: "Brand" },
      { key: "range_name", label: "Range" },
    ],
  },
  {
    label: "Time",
    fields: [
      { key: "FY", label: "Fiscal Year (FY)" },
      { key: "period_year", label: "Year" },
      { key: "period_month", label: "Month" },
    ],
  },
  {
    label: "Transaction",
    fields: [
      { key: "type_transaction", label: "Transaction type" },
    ],
  },
]

const FILTER_ONLY_FIELDS: FieldDef[] = [{ key: "flag_program", label: "Program Flag" }]

const ALL_FIELDS: FieldDef[] = [
  ...DIMENSION_GROUPS.flatMap((g) => g.fields),
  ...FILTER_ONLY_FIELDS,
]

const MEASUREMENTS = [
  { key: "netto_wise", label: "Netto Wise", supportsAgg: true },
  { key: "netto_dist", label: "Netto Dist", supportsAgg: true },
  { key: "active_outlet", label: "Active Outlet", supportsAgg: false },
] as const

type MeasurementKey = (typeof MEASUREMENTS)[number]["key"]

const AGG_FUNCS = [
  { key: "sum", label: "Sum" },
  { key: "count", label: "Count" },
  { key: "avg", label: "Average" },
  { key: "min", label: "Min" },
  { key: "max", label: "Max" },
]

const MONTH_OPTIONS: MultiSelectOption[] = [
  { value: "1", label: "Jan" },
  { value: "2", label: "Feb" },
  { value: "3", label: "Mar" },
  { value: "4", label: "Apr" },
  { value: "5", label: "Mei" },
  { value: "6", label: "Jun" },
  { value: "7", label: "Jul" },
  { value: "8", label: "Agu" },
  { value: "9", label: "Sep" },
  { value: "10", label: "Okt" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Des" },
]

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PeriodFilter = {
  fys: string[]
  months: number[]
  startDay: number
  endDay: number | "eom"
}

type FilterCondition = { field: string; values: string[] }

type MultiSelectOption = { value: string; label: string }

type PivotRow = {
  dims: (string | null)[]
  values: (number | null)[]
  total: number
}

type PivotResult = {
  column_levels: string[][]   // one array per col field level
  column_combos: string[][]   // cartesian product of all level values
  rows: PivotRow[]
  col_totals: number[]
  grand_total: number
  row_field_count: number
}

type PivotConfig = {
  rowFields: string[]
  colFields: string[]
  measurement: MeasurementKey | null
  aggFunc: string
  periodFilter: PeriodFilter
  filters: FilterCondition[]
}

type CatalogStatus = {
  total: number
  ready: number
  building: boolean
  refreshed_at: string | null
  pct: number
}

const DEFAULT_PERIOD_FILTER: PeriodFilter = { fys: [], months: [], startDay: 1, endDay: "eom" }

// ---------------------------------------------------------------------------
// URL serialization
// ---------------------------------------------------------------------------

function serializeConfig(cfg: PivotConfig): string {
  const p = new URLSearchParams()
  cfg.rowFields.forEach((f) => p.append("rows", f))
  cfg.colFields.forEach((f) => p.append("col", f))
  if (cfg.measurement) p.set("m", cfg.measurement)
  p.set("agg", cfg.aggFunc)
  cfg.periodFilter.fys.forEach((fy) => p.append("pfy", fy))
  cfg.periodFilter.months.forEach((m) => p.append("pm", String(m)))
  p.set("ps", String(cfg.periodFilter.startDay))
  p.set("pe", cfg.periodFilter.endDay === "eom" ? "eom" : String(cfg.periodFilter.endDay))
  cfg.filters.forEach(({ field, values }) => {
    values.forEach((v) => p.append(`f_${field}`, v))
  })
  return p.toString()
}

function deserializeConfig(search: string): PivotConfig {
  const p = new URLSearchParams(search)
  const rowFields = p.getAll("rows")
  const colFields = p.getAll("col")
  const rawM = p.get("m")
  const measurement = (MEASUREMENTS.find((m) => m.key === rawM)?.key ?? null) as MeasurementKey | null
  const aggFunc = p.get("agg") || "sum"

  const fys = p.getAll("pfy")
  const months = p
    .getAll("pm")
    .map(Number)
    .filter((m) => !isNaN(m) && m >= 1 && m <= 12)
  const startDay = Math.max(1, Math.min(31, Number(p.get("ps") || "1") || 1))
  const rawPe = p.get("pe") || "eom"
  const endDay: number | "eom" =
    rawPe === "eom" ? "eom" : Math.max(1, Math.min(31, Number(rawPe) || 31))

  const filterMap = new Map<string, string[]>()
  p.forEach((value, key) => {
    if (key.startsWith("f_")) {
      const field = key.slice(2)
      if (!filterMap.has(field)) filterMap.set(field, [])
      filterMap.get(field)!.push(value)
    }
  })
  const filters: FilterCondition[] = Array.from(filterMap.entries()).map(([field, values]) => ({
    field,
    values,
  }))

  return { rowFields, colFields, measurement, aggFunc, periodFilter: { fys, months, startDay, endDay }, filters }
}

function initFromUrl<T>(selector: (cfg: PivotConfig) => T, fallback: T): T {
  if (typeof window === "undefined" || !window.location.search) return fallback
  try {
    return selector(deserializeConfig(window.location.search))
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCsrfToken(): string {
  return (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content ?? ""
}

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—"
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)
}

function fieldLabel(key: string): string {
  return ALL_FIELDS.find((f) => f.key === key)?.label ?? key
}

function formatRelativeTime(date: Date): string {
  const diffMs  = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1)  return "baru saja"
  if (diffMin < 60) return `${diffMin} menit lalu`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24)  return `${diffHr} jam lalu`
  return `${Math.floor(diffHr / 24)} hari lalu`
}

function buildFilterValuesUrl(
  field: string,
  periodFilter: PeriodFilter,
  otherFilters: FilterCondition[]
): string {
  const p = new URLSearchParams()
  p.set("field", field)
  periodFilter.fys.forEach((fy) => p.append("period_filter[fys][]", fy))
  periodFilter.months.forEach((m) => p.append("period_filter[months][]", String(m)))
  p.set("period_filter[start_day]", String(periodFilter.startDay))
  p.set("period_filter[end_day]", String(periodFilter.endDay))
  otherFilters.forEach((f) => {
    f.values.forEach((v) => p.append(`filters[${f.field}][]`, v))
  })
  return `/admin/pivot/filter_values?${p.toString()}`
}

function buildRequestBody(cfg: {
  rowFields: string[]
  colFields: string[]
  measurement: string
  aggFunc: string
  periodFilter: PeriodFilter
  filters: FilterCondition[]
}) {
  return {
    row_fields: cfg.rowFields,
    col_fields: cfg.colFields,
    measurement: cfg.measurement,
    agg_func: cfg.aggFunc,
    period_filter: {
      fys: cfg.periodFilter.fys,
      months: cfg.periodFilter.months,
      start_day: cfg.periodFilter.startDay,
      end_day: cfg.periodFilter.endDay,
    },
    filters: Object.fromEntries(
      cfg.filters.filter((f) => f.values.length > 0).map((f) => [f.field, f.values])
    ),
  }
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function Pivot() {
  const [rowFields, setRowFields] = useState<string[]>(() =>
    initFromUrl((c) => c.rowFields, [])
  )
  const [colFields, setColFields] = useState<string[]>(() =>
    initFromUrl((c) => c.colFields, [])
  )
  const [measurement, setMeasurement] = useState<MeasurementKey | null>(() =>
    initFromUrl((c) => c.measurement, null)
  )
  const [aggFunc, setAggFunc] = useState(() => initFromUrl((c) => c.aggFunc, "sum"))
  const [search, setSearch] = useState("")
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(
      [...DIMENSION_GROUPS.map((g) => [g.label, false]), ["Filter Only", false]]
    )
  )
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [colWarning, setColWarning] = useState<string | null>(null)
  const [result, setResult] = useState<PivotResult | null>(null)

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(() =>
    initFromUrl((c) => c.periodFilter, DEFAULT_PERIOD_FILTER)
  )
  const [filters, setFilters] = useState<FilterCondition[]>(() =>
    initFromUrl((c) => c.filters, [{ field: "flag_program", values: ["Non Program"] }])
  )
  // on-demand filter options (fallback when catalog not yet ready for a specific field)
  const [filterOptions, setFilterOptions] = useState<Record<string, MultiSelectOption[]>>({})
  const [filterLoading, setFilterLoading] = useState<Record<string, boolean>>({})
  // DB-backed dimension catalog
  const [catalog, setCatalog] = useState<Record<string, string[]>>({})
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus | null>(null)
  const [catalogFetching, setCatalogFetching] = useState(false) // HTTP in-flight
  const cableSubRef = useRef<ReturnType<typeof consumer.subscriptions.create> | null>(null)

  const canGenerate =
    rowFields.length > 0 &&
    measurement !== null &&
    periodFilter.fys.length > 0 &&
    periodFilter.months.length > 0

  const selectedMeasurement = MEASUREMENTS.find((m) => m.key === measurement)

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return DIMENSION_GROUPS
    const q = search.toLowerCase()
    return DIMENSION_GROUPS.map((g) => ({
      ...g,
      fields: g.fields.filter(
        (f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)
      ),
    })).filter((g) => g.fields.length > 0)
  }, [search])

  const filterOnlyVisible = useMemo(() => {
    if (!search.trim()) return FILTER_ONLY_FIELDS
    const q = search.toLowerCase()
    return FILTER_ONLY_FIELDS.filter(
      (f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)
    )
  }, [search])

  const filterFieldsSet = useMemo(
    () => new Set(filters.map((f) => f.field)),
    [filters]
  )

  // Sync URL on every config change
  useEffect(() => {
    const qs = serializeConfig({ rowFields, colFields, measurement, aggFunc, periodFilter, filters })
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname)
  }, [rowFields, colFields, measurement, aggFunc, periodFilter, filters])

  // Period filter is "complete" when FY and months are both selected
  const periodFilterComplete = periodFilter.fys.length > 0 && periodFilter.months.length > 0

  // FY options for the Period Filter FY dropdown — derived from catalog when ready
  const fyOptions = useMemo<MultiSelectOption[]>(
    () => (catalog["FY"] ?? []).map((v) => ({ value: v, label: v })),
    [catalog]
  )

  // On mount: load DB catalog + subscribe to ActionCable + auto-execute from URL
  useEffect(() => {
    fetchCatalog()

    // Subscribe to live build progress
    cableSubRef.current = consumer.subscriptions.create(
      { channel: "PivotCatalogChannel" },
      {
        received(data: CatalogStatus & { type: string }) {
          if (data.type !== "status_update") return
          setCatalogStatus(data)
          // When build completes, pull the fresh catalog from DB
          if (!data.building && data.ready >= data.total) {
            fetchCatalog()
          }
        },
      }
    )

    if (
      rowFields.length > 0 &&
      measurement !== null &&
      periodFilterComplete
    ) {
      executeGenerate({ rowFields, colFields, measurement, aggFunc, periodFilter, filters })
    }

    return () => {
      cableSubRef.current?.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  function addToRow(key: string) {
    if (rowFields.includes(key)) return
    setColFields((prev) => prev.filter((f) => f !== key))
    setRowFields((prev) => [...prev, key])
  }

  function addToCol(key: string) {
    if (colFields.includes(key)) return
    setRowFields((prev) => prev.filter((f) => f !== key))
    setColFields((prev) => [...prev, key])
  }

  function removeRow(key: string) {
    setRowFields((prev) => prev.filter((f) => f !== key))
  }

  function removeCol(key: string) {
    setColFields((prev) => prev.filter((f) => f !== key))
  }

  function addFilter(field: string) {
    if (filters.some((f) => f.field === field)) return
    setFilters((prev) => [...prev, { field, values: [] }])
  }

  function removeFilter(field: string) {
    setFilters((prev) => prev.filter((f) => f.field !== field))
    setFilterOptions((prev) => {
      const { [field]: _f, ...rest } = prev
      return rest
    })
    setFilterLoading((prev) => {
      const { [field]: _l, ...rest } = prev
      return rest
    })
  }

  function updateFilterValues(field: string, values: string[]) {
    setFilters((prev) => prev.map((f) => (f.field === field ? { ...f, values } : f)))
  }

  async function loadFilterValues(field: string) {
    setFilterLoading((prev) => ({ ...prev, [field]: true }))
    try {
      const otherFilters = filters.filter((f) => f.field !== field)
      const url = buildFilterValuesUrl(field, periodFilter, otherFilters)
      const resp = await fetch(url, {
        headers: { "X-CSRF-Token": getCsrfToken() },
        credentials: "same-origin",
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = (await resp.json()) as { values: string[] }
      setFilterOptions((prev) => ({
        ...prev,
        [field]: data.values.map((v) => ({ value: v, label: v })),
      }))
    } catch {
      setFilterOptions((prev) => ({ ...prev, [field]: [] }))
    } finally {
      setFilterLoading((prev) => ({ ...prev, [field]: false }))
    }
  }

  // Fetch the full catalog from DB (called on mount and after a build completes)
  async function fetchCatalog() {
    setCatalogFetching(true)
    try {
      const resp = await fetch("/admin/pivot/catalog", {
        headers: { "X-CSRF-Token": getCsrfToken() },
        credentials: "same-origin",
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = (await resp.json()) as {
        catalog: Record<string, string[]>
        status: CatalogStatus
      }
      setCatalog(data.catalog)
      setCatalogStatus(data.status)
    } catch (e) {
      console.error("[Pivot] fetchCatalog failed:", e)
    } finally {
      setCatalogFetching(false)
    }
  }

  // Trigger a background rebuild — only if not already building
  async function triggerRefreshCatalog() {
    try {
      const resp = await fetch("/admin/pivot/refresh_catalog", {
        method: "POST",
        headers: { "X-CSRF-Token": getCsrfToken() },
        credentials: "same-origin",
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = (await resp.json()) as { status: CatalogStatus }
      setCatalogStatus(data.status)
    } catch (e) {
      console.error("[Pivot] triggerRefreshCatalog failed:", e)
    }
  }

  async function executeGenerate(cfg: {
    rowFields: string[]
    colFields: string[]
    measurement: string
    aggFunc: string
    periodFilter: PeriodFilter
    filters: FilterCondition[]
  }) {
    setLoading(true)
    setError(null)
    setColWarning(null)
    setResult(null)
    try {
      const resp = await fetch("/admin/pivot/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        credentials: "same-origin",
        body: JSON.stringify(buildRequestBody(cfg)),
      })
      const data = await resp.json()
      if (!resp.ok && "col_warning" in data) {
        setColWarning((data as { col_warning: string }).col_warning)
        return
      }
      if (!resp.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${resp.status}`)
      setResult(data as PivotResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed")
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadExcel() {
    if (!result || !measurement) return
    setDownloading(true)
    try {
      const resp = await fetch("/admin/pivot/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        credentials: "same-origin",
        body: JSON.stringify(buildRequestBody({ rowFields, colFields, measurement, aggFunc, periodFilter, filters })),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `HTTP ${resp.status}`)
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const measureSlug = measurement.replace(/_/g, "-")
      a.download = `pivot-${measureSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed")
    } finally {
      setDownloading(false)
    }
  }

  function handleGenerate() {
    if (!canGenerate) return
    executeGenerate({ rowFields, colFields, measurement: measurement!, aggFunc, periodFilter, filters })
  }

  return (
    <>
      <Head title="Pivot">
        <meta name="description" content="Interactive pivot table builder for Timeseries data." />
        <meta property="og:title" content="Pivot" />
        <meta property="og:description" content="Interactive pivot table builder for Timeseries data." />
      </Head>
      <AdminShell full>
        <div className="flex h-[calc(100vh-4rem)] lg:h-screen">
          {/* ── Config panel ─────────────────────────────────────── */}
          <aside className="flex w-72 shrink-0 flex-col border-r border-hairline bg-surface">
            {/* Header */}
            <div className="border-b border-hairline px-4 py-3">
              <h1 className="text-base font-semibold text-ink-display">Pivot</h1>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
              {/* Rows zone */}
              <Zone
                label="Baris (Rows)"
                emptyText="Pilih field di bawah"
                chips={rowFields.map((key) => ({
                  key,
                  label: fieldLabel(key),
                  onRemove: () => removeRow(key),
                }))}
              />

              {/* Columns zone — now supports multiple fields */}
              <Zone
                label="Kolom (Columns)"
                emptyText="Opsional — satu atau lebih field"
                chips={colFields.map((key) => ({
                  key,
                  label: fieldLabel(key),
                  onRemove: () => removeCol(key),
                }))}
              />

              {/* Measurement */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Ukuran</p>
                <div className="space-y-1">
                  {MEASUREMENTS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMeasurement(m.key)}
                      className={cn(
                        "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                        measurement === m.key
                          ? "bg-accent/10 text-accent font-medium"
                          : "text-ink-body hover:bg-surface"
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {selectedMeasurement?.supportsAgg && (
                  <div className="mt-2">
                    <label htmlFor="agg-func" className="font-normal text-ink-body">
                      <span className="text-xs text-ink-muted">Fungsi agregasi</span>
                    </label>
                    <Select
                      id="agg-func"
                      value={aggFunc}
                      onChange={(e) => setAggFunc(e.target.value)}
                      className="mt-1 text-sm"
                    >
                      {AGG_FUNCS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>

              {/* Period Filter (mandatory) */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Period Filter{" "}
                  <span className="text-[10px] font-normal normal-case text-red-500">* wajib</span>
                </p>
                <div className="space-y-2">
                  {/* Fiscal Year — options come from DB catalog */}
                  <div>
                    <p className="mb-1 text-[11px] text-ink-muted">Fiscal Year</p>
                    <MultiSelect
                      options={fyOptions}
                      selected={periodFilter.fys}
                      loading={catalogFetching && fyOptions.length === 0}
                      placeholder={catalogFetching ? "Memuat katalog…" : fyOptions.length === 0 ? "Refresh katalog terlebih dahulu" : "Pilih FY…"}
                      onChange={(vals) =>
                        setPeriodFilter((prev) => ({ ...prev, fys: vals }))
                      }
                    />
                  </div>
                  {/* Month */}
                  <div>
                    <p className="mb-1 text-[11px] text-ink-muted">Bulan</p>
                    <MultiSelect
                      options={MONTH_OPTIONS}
                      selected={periodFilter.months.map(String)}
                      loading={false}
                      placeholder="Pilih bulan…"
                      onChange={(vals) =>
                        setPeriodFilter((prev) => ({ ...prev, months: vals.map(Number) }))
                      }
                    />
                  </div>
                  {/* Day range */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <p className="mb-1 text-[11px] text-ink-muted">Dari tgl</p>
                      <Select
                        value={String(periodFilter.startDay)}
                        onChange={(e) =>
                          setPeriodFilter((prev) => ({ ...prev, startDay: Number(e.target.value) }))
                        }
                        className="text-xs"
                      >
                        {DAY_OPTIONS.map((d) => (
                          <option key={d} value={String(d)}>
                            {d}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex-1">
                      <p className="mb-1 text-[11px] text-ink-muted">Sampai tgl</p>
                      <Select
                        value={periodFilter.endDay === "eom" ? "eom" : String(periodFilter.endDay)}
                        onChange={(e) => {
                          const v = e.target.value
                          setPeriodFilter((prev) => ({
                            ...prev,
                            endDay: v === "eom" ? "eom" : Number(v),
                          }))
                        }}
                        className="text-xs"
                      >
                        {DAY_OPTIONS.map((d) => (
                          <option key={d} value={String(d)}>
                            {d}
                          </option>
                        ))}
                        <option value="eom">Akhir Bulan</option>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Catalog loader — visible once period filter has FY + months */}
              {/* Active Filters */}
              {filters.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                    Filter Aktif
                  </p>
                  <div className="space-y-3">
                    {filters.map((fc) => {
                      // Use DB catalog values if ready; fall back to on-demand fetch
                      const catalogVals = catalog[fc.field]
                      const catalogOpts = catalogVals?.map((v) => ({ value: v, label: v }))
                      const onDemandOpts = filterOptions[fc.field] ?? []
                      const opts = catalogOpts ?? onDemandOpts
                      const isLoadingOpts = !catalogOpts && (filterLoading[fc.field] ?? false)
                      const isBuilding = catalogStatus?.building && !catalogVals

                      return (
                        <div key={fc.field} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-ink-body">
                              {fieldLabel(fc.field)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFilter(fc.field)}
                              className="rounded p-0.5 text-ink-muted hover:bg-surface hover:text-ink-body"
                              aria-label={`Hapus filter ${fieldLabel(fc.field)}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <MultiSelect
                            options={opts}
                            selected={fc.values}
                            loading={isBuilding || isLoadingOpts}
                            placeholder={
                              isBuilding
                                ? "Membangun katalog…"
                                : catalogOpts
                                ? "Pilih nilai…"
                                : "Pilih nilai…"
                            }
                            onChange={(vals) => updateFilterValues(fc.field, vals)}
                            onOpen={catalogOpts ? undefined : () => loadFilterValues(fc.field)}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Field picker */}
              <div>
                {/* Catalog status + Refresh button */}
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Fields</p>
                  <button
                    type="button"
                    disabled={catalogStatus?.building ?? false}
                    onClick={triggerRefreshCatalog}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-ink-muted hover:bg-surface hover:text-ink-body disabled:opacity-50"
                    title="Rebuild katalog nilai dimension dari database"
                  >
                    {catalogStatus?.building ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {catalogStatus.ready}/{catalogStatus.total}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3" />
                        {catalogStatus?.refreshed_at
                          ? formatRelativeTime(new Date(catalogStatus.refreshed_at))
                          : "Refresh"}
                      </>
                    )}
                  </button>
                </div>
                {/* Progress bar while building */}
                {catalogStatus?.building && (
                  <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-accent/60 transition-all duration-300"
                      style={{ width: `${catalogStatus.pct}%` }}
                    />
                  </div>
                )}
                <Input
                  type="search"
                  placeholder="Cari field…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mb-2 text-sm"
                />
                <div className="space-y-1">
                  {filteredGroups.map((group) => (
                    <FieldGroupAccordion
                      key={group.label}
                      group={group}
                      open={search ? true : (openGroups[group.label] ?? true)}
                      onToggle={() => toggleGroup(group.label)}
                      rowFields={rowFields}
                      colFields={colFields}
                      filterFields={filterFieldsSet}
                      onAddRow={addToRow}
                      onAddCol={addToCol}
                      onAddFilter={addFilter}
                    />
                  ))}
                  {/* Filter-only fields group */}
                  {filterOnlyVisible.length > 0 && (
                    <div className="rounded-md border border-hairline">
                      <button
                        type="button"
                        onClick={() => toggleGroup("Filter Only")}
                        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface rounded-md"
                      >
                        Filter Only
                        {openGroups["Filter Only"] ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </button>
                      {(search || openGroups["Filter Only"]) && (
                        <div className="border-t border-hairline">
                          {filterOnlyVisible.map((field) => (
                            <FieldRow
                              key={field.key}
                              field={field}
                              inRow={false}
                              inCol={false}
                              inFilter={filterFieldsSet.has(field.key)}
                              isFilterOnly
                              onAddRow={() => {}}
                              onAddCol={() => {}}
                              onAddFilter={() => addFilter(field.key)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Generate button */}
            <div className="border-t border-hairline px-4 py-3">
              <Button
                className="w-full"
                disabled={!canGenerate || loading}
                onClick={handleGenerate}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Memproses…
                  </>
                ) : (
                  "Generate"
                )}
              </Button>
              {!canGenerate && !loading && (
                <p className="mt-1 text-center text-xs text-ink-muted">
                  {rowFields.length === 0
                    ? "Pilih min. 1 baris + ukuran"
                    : measurement === null
                    ? "Pilih ukuran"
                    : periodFilter.fys.length === 0
                    ? "Pilih min. 1 FY di Period Filter"
                    : "Pilih min. 1 bulan di Period Filter"}
                </p>
              )}
            </div>
          </aside>

          {/* ── Canvas ───────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-3">
              <p className="text-sm text-ink-muted">
                {result
                  ? `${result.rows.length} baris`
                  : loading
                  ? "Menjalankan query…"
                  : "Belum ada hasil"}
              </p>
              {result && !loading && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={downloading}
                  onClick={handleDownloadExcel}
                  className="gap-1.5"
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  {downloading ? "Mengunduh…" : "Download Excel"}
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-auto p-6">
              {!loading && !error && !colWarning && !result && <BlankState />}
              {loading && <SkeletonTable />}
              {colWarning && !loading && (
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{colWarning}</span>
                </div>
              )}
              {error && (
                <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {result && !loading && <PivotTable result={result} rowFields={rowFields} />}
            </div>
          </div>
        </div>
      </AdminShell>
    </>
  )
}

// ---------------------------------------------------------------------------
// MultiSelect — pivot-specific dropdown with checkboxes and async loading
// ---------------------------------------------------------------------------

function MultiSelect({
  options,
  selected,
  loading,
  placeholder,
  onChange,
  onOpen,
}: {
  options: MultiSelectOption[]
  selected: string[]
  loading: boolean
  placeholder: string
  onChange: (values: string[]) => void
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open])

  function handleToggle() {
    if (!open) onOpen?.()
    setOpen((prev) => !prev)
  }

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const buttonLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} dipilih`

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between rounded-md border border-hairline bg-page px-3 py-1.5 text-left text-xs hover:bg-surface"
      >
        <span className={cn("truncate", selected.length === 0 ? "text-ink-muted" : "text-ink-body")}>
          {buttonLabel}
        </span>
        <ChevronDown className="ml-1 h-3 w-3 shrink-0 text-ink-muted" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-hairline bg-page shadow-md">
          {loading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
            </div>
          ) : options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink-muted">Tidak ada data</p>
          ) : (
            options.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-surface font-normal text-ink-body"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-3 w-3 rounded"
                />
                <span className="text-xs">{opt.label}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Zone component (rows / columns selection chips)
// ---------------------------------------------------------------------------

function Zone({
  label,
  emptyText,
  chips,
}: {
  label: string
  emptyText: string
  chips: { key: string; label: string; onRemove: () => void }[]
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="min-h-[2.5rem] rounded-md border border-hairline bg-page px-2 py-1.5">
        {chips.length === 0 ? (
          <span className="text-xs text-ink-muted">{emptyText}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="rounded-full p-0.5 hover:bg-accent/20"
                  aria-label={`Remove ${chip.label}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FieldGroup accordion
// ---------------------------------------------------------------------------

function FieldGroupAccordion({
  group,
  open,
  onToggle,
  rowFields,
  colFields,
  filterFields,
  onAddRow,
  onAddCol,
  onAddFilter,
}: {
  group: { label: string; fields: FieldDef[] }
  open: boolean
  onToggle: () => void
  rowFields: string[]
  colFields: string[]
  filterFields: Set<string>
  onAddRow: (key: string) => void
  onAddCol: (key: string) => void
  onAddFilter: (key: string) => void
}) {
  return (
    <div className="rounded-md border border-hairline">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface rounded-md"
      >
        {group.label}
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="border-t border-hairline">
          {group.fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              inRow={rowFields.includes(field.key)}
              inCol={colFields.includes(field.key)}
              inFilter={filterFields.has(field.key)}
              onAddRow={() => onAddRow(field.key)}
              onAddCol={() => onAddCol(field.key)}
              onAddFilter={() => onAddFilter(field.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single field row with R / K / F assignment buttons
// ---------------------------------------------------------------------------

function FieldRow({
  field,
  inRow,
  inCol,
  inFilter,
  isFilterOnly = false,
  onAddRow,
  onAddCol,
  onAddFilter,
}: {
  field: FieldDef
  inRow: boolean
  inCol: boolean
  inFilter: boolean
  isFilterOnly?: boolean
  onAddRow: () => void
  onAddCol: () => void
  onAddFilter: () => void
}) {
  const isAssigned = (isFilterOnly ? false : inRow || inCol) || inFilter

  return (
    <div className="group flex items-center justify-between px-3 py-1.5 hover:bg-surface">
      <span className={cn("text-xs", isAssigned ? "text-ink-muted line-through" : "text-ink-body")}>
        {field.label}
      </span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        {!isFilterOnly && (
          <>
            <button
              type="button"
              onClick={onAddRow}
              disabled={inRow}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                inRow
                  ? "bg-accent/20 text-accent cursor-default"
                  : "bg-surface-muted text-ink-muted hover:bg-accent/10 hover:text-accent"
              )}
              title="Add to Rows"
            >
              R
            </button>
            <button
              type="button"
              onClick={onAddCol}
              disabled={inCol}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                inCol
                  ? "bg-accent/20 text-accent cursor-default"
                  : "bg-surface-muted text-ink-muted hover:bg-accent/10 hover:text-accent"
              )}
              title="Add to Column"
            >
              K
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onAddFilter}
          disabled={inFilter}
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            inFilter
              ? "bg-accent/20 text-accent cursor-default"
              : "bg-surface-muted text-ink-muted hover:bg-accent/10 hover:text-accent"
          )}
          title="Add to Filters"
        >
          F
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Blank state
// ---------------------------------------------------------------------------

function BlankState() {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
      <p className="text-sm font-medium text-ink-display">Pilih field dan ukuran</p>
      <p className="mt-1 text-xs text-ink-muted">
        Tambahkan minimal 1 field ke Baris, pilih 1 Ukuran, isi Period Filter, lalu klik Generate.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function SkeletonTable() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-8 rounded-md bg-surface" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-6 rounded bg-surface/70" style={{ width: `${85 + Math.random() * 15}%` }} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pivot result table — supports flat, single-level, and multi-level columns
// ---------------------------------------------------------------------------

function PivotTable({ result, rowFields }: { result: PivotResult; rowFields: string[] }) {
  const { column_levels, column_combos, rows, col_totals, grand_total } = result
  const isFlat = column_combos.length === 0
  const numColLevels = column_levels.length   // 0 = flat, 1 = single, 2+ = nested
  const rowFieldLabels = rowFields.map(fieldLabel)
  const headerRowSpan = Math.max(1, numColLevels)

  // Pre-compute colspan for each level: span[i] = product of lower-level sizes
  const levelSizes = column_levels.map((l) => l.length)
  const levelSpans = levelSizes.map((_, i) => levelSizes.slice(i + 1).reduce((a, b) => a * b, 1))

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <thead>
          {isFlat ? (
            // Flat: single header row
            <tr className="bg-surface">
              {rowFieldLabels.map((label, i) => (
                <th key={i} scope="col"
                  className="whitespace-nowrap border border-hairline px-3 py-2 text-left text-xs font-semibold text-ink-display">
                  {label}
                </th>
              ))}
              <th scope="col"
                className="whitespace-nowrap border border-hairline px-3 py-2 text-right text-xs font-semibold text-ink-display">
                Nilai
              </th>
            </tr>
          ) : (
            // Cross-tab: one header row per col level
            column_levels.map((levelValues, levelIdx) => (
              <tr key={levelIdx} className="bg-surface">
                {levelIdx === 0 && rowFieldLabels.map((label, i) => (
                  <th key={i} scope="col" rowSpan={headerRowSpan}
                    className="whitespace-nowrap border border-hairline px-3 py-2 text-left text-xs font-semibold text-ink-display">
                    {label}
                  </th>
                ))}
                {/* Column values for this level, repeated for each parent combination */}
                {Array.from({
                  length: levelIdx === 0 ? 1 : levelSizes.slice(0, levelIdx).reduce((a, b) => a * b, 1)
                }).flatMap((_, parentIdx) =>
                  levelValues.map((v, vi) => (
                    <th
                      key={`${parentIdx}-${vi}`}
                      scope="col"
                      colSpan={levelSpans[levelIdx]}
                      className="whitespace-nowrap border border-hairline px-3 py-2 text-center text-xs font-semibold text-ink-display"
                    >
                      {v ?? "—"}
                    </th>
                  ))
                )}
                {levelIdx === 0 && (
                  <th scope="col" rowSpan={headerRowSpan}
                    className="whitespace-nowrap border border-hairline bg-surface px-3 py-2 text-right text-xs font-semibold text-ink-display">
                    Total
                  </th>
                )}
              </tr>
            ))
          )}
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-surface/50">
              {row.dims.map((d, di) =>
                di === 0 ? (
                  <th key={di} scope="row"
                    className="whitespace-nowrap border border-hairline px-3 py-1.5 text-left text-xs font-normal text-ink-body">
                    {d ?? "—"}
                  </th>
                ) : (
                  <td key={di}
                    className="whitespace-nowrap border border-hairline px-3 py-1.5 text-xs text-ink-body">
                    {d ?? "—"}
                  </td>
                )
              )}
              {isFlat ? (
                <td className="whitespace-nowrap border border-hairline px-3 py-1.5 text-right text-xs tabular-nums text-ink-body">
                  {formatNum(row.total)}
                </td>
              ) : (
                <>
                  {row.values.map((v, vi) => (
                    <td key={vi}
                      className="whitespace-nowrap border border-hairline px-3 py-1.5 text-right text-xs tabular-nums text-ink-body">
                      {v != null ? formatNum(v) : "—"}
                    </td>
                  ))}
                  <td className="whitespace-nowrap border border-hairline bg-surface/50 px-3 py-1.5 text-right text-xs font-medium tabular-nums text-ink-display">
                    {formatNum(row.total)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface font-medium">
            {rowFieldLabels.length > 1 && (
              <td colSpan={rowFieldLabels.length - 1} className="border border-hairline px-3 py-2" />
            )}
            <td className="whitespace-nowrap border border-hairline px-3 py-2 text-xs font-semibold text-ink-display">
              Total
            </td>
            {isFlat ? (
              <td className="whitespace-nowrap border border-hairline px-3 py-2 text-right text-xs font-semibold tabular-nums text-ink-display">
                {formatNum(grand_total)}
              </td>
            ) : (
              <>
                {col_totals.map((ct, i) => (
                  <td key={i}
                    className="whitespace-nowrap border border-hairline px-3 py-2 text-right text-xs font-semibold tabular-nums text-ink-display">
                    {formatNum(ct)}
                  </td>
                ))}
                <td className="whitespace-nowrap border border-hairline px-3 py-2 text-right text-xs font-bold tabular-nums text-ink-display">
                  {formatNum(grand_total)}
                </td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
