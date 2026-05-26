import * as React from "react"
import { Head, router } from "@inertiajs/react"
import { parseSotForPreview, type SotParseResult } from "@/lib/sotPreviewParser"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react"
import { AdminShell } from "@/components/AdminShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { consumer } from "@/lib/actioncable"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CheckStatus = "pending" | "processing" | "completed" | "failed" | "cancelled"
type HistorySortKey = "checked_at" | "period" | "status" | "mismatched_count"

type HistoryCheck = {
  id: number
  filename: string
  status: CheckStatus
  period_range_label: string | null
  total_rows_in_sot: number
  matched_count: number
  mismatched_count: number
  missing_in_db_count: number
  extra_in_db_count: number
  include_program: boolean
  uploaded_by: string | null
  checked_at: string | null
  last_rerun_at: string | null
  created_at: string
}

type IndexFilters = {
  search: string | null
  status_filter: string | null
  year: string | null
  month: string | null
}

type TrackedCheck = {
  id: number
  filename: string
  status: CheckStatus
  compared: number
  total: number
  matched_count: number
  mismatched_count: number
  missing_in_db_count: number
  extra_in_db_count: number
  error_message: string | null
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminDataIntegrityChecks({
  latest_check,
  checks,
  total,
  page,
  per_page,
  sort,
  direction,
  filters,
  available_years,
  available_months,
  available_statuses,
}: {
  latest_check: HistoryCheck | null
  checks: HistoryCheck[]
  total: number
  page: number
  per_page: number
  sort: HistorySortKey
  direction: "asc" | "desc"
  filters: IndexFilters
  available_years: number[]
  available_months: number[]
  available_statuses: string[]
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile]   = React.useState<File | null>(null)
  const [parsing, setParsing]             = React.useState(false)
  const [parseResult, setParseResult]     = React.useState<SotParseResult | null>(null)
  const [parseError, setParseError]       = React.useState<string | null>(null)
  const [dragOver, setDragOver]           = React.useState(false)
  const [uploading, setUploading]         = React.useState(false)
  const [trackedCheck, setTrackedCheck]   = React.useState<TrackedCheck | null>(null)

  // Local filter draft state
  const [searchDraft, setSearchDraft] = React.useState(filters.search ?? "")

  // Subscribe to ActionCable when a check is in-flight
  React.useEffect(() => {
    if (!trackedCheck) return
    const TERMINAL: CheckStatus[] = ["completed", "failed", "cancelled"]
    if (TERMINAL.includes(trackedCheck.status)) return

    const sub = consumer.subscriptions.create(
      { channel: "IntegrityCheckChannel", check_id: trackedCheck.id },
      {
        received(data: StatusUpdate | ProgressUpdate) {
          if (data.type === "progress_update") {
            setTrackedCheck((prev) =>
              prev ? { ...prev, compared: data.compared, total: data.total } : prev
            )
          } else {
            setTrackedCheck((prev) =>
              prev
                ? {
                    ...prev,
                    status:              data.status,
                    matched_count:       data.matched_count,
                    mismatched_count:    data.mismatched_count,
                    missing_in_db_count: data.missing_in_db_count,
                    extra_in_db_count:   data.extra_in_db_count,
                    error_message:       data.error_message ?? null,
                  }
                : prev
            )
            if (data.status === "completed") {
              router.visit(`/admin/data/integrity/${data.check_id}`)
            }
          }
        },
      }
    )
    return () => { sub.unsubscribe() }
  }, [trackedCheck?.id, trackedCheck?.status])

  // ── File selection ──────────────────────────────────────────────────────────

  function handleFileSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file.name.endsWith(".xlsx")) {
      setParseError("Hanya file .xlsx yang diterima.")
      return
    }
    startParse(file)
  }

  async function startParse(file: File) {
    setSelectedFile(file)
    setParsing(true)
    setParseResult(null)
    setParseError(null)
    try {
      const result = await parseSotForPreview(file)
      setParseResult(result)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Gagal membaca file.")
    } finally {
      setParsing(false)
    }
  }

  function handleClearFile() {
    setSelectedFile(null)
    setParseResult(null)
    setParseError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  async function handleStartCheck() {
    if (!selectedFile || !parseResult) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", selectedFile)
      const resp = await fetch("/admin/data/integrity", {
        method:      "POST",
        headers:     { "X-CSRF-Token": getCsrfToken() },
        credentials: "same-origin",
        body:        fd,
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        throw new Error((data as { error?: string }).error ?? `HTTP ${resp.status}`)
      }
      const { check_id } = data as { check_id: number }
      setParseResult(null)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      setTrackedCheck({
        id:                  check_id,
        filename:            selectedFile.name,
        status:              "pending",
        compared:            0,
        total:               parseResult.validRows,
        matched_count:       0,
        mismatched_count:    0,
        missing_in_db_count: 0,
        extra_in_db_count:   0,
        error_message:       null,
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload gagal.")
    } finally {
      setUploading(false)
    }
  }

  async function handleCancel() {
    if (!trackedCheck) return
    await fetch(`/admin/data/integrity/${trackedCheck.id}/cancel`, {
      method:  "PATCH",
      headers: { "X-CSRF-Token": getCsrfToken() },
    })
  }

  function handleUploadAgain() {
    setTrackedCheck(null)
  }

  // ── Drop zone ───────────────────────────────────────────────────────────────

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFileSelected(e.dataTransfer.files)
  }

  // ── History table navigation ────────────────────────────────────────────────

  function navigate(params: Record<string, string | number | null | undefined>) {
    const merged: Record<string, string> = {
      sort,
      direction,
      page:          String(page),
      search:        filters.search        ?? "",
      status_filter: filters.status_filter ?? "",
      year:          filters.year          ?? "",
      month:         filters.month         ?? "",
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
    router.get("/admin/data/integrity", clean, {
      replace:       true,
      preserveState: true,
      preserveScroll: true,
    })
  }

  function changeSort(col: HistorySortKey) {
    const newDir = sort === col && direction === "desc" ? "asc" : "desc"
    navigate({ sort: col, direction: newDir, page: "1" })
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    navigate({ search: searchDraft, page: "1" })
  }

  const totalPages = Math.ceil(total / per_page)

  // ── Derived state ───────────────────────────────────────────────────────────

  const TERMINAL: CheckStatus[] = ["completed", "failed", "cancelled"]
  const isInProgress = !!trackedCheck
  const isDone       = trackedCheck && TERMINAL.includes(trackedCheck.status)
  const hasError     = !!parseError
  const hasMalformed = (parseResult?.malformedRows.length ?? 0) > 0
  const canStartCheck = !!parseResult && !hasMalformed && !uploading

  const showUploadZone = !isInProgress && !parseResult && !parsing && !hasError

  return (
    <>
      <Head title="Data Integrity">
        <meta name="description" content="Upload Source-of-Truth file dan cek integritas data timeseries." />
        <meta property="og:title" content="Data Integrity" />
        <meta property="og:description" content="Upload Source-of-Truth file dan cek integritas data timeseries." />
      </Head>
      <AdminShell>
        <div className="border-b border-hairline pb-6">
          <h1>Data Integrity</h1>
          <p className="mt-1">Upload file Source-of-Truth (.xlsx) untuk memvalidasi data timeseries di database.</p>
        </div>

        {/* ── Upload section ────────────────────────────────────────────────── */}
        <div className="mt-6">
          {/* Drop zone */}
          {showUploadZone && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={[
                "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragOver ? "border-accent bg-surface" : "border-hairline",
              ].join(" ")}
            >
              <FileSpreadsheet className="mb-3 h-10 w-10 text-ink-muted" />
              <p className="text-sm font-medium text-ink-display">
                Drag &amp; drop file .xlsx ke sini, atau klik untuk memilih
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Kolom yang diperlukan: <code>Region, Year, Month, Netto_Wise</code>
              </p>
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Pilih File
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleFileSelected(e.target.files)}
              />
            </div>
          )}

          {/* Parse error */}
          {hasError && (
            <div className="rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                <span className="font-medium text-ink-display">Gagal membaca file</span>
              </div>
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">{parseError}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={handleClearFile}>
                Coba lagi
              </Button>
            </div>
          )}

          {/* Parsing spinner */}
          {parsing && (
            <div className="flex items-center gap-2 text-ink-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Membaca file…</span>
            </div>
          )}

          {/* Preview panel */}
          {!isInProgress && parseResult && (
            <div className="space-y-5">
              <div>
                <h2 className="mb-1">Preview SoT</h2>
                <p className="text-sm text-ink-muted">
                  File: <strong className="text-ink-body">{selectedFile?.name}</strong>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard label="Total baris" value={String(parseResult.totalRows)} />
                <SummaryCard
                  label="Periode"
                  value={
                    parseResult.periodMinYear
                      ? parseResult.periodMinYear === parseResult.periodMaxYear &&
                        parseResult.periodMinMonth === parseResult.periodMaxMonth
                        ? `${monthName(parseResult.periodMinMonth!)} ${parseResult.periodMinYear}`
                        : `${monthName(parseResult.periodMinMonth!)} ${parseResult.periodMinYear} – ${monthName(parseResult.periodMaxMonth!)} ${parseResult.periodMaxYear}`
                      : "—"
                  }
                />
                <SummaryCard
                  label="Region"
                  value={String(parseResult.distinctRegions.length)}
                  sub={parseResult.distinctRegions.join(", ")}
                />
                <SummaryCard
                  label="Baris bermasalah"
                  value={String(parseResult.malformedRows.length)}
                  tone={parseResult.malformedRows.length > 0 ? "danger" : "normal"}
                />
              </div>

              {hasMalformed && (
                <div className="rounded-md border border-signal bg-signal-faded p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-signal" />
                    <span className="text-sm font-medium text-ink-display">
                      {parseResult.malformedRows.length} baris bermasalah — perbaiki file sebelum melanjutkan
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {parseResult.malformedRows.slice(0, 20).map((row) => (
                      <li key={row.rowNumber} className="text-xs text-ink-muted">
                        <span className="font-medium text-ink-body">Baris {row.rowNumber}:</span>{" "}
                        {row.reason}
                      </li>
                    ))}
                    {parseResult.malformedRows.length > 20 && (
                      <li className="text-xs text-ink-muted">
                        …dan {parseResult.malformedRows.length - 20} lainnya
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {parseResult.previewRows.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-ink-muted uppercase tracking-wider">
                    Preview 10 baris pertama
                  </p>
                  <div className="overflow-hidden rounded-md border border-hairline">
                    <table className="w-full text-sm">
                      <thead className="bg-surface">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Region</th>
                          <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Year</th>
                          <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Month</th>
                          <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Netto Wise</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {parseResult.previewRows.map((row, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-ink-body">{row.region}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-ink-body">{row.year}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-ink-body">{row.month}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-ink-body">
                              {formatNumber(row.nettoWise)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="primary"
                  onClick={handleStartCheck}
                  disabled={!canStartCheck}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Mengantri…
                    </>
                  ) : (
                    "Mulai Check"
                  )}
                </Button>
                <Button variant="secondary" onClick={handleClearFile} disabled={uploading}>
                  Batal
                </Button>
              </div>
            </div>
          )}

          {/* In-progress view */}
          {isInProgress && trackedCheck && (
            <div className="space-y-4">
              <h2 className="mb-1">Integrity Check Berjalan</h2>

              <div className="rounded-md border border-hairline bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-display" title={trackedCheck.filename}>
                      {trackedCheck.filename}
                    </p>
                    {trackedCheck.status === "processing" && trackedCheck.total > 0 && (
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {trackedCheck.compared.toLocaleString("id-ID")} dari{" "}
                        {trackedCheck.total.toLocaleString("id-ID")} baris dibandingkan…
                      </p>
                    )}
                    {trackedCheck.status === "pending" && (
                      <p className="mt-0.5 text-xs text-ink-muted">Menunggu giliran…</p>
                    )}
                    {trackedCheck.status === "failed" && trackedCheck.error_message && (
                      <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                        {trackedCheck.error_message.length > 120
                          ? trackedCheck.error_message.slice(0, 120) + "…"
                          : trackedCheck.error_message}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={trackedCheck.status} />
                    {(trackedCheck.status === "pending" || trackedCheck.status === "processing") && (
                      <Button variant="secondary" size="sm" onClick={handleCancel}>
                        <Ban className="mr-1 h-3 w-3" />
                        Batalkan
                      </Button>
                    )}
                  </div>
                </div>
                {(trackedCheck.status === "pending" || trackedCheck.status === "processing") && (
                  <div className="mt-3">
                    <ProgressBar indeterminate />
                  </div>
                )}
              </div>

              {isDone && (
                <div className="rounded-md border border-hairline bg-surface p-4">
                  {trackedCheck.status === "cancelled" && (
                    <p className="text-sm text-ink-muted">Check dibatalkan. Tidak ada hasil yang disimpan.</p>
                  )}
                  {trackedCheck.status === "failed" && (
                    <p className="text-sm text-red-600 dark:text-red-400">Check gagal. Periksa log untuk detail.</p>
                  )}
                  <Button variant="secondary" className="mt-3" onClick={handleUploadAgain}>
                    Upload lagi
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Latest check callout ──────────────────────────────────────────── */}
        {latest_check && (
          <div className="mt-8">
            <p className="mb-2 text-xs font-medium text-ink-muted uppercase tracking-wider">
              Check terbaru
            </p>
            <div className="rounded-lg border border-hairline bg-surface p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-ink-display" title={latest_check.filename}>
                      {latest_check.filename}
                    </p>
                    <StatusBadge status={latest_check.status} />
                    <ProgramFilterBadge includeProgram={latest_check.include_program} />
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {latest_check.period_range_label ?? "—"} ·{" "}
                    {latest_check.checked_at
                      ? `Diperiksa ${formatDate(latest_check.checked_at)}`
                      : `Dibuat ${formatDate(latest_check.created_at)}`}
                    {latest_check.last_rerun_at && ` · Rerun ${formatDate(latest_check.last_rerun_at)}`}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => router.visit(`/admin/data/integrity/${latest_check.id}`)}
                >
                  Lihat detail
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-3 border-t border-hairline pt-3">
                <MiniCount label="Matched"      value={latest_check.matched_count}       tone="success" />
                <MiniCount label="Mismatched"   value={latest_check.mismatched_count}    tone={latest_check.mismatched_count > 0 ? "danger" : "normal"} />
                <MiniCount label="Missing in DB" value={latest_check.missing_in_db_count} tone={latest_check.missing_in_db_count > 0 ? "warning" : "normal"} />
                <MiniCount label="Extra in DB"  value={latest_check.extra_in_db_count}   tone={latest_check.extra_in_db_count > 0 ? "warning" : "normal"} />
              </div>
            </div>
          </div>
        )}

        {/* ── History table ─────────────────────────────────────────────────── */}
        <div className="mt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">
              Riwayat check
            </p>
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
              <form onSubmit={submitSearch} className="flex gap-2">
                <Input
                  type="search"
                  placeholder="Cari filename…"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  className="w-44"
                />
                <Button type="submit" variant="secondary" size="sm">Cari</Button>
              </form>
              <Select
                value={filters.status_filter ?? ""}
                onChange={(e) => navigate({ status_filter: e.target.value || undefined, page: "1" })}
                className="w-36"
              >
                <option value="">Semua status</option>
                {available_statuses.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s as CheckStatus] ?? s}</option>
                ))}
              </Select>
              <Select
                value={filters.year ?? ""}
                onChange={(e) => navigate({ year: e.target.value || undefined, page: "1" })}
                className="w-28"
              >
                <option value="">Semua tahun</option>
                {available_years.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </Select>
              <Select
                value={filters.month ?? ""}
                onChange={(e) => navigate({ month: e.target.value || undefined, page: "1" })}
                className="w-36"
              >
                <option value="">Semua bulan</option>
                {available_months.map((m) => (
                  <option key={m} value={String(m)}>{MONTHS[m]}</option>
                ))}
              </Select>
              {(filters.search || filters.status_filter || filters.year || filters.month) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchDraft("")
                    navigate({ search: "", status_filter: "", year: "", month: "", page: "1" })
                  }}
                >
                  Reset filter
                </Button>
              )}
            </div>
          </div>

          {checks.length === 0 ? (
            <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-hairline py-12 text-center">
              <CheckCircle2 className="mb-2 h-8 w-8 text-ink-muted" />
              <p className="text-sm font-medium text-ink-display">Belum ada riwayat check</p>
              <p className="mt-1 text-xs text-ink-muted">
                Upload file SoT di atas untuk memulai integrity check pertama.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4 overflow-hidden rounded-md border border-hairline">
                <table className="w-full text-sm">
                  <thead className="bg-surface">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Filename</th>
                      <HistorySortableHeader col="period"           label="Periode"          current={sort} direction={direction} onSort={changeSort} />
                      <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Diupload oleh</th>
                      <HistorySortableHeader col="checked_at"       label="Diperiksa"        current={sort} direction={direction} onSort={changeSort} />
                      <HistorySortableHeader col="status"           label="Status"           current={sort} direction={direction} onSort={changeSort} />
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Matched</th>
                      <HistorySortableHeader col="mismatched_count" label="Mismatched"       current={sort} direction={direction} onSort={changeSort} align="right" />
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Missing DB</th>
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Extra DB</th>
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {checks.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => router.visit(`/admin/data/integrity/${c.id}`)}
                        className="cursor-pointer hover:bg-surface transition-colors"
                      >
                        <td className="px-4 py-3 text-ink-body max-w-[240px]">
                          <span className="block truncate" title={c.filename}>{c.filename}</span>
                          <span className="mt-1 inline-flex">
                            <ProgramFilterBadge includeProgram={c.include_program} />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink-body whitespace-nowrap">
                          {c.period_range_label ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-ink-muted text-xs">
                          {c.uploaded_by ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-ink-muted whitespace-nowrap text-xs">
                          {c.checked_at ? formatDate(c.checked_at) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-body">
                          {c.matched_count.toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className={c.mismatched_count > 0 ? "font-medium text-danger-display" : "text-ink-body"}>
                            {c.mismatched_count.toLocaleString("id-ID")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-body">
                          {c.missing_in_db_count.toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-body">
                          {c.extra_in_db_count.toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                          {c.total_rows_in_sot.toLocaleString("id-ID")}
                        </td>
                      </tr>
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
                    {total.toLocaleString("id-ID")} check
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
      </AdminShell>
    </>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  sub,
  tone = "normal",
}: {
  label: string
  value: string
  sub?: string
  tone?: "normal" | "danger"
}) {
  return (
    <div className="rounded-md border border-hairline bg-surface p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={[
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "danger" ? "text-danger-display" : "text-ink-display",
        ].join(" ")}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-ink-muted" title={sub}>{sub}</p>}
    </div>
  )
}

function MiniCount({
  label,
  value,
  tone = "normal",
}: {
  label: string
  value: number
  tone?: "normal" | "success" | "danger" | "warning"
}) {
  const valueColor = {
    normal:  "text-ink-display",
    success: "text-success",
    danger:  "text-danger-display",
    warning: "text-signal",
  }[tone]
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${valueColor}`}>
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  )
}

function ProgramFilterBadge({ includeProgram }: { includeProgram: boolean }) {
  return includeProgram ? (
    <Badge tone="muted">PROGRAM incl.</Badge>
  ) : (
    <Badge tone="muted">PROGRAM excl.</Badge>
  )
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

function HistorySortableHeader({
  col,
  label,
  current,
  direction,
  onSort,
  align = "left",
}: {
  col: HistorySortKey
  label: string
  current: HistorySortKey
  direction: "asc" | "desc"
  onSort: (col: HistorySortKey) => void
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

function ProgressBar({ indeterminate }: { indeterminate?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
      {indeterminate ? (
        <div className="h-full w-1/3 animate-[progress-slide_1.4s_ease-in-out_infinite] rounded-full bg-accent" />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<CheckStatus, string> = {
  pending:    "Pending",
  processing: "Processing",
  completed:  "Selesai",
  failed:     "Gagal",
  cancelled:  "Dibatalkan",
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

function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
function monthName(m: number | null): string {
  if (m == null) return "—"
  return MONTH_NAMES[m] ?? String(m)
}
