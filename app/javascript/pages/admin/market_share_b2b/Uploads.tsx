import * as React from "react"
import { Head, router } from "@inertiajs/react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react"
import { AdminShell } from "@/components/AdminShell"
import {
  DataCard,
  DataCardActions,
  DataCardField,
  DataCardGrid,
  DataCardHeader,
  DataCardStatus,
  DataCardTitle,
} from "@/components/ui/data-card"
import { MobileFilterSheet } from "@/components/ui/mobile-filter-sheet"
import { MobileFilterSortBar } from "@/components/ui/mobile-filter-sort-bar"
import { MobileSortSheet, type SortOption } from "@/components/ui/mobile-sort-sheet"
import { useMobileFilterSort } from "@/hooks/use-mobile-filter-sort"

const SORT_OPTIONS: SortOption[] = [
  { sort: "created_at", direction: "desc", label: "Tanggal terbaru" },
  { sort: "created_at", direction: "asc", label: "Tanggal terlama" },
  { sort: "account_code", direction: "asc", label: "Account A–Z" },
  { sort: "account_code", direction: "desc", label: "Account Z–A" },
  { sort: "report_type", direction: "asc", label: "Tipe A–Z" },
  { sort: "report_type", direction: "desc", label: "Tipe Z–A" },
  { sort: "period", direction: "desc", label: "Periode terbaru" },
  { sort: "period", direction: "asc", label: "Periode terlama" },
  { sort: "row_count", direction: "desc", label: "Baris terbanyak" },
  { sort: "row_count", direction: "asc", label: "Baris paling sedikit" },
  { sort: "status", direction: "asc", label: "Status A–Z" },
  { sort: "status", direction: "desc", label: "Status Z–A" },
]
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import {
  parseMarketShareB2bForPreview,
  type MarketShareB2bResult,
} from "@/lib/marketShareB2bPreviewParser"
import { consumer } from "@/lib/actioncable"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UploadStatus = "pending" | "processing" | "completed" | "failed" | "cancelled"

type UploadRow = {
  id: number
  filename: string
  account_code: string
  account_name: string
  report_type: string
  template_version: string
  period_year_from: number
  period_month_from: number
  period_year_to: number
  period_month_to: number
  period_label: string
  status: UploadStatus
  row_count: number | null
  replaced_row_count: number | null
  error_message: string | null
  imported_at: string | null
  created_at: string
  uploaded_by: string | null
}

type PreviewServerResult =
  | {
      filename: string
      account_code: string
      account_name: string
      report_type: string
      template_version: string
      period_year_from: number
      period_month_from: number
      period_year_to: number
      period_month_to: number
      row_count: number
      existing_count: number
      will_replace: boolean
      error?: never
    }
  | { filename: string; error: string }

type TrackedUpload = {
  id: number
  filename: string
  account_code: string
  account_name: string
  report_type: string
  period_label: string
  status: UploadStatus
  row_count: number | null
  error_message: string | null
  progress_rows: number
}

type StatusUpdate = {
  type: "status_update"
  upload_id: number
  status: UploadStatus
  row_count: number | null
  error_message: string | null
}

type ProgressUpdate = {
  type: "progress_update"
  upload_id: number
  progress_rows: number
}

type Filters = {
  account_code: string | null
  report_type: string | null
  year: string | null
  month: string | null
  status: string | null
  search: string | null
}

const MONTHS_LABEL = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminMarketShareB2bUploads({
  uploads,
  total,
  page,
  per_page,
  sort,
  direction,
  filters,
  available_account_codes,
  available_report_types,
  available_years,
}: {
  uploads: UploadRow[]
  total: number
  page: number
  per_page: number
  sort: string
  direction: "asc" | "desc"
  filters: Filters
  available_account_codes: string[]
  available_report_types: string[]
  available_years: number[]
}) {
  const fileInputRef   = React.useRef<HTMLInputElement>(null)
  const folderInputRef = React.useRef<HTMLInputElement>(null)
  const activeXhrRef   = React.useRef<XMLHttpRequest | null>(null)
  const cancelledRef   = React.useRef(false)

  const [parseResults, setParseResults]     = React.useState<MarketShareB2bResult[] | null>(null)
  const [serverPreviews, setServerPreviews] = React.useState<PreviewServerResult[] | null>(null)
  const [workerProgress, setWorkerProgress] = React.useState<{ total: number; done: number } | null>(null)
  const [serverQuerying, setServerQuerying] = React.useState(false)
  const [importFiles, setImportFiles]       = React.useState<File[]>([])
  const [importing, setImporting]           = React.useState(false)
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null)
  const [dragOver, setDragOver]             = React.useState(false)
  const [checkedFiles, setCheckedFiles]     = React.useState<Set<string>>(new Set())
  const [trackedUploads, setTrackedUploads] = React.useState<TrackedUpload[]>([])
  const [searchValue, setSearchValue]       = React.useState(filters.search ?? "")

  // Sync search input when URL changes (browser back/forward)
  React.useEffect(() => {
    setSearchValue(filters.search ?? "")
  }, [filters.search])

  // Subscribe to ActionCable for uploads in the current progress view
  React.useEffect(() => {
    if (trackedUploads.length === 0) return
    const subs = trackedUploads.map((u) =>
      consumer.subscriptions.create(
        { channel: "MarketShareB2bUploadChannel", upload_id: u.id },
        {
          received(data: StatusUpdate | ProgressUpdate) {
            setTrackedUploads((prev) =>
              prev.map((t) => {
                if (t.id !== data.upload_id) return t
                if (data.type === "progress_update") {
                  return { ...t, progress_rows: data.progress_rows }
                }
                return {
                  ...t,
                  status:        data.status,
                  row_count:     data.row_count ?? t.row_count,
                  error_message: data.error_message ?? t.error_message,
                }
              })
            )
          },
        }
      )
    )
    return () => subs.forEach((s) => s.unsubscribe())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedUploads.map((u) => u.id).join(",")])

  // Live-update history rows for in-flight uploads visible in the table
  const [liveUploads, setLiveUploads] = React.useState<UploadRow[]>(uploads)
  React.useEffect(() => { setLiveUploads(uploads) }, [uploads])

  const liveInFlightKey = React.useMemo(
    () =>
      liveUploads
        .filter((u) => u.status === "pending" || u.status === "processing")
        .map((u) => u.id)
        .sort((a, b) => a - b)
        .join(","),
    [liveUploads]
  )

  React.useEffect(() => {
    if (!liveInFlightKey) return
    const ids = liveInFlightKey.split(",").map((s) => parseInt(s, 10))
    const subs = ids.map((id) =>
      consumer.subscriptions.create(
        { channel: "MarketShareB2bUploadChannel", upload_id: id },
        {
          received(data: StatusUpdate | ProgressUpdate) {
            if (data.type !== "status_update") return
            setLiveUploads((prev) =>
              prev.map((u) =>
                u.id === data.upload_id
                  ? {
                      ...u,
                      status:        data.status,
                      row_count:     data.row_count ?? u.row_count,
                      error_message: data.error_message ?? u.error_message,
                    }
                  : u
              )
            )
          },
        }
      )
    )
    return () => subs.forEach((s) => s.unsubscribe())
  }, [liveInFlightKey])

  const isInProgressView = trackedUploads.length > 0
  const isIdleView       = !isInProgressView && !parseResults && !workerProgress && !serverQuerying
  const isPreviewView    = !!serverPreviews && !importing && !isInProgressView

  const TERMINAL: UploadStatus[] = ["completed", "failed", "cancelled"]
  const allDone      = isInProgressView && trackedUploads.every((u) => TERMINAL.includes(u.status))
  const successCount = trackedUploads.filter((u) => u.status === "completed").length
  const cancelCount  = trackedUploads.filter((u) => u.status === "cancelled").length
  const failCount    = trackedUploads.filter((u) => u.status === "failed").length

  const trackedIds = React.useMemo(() => new Set(trackedUploads.map((u) => u.id)), [trackedUploads])
  const visibleUploads = React.useMemo(
    () => liveUploads.filter((u) => !trackedIds.has(u.id)),
    [liveUploads, trackedIds]
  )

  const hasActiveFilter =
    !!filters.account_code || !!filters.report_type || !!filters.year ||
    !!filters.month || !!filters.status || !!filters.search
  const totalPages = Math.ceil(total / per_page)

  // Mobile filter / sort sheets
  const { filterOpen, setFilterOpen, sortOpen, setSortOpen, activeFilterCount, applyFilters, resetFilters } =
    useMobileFilterSort(filters, navigate,
      [ "account_code", "report_type", "year", "month", "status", "search" ] as const)
  const sortLabel =
    SORT_OPTIONS.find((o) => o.sort === sort && o.direction === direction)?.label ?? "Urutkan"

  // -------------------------------------------------------------------------
  // Navigation helper (URL-based filter/sort/page state)
  // -------------------------------------------------------------------------

  function navigate(overrides: Record<string, string | number | null>) {
    const params: Record<string, string | number> = {}
    if (filters.account_code) params.account_code = filters.account_code
    if (filters.report_type)  params.report_type  = filters.report_type
    if (filters.year)         params.year         = filters.year
    if (filters.month)        params.month        = filters.month
    if (filters.status)       params.status       = filters.status
    if (filters.search)       params.search       = filters.search
    if (sort !== "created_at") params.sort        = sort
    if (direction !== "desc")  params.direction   = direction
    if (page > 1)              params.page        = page
    Object.entries(overrides).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== "") params[k] = v as string | number
      else delete params[k]
    })
    router.get("/admin/market-share-b2b/uploads", params as Record<string, string>, {
      preserveScroll: false,
    })
  }

  function handleSortColumn(col: string) {
    if (sort === col) {
      navigate({ direction: direction === "asc" ? "desc" : "asc", page: null })
    } else {
      navigate({ sort: col, direction: "asc", page: null })
    }
  }

  function handleDelete(upload: UploadRow) {
    if (!window.confirm(`Hapus upload "${upload.filename}"?\n\nSemua record yang diimport dari file ini akan ikut terhapus.`)) return
    router.delete(`/admin/market-share-b2b/uploads/${upload.id}`, {
      preserveScroll: true,
    })
  }

  // -------------------------------------------------------------------------
  // Upload handlers
  // -------------------------------------------------------------------------

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    const xlsx = Array.from(files).filter((f) => f.name.endsWith(".xlsx"))
    if (xlsx.length === 0) return
    startWorkerPreview(xlsx)
  }

  async function startWorkerPreview(files: File[]) {
    cancelledRef.current = false
    setImportFiles(files)
    setParseResults(null)
    setServerPreviews(null)
    setWorkerProgress({ total: files.length, done: 0 })

    const results: MarketShareB2bResult[] = []
    for (const file of files) {
      if (cancelledRef.current) return
      const result = await parseMarketShareB2bForPreview(file)
      results.push(result)
      if (cancelledRef.current) return
      setWorkerProgress((p) => (p ? { ...p, done: p.done + 1 } : null))
    }

    if (cancelledRef.current) return
    setParseResults(results)
    await runServerPreview(results)
  }

  async function runServerPreview(results: MarketShareB2bResult[]) {
    setWorkerProgress(null)
    setServerQuerying(true)

    try {
      const metadata = results.map((r) =>
        r.unknown
          ? { filename: r.filename, unknown: true }
          : {
              filename:          r.filename,
              account_code:      r.accountCode,
              account_name:      r.accountName,
              report_type:       r.reportType,
              template_version:  r.templateVersion,
              period_year_from:  r.periodYearFrom,
              period_month_from: r.periodMonthFrom,
              period_year_to:    r.periodYearTo,
              period_month_to:   r.periodMonthTo,
              row_count:         r.rowCount,
            }
      )

      const knownMeta = metadata.filter((m) => !("unknown" in m && m.unknown))

      const serverResults: PreviewServerResult[] = []
      if (knownMeta.length > 0) {
        const resp = await fetch("/admin/market-share-b2b/uploads/preview", {
          method:      "POST",
          headers:     { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
          credentials: "same-origin",
          body:        JSON.stringify({ files_metadata: knownMeta }),
        })
        if (resp.ok) {
          const data: PreviewServerResult[] = await resp.json()
          serverResults.push(...data)
        }
      }

      const serverMap = new Map(serverResults.map((s) => [s.filename, s]))

      const finalPreviews: PreviewServerResult[] = results.map((r) => {
        if (r.unknown) return { filename: r.filename, error: r.reason }
        return serverMap.get(r.filename) ?? { filename: r.filename, error: "Tidak ada hasil dari server." }
      })

      if (cancelledRef.current) return
      setServerPreviews(finalPreviews)

      const initialChecked = new Set(
        finalPreviews
          .filter((p): p is Exclude<PreviewServerResult, { error: string }> =>
            !("error" in p) && !p.will_replace
          )
          .map((p) => p.filename)
      )
      setCheckedFiles(initialChecked)
    } catch {
      setServerPreviews(results.map((r) => ({ filename: r.filename, error: "Network error" })))
    } finally {
      if (!cancelledRef.current) setServerQuerying(false)
    }
  }

  function handleCancelPreviewInProgress() {
    cancelledRef.current = true
    setWorkerProgress(null)
    setServerQuerying(false)
    setImportFiles([])
    resetInputs()
  }

  function handleCancelPreview() {
    setParseResults(null)
    setServerPreviews(null)
    setCheckedFiles(new Set())
    setImportFiles([])
    resetInputs()
  }

  async function handleConfirmImport() {
    const filesToImport = importFiles.filter((f) => checkedFiles.has(f.name))
    if (!filesToImport.length) return
    setImporting(true)
    setUploadProgress(0)

    const fd = new FormData()
    filesToImport.forEach((f) => fd.append("files[]", f))

    try {
      const data = await xhrPost<{ queued: number; upload_ids: number[] }>(
        "/admin/market-share-b2b/uploads",
        fd,
        (pct) => setUploadProgress(pct),
        activeXhrRef
      )

      const previewMap = new Map(
        (serverPreviews ?? [])
          .filter((p): p is Exclude<PreviewServerResult, { error: string }> => !("error" in p))
          .map((p) => [p.filename, p])
      )

      const initial: TrackedUpload[] = data.upload_ids.map((id, idx) => {
        const filename = filesToImport[idx]?.name ?? `upload-${id}`
        const preview  = previewMap.get(filename)
        const periodLabel = preview
          ? buildPeriodLabel(
              preview.period_year_from, preview.period_month_from,
              preview.period_year_to,   preview.period_month_to
            )
          : ""
        return {
          id,
          filename,
          account_code:  preview?.account_code  ?? "",
          account_name:  preview?.account_name  ?? "",
          report_type:   preview?.report_type   ?? "",
          period_label:  periodLabel,
          status:        "pending" as UploadStatus,
          row_count:     null,
          error_message: null,
          progress_rows: 0,
        }
      })

      setParseResults(null)
      setServerPreviews(null)
      setCheckedFiles(new Set())
      setImportFiles([])
      setUploadProgress(null)
      setTrackedUploads(initial)
      router.reload({ only: ["uploads"] })
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import gagal.")
    } finally {
      setImporting(false)
      setUploadProgress(null)
    }
  }

  async function handleCancelUpload(id: number) {
    await fetch(`/admin/market-share-b2b/uploads/${id}/cancel`, {
      method:  "PATCH",
      headers: { "X-CSRF-Token": getCsrfToken() },
    })
  }

  function handleUploadAgain() {
    setTrackedUploads([])
    router.reload({ only: ["uploads"] })
    resetInputs()
  }

  function toggleFile(filename: string) {
    setCheckedFiles((prev) => {
      const next = new Set(prev)
      next.has(filename) ? next.delete(filename) : next.add(filename)
      return next
    })
  }

  function resetInputs() {
    if (fileInputRef.current)   fileInputRef.current.value   = ""
    if (folderInputRef.current) folderInputRef.current.value = ""
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <Head title="Market Share B2B">
        <meta name="description" content="Upload dan kelola file Market Share B2B dari berbagai account (IDG, IDM, MIDI, SAT)." />
        <meta property="og:title" content="Market Share B2B" />
        <meta property="og:description" content="Upload dan kelola file Market Share B2B dari berbagai account (IDG, IDM, MIDI, SAT)." />
      </Head>
      <AdminShell>
        {/* Header */}
        <div className="border-b border-hairline pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1>Market Share B2B</h1>
              <p className="mt-1">Upload file Excel market share dari IDG, IDM, MIDI, dan SAT.</p>
            </div>
            {isIdleView && (
              <>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload File
                  </Button>
                  <Button variant="secondary" onClick={() => folderInputRef.current?.click()}>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Pilih Folder
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  {...{ webkitdirectory: "", mozdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>}
                />
              </>
            )}
          </div>
        </div>

        {/* Drop zone */}
        {isIdleView && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFilesSelected(e.dataTransfer.files) }}
            className={[
              "mt-6 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragOver ? "border-accent bg-surface" : "border-hairline",
            ].join(" ")}
          >
            <FileSpreadsheet className="mb-3 h-10 w-10 text-ink-muted" />
            <p className="text-sm font-medium text-ink-display">
              Drag &amp; drop file .xlsx ke sini, atau pilih folder
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Template yang didukung: IDG (MarketShareMOCY), IDM (Reguler / Skincare), MIDI, SAT
            </p>
          </div>
        )}

        {/* Worker progress */}
        {workerProgress && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-ink-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">
                  Mendeteksi template… {workerProgress.done}/{workerProgress.total}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCancelPreviewInProgress}>
                <Ban className="mr-1 h-3 w-3" />
                Batal
              </Button>
            </div>
            <ProgressBar value={Math.round((workerProgress.done / workerProgress.total) * 100)} />
          </div>
        )}

        {/* Server querying */}
        {serverQuerying && (
          <div className="mt-8 flex items-center gap-2 text-ink-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Memeriksa data yang sudah ada…</span>
          </div>
        )}

        {/* Preview panel */}
        {isPreviewView && serverPreviews && (
          <div className="mt-6">
            <h2 className="mb-1">Preview Import</h2>
            <p className="mb-4 text-sm text-ink-muted">
              Periksa detail berikut sebelum memulai import.
            </p>
            <div className="space-y-3">
              {serverPreviews.map((p) =>
                "error" in p && p.error ? (
                  <UnknownTemplateCard key={p.filename} filename={p.filename} reason={p.error} />
                ) : (
                  <PreviewCard
                    key={p.filename}
                    preview={p as Exclude<PreviewServerResult, { error: string }>}
                    checked={checkedFiles.has(p.filename)}
                    onToggle={() => toggleFile(p.filename)}
                  />
                )
              )}
            </div>

            {importing && uploadProgress !== null && (
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-ink-muted">
                    {uploadProgress < 100 ? `Mengirim file… ${uploadProgress}%` : "File terkirim, menunggu antrian…"}
                  </p>
                  {uploadProgress < 100 && (
                    <Button variant="ghost" size="sm" onClick={() => activeXhrRef.current?.abort()}>
                      <Ban className="mr-1 h-3 w-3" />
                      Batal
                    </Button>
                  )}
                </div>
                <ProgressBar value={uploadProgress} />
              </div>
            )}

            {!importing && (
              <div className="mt-5 flex gap-3">
                <Button
                  variant="primary"
                  onClick={handleConfirmImport}
                  disabled={checkedFiles.size === 0}
                >
                  Konfirmasi Import
                </Button>
                <Button variant="secondary" onClick={handleCancelPreview}>
                  Batal
                </Button>
              </div>
            )}
            {importing && (
              <div className="mt-5">
                <Button variant="primary" disabled>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {uploadProgress !== null && uploadProgress < 100 ? `Mengirim… ${uploadProgress}%` : "Mengantri…"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Progress view */}
        {isInProgressView && (
          <div className="mt-6">
            <h2 className="mb-1">Progress Import</h2>
            <p className="mb-4 text-sm text-ink-muted">
              Status tiap file diperbarui secara real-time.
            </p>

            <div className="space-y-3">
              {trackedUploads.map((u) => (
                <ProgressCard key={u.id} upload={u} onCancel={() => handleCancelUpload(u.id)} />
              ))}
            </div>

            {allDone && (
              <div className="mt-5 rounded-md border border-hairline bg-surface p-4">
                <p className="text-sm font-medium text-ink-display">
                  {successCount > 0 && (
                    <span className="mr-3 text-green-600 dark:text-green-400">
                      {successCount} berhasil
                    </span>
                  )}
                  {cancelCount > 0 && (
                    <span className="mr-3 text-ink-muted">{cancelCount} dibatalkan</span>
                  )}
                  {failCount > 0 && (
                    <span className="text-red-600 dark:text-red-400">{failCount} gagal</span>
                  )}
                </p>
                <Button variant="secondary" className="mt-3" onClick={handleUploadAgain}>
                  Upload lagi
                </Button>
              </div>
            )}
          </div>
        )}

        {/* History table */}
        <div className="mt-10">
          <h2 className="mb-4">Riwayat Upload</h2>

          {/* Filter + Sort bar (mobile) */}
          <div className="mb-4 md:hidden">
            <MobileFilterSortBar
              filterCount={activeFilterCount}
              sortLabel={sortLabel}
              onFilterClick={() => setFilterOpen(true)}
              onSortClick={() => setSortOpen(true)}
            />
          </div>

          {/* Filter bar (desktop) */}
          <div className="mb-4 hidden flex-wrap items-end gap-3 md:flex">
            <Select
              value={filters.account_code ?? ""}
              onChange={(e) => navigate({ account_code: e.target.value || null, page: null })}
              className="w-32"
            >
              <option value="">Semua Account</option>
              {available_account_codes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>

            <Select
              value={filters.report_type ?? ""}
              onChange={(e) => navigate({ report_type: e.target.value || null, page: null })}
              className="w-36"
            >
              <option value="">Semua Tipe</option>
              {available_report_types.map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </Select>

            <Select
              value={filters.year ?? ""}
              onChange={(e) => navigate({ year: e.target.value || null, page: null })}
              className="w-28"
            >
              <option value="">Semua Tahun</option>
              {available_years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>

            <Select
              value={filters.month ?? ""}
              onChange={(e) => navigate({ month: e.target.value || null, page: null })}
              className="w-36"
            >
              <option value="">Semua Bulan</option>
              {MONTHS_LABEL.slice(1).map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </Select>

            <Select
              value={filters.status ?? ""}
              onChange={(e) => navigate({ status: e.target.value || null, page: null })}
              className="w-36"
            >
              <option value="">Semua Status</option>
              {(["pending", "processing", "completed", "failed", "cancelled"] as const).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                navigate({ search: searchValue || null, page: null })
              }}
            >
              <Input
                type="search"
                placeholder="Cari filename…"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onBlur={() => navigate({ search: searchValue || null, page: null })}
                className="w-52"
              />
            </form>

            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigate({
                    account_code: null, report_type: null, year: null,
                    month: null, status: null, search: null, page: null,
                  })
                }
              >
                Reset filter
              </Button>
            )}
          </div>

          {visibleUploads.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {hasActiveFilter
                ? "Tidak ada upload yang cocok dengan filter."
                : "Belum ada upload."}
            </p>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="space-y-3 md:hidden">
                {visibleUploads.map((u) => (
                  <UploadCard key={u.id} upload={u} onDelete={() => handleDelete(u)} />
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-md border border-hairline md:block">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-ink-muted">File</th>
                    <SortableHeader
                      col="account_code" label="Account"
                      sort={sort} direction={direction} onSort={handleSortColumn}
                    />
                    <SortableHeader
                      col="report_type" label="Tipe"
                      sort={sort} direction={direction} onSort={handleSortColumn}
                    />
                    <SortableHeader
                      col="period" label="Periode"
                      sort={sort} direction={direction} onSort={handleSortColumn}
                    />
                    <SortableHeader
                      col="row_count" label="Baris" align="right"
                      sort={sort} direction={direction} onSort={handleSortColumn}
                    />
                    <SortableHeader
                      col="status" label="Status"
                      sort={sort} direction={direction} onSort={handleSortColumn}
                    />
                    <SortableHeader
                      col="created_at" label="Waktu"
                      sort={sort} direction={direction} onSort={handleSortColumn}
                    />
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {visibleUploads.map((u) => (
                    <UploadTableRow key={u.id} upload={u} onDelete={() => handleDelete(u)} />
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}

          {/* Summary + pagination */}
          {total > 0 && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-muted">
                Menampilkan {(page - 1) * per_page + 1}–{Math.min(page * per_page, total)} dari{" "}
                {total} upload
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => navigate({ page: page - 1 })}
                  >
                    Sebelumnya
                  </Button>
                  <span className="text-sm text-ink-muted">
                    Hal. {page} / {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => navigate({ page: page + 1 })}
                  >
                    Berikutnya
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile filter sheet */}
        <MobileFilterSheet
          open={filterOpen}
          onOpenChange={setFilterOpen}
          initial={{
            account_code: filters.account_code ?? "",
            report_type: filters.report_type ?? "",
            year: filters.year ?? "",
            month: filters.month ?? "",
            status: filters.status ?? "",
            search: filters.search ?? "",
          }}
          onApply={applyFilters}
          onReset={resetFilters}
        >
          {(draft, setDraft) => (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-display">Account</span>
                <Select
                  value={draft.account_code}
                  onChange={(e) => setDraft({ ...draft, account_code: e.target.value })}
                >
                  <option value="">Semua Account</option>
                  {available_account_codes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-display">Tipe</span>
                <Select
                  value={draft.report_type}
                  onChange={(e) => setDraft({ ...draft, report_type: e.target.value })}
                >
                  <option value="">Semua Tipe</option>
                  {available_report_types.map((t) => (
                    <option key={t} value={t} className="capitalize">{t}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-display">Tahun</span>
                <Select
                  value={draft.year}
                  onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                >
                  <option value="">Semua Tahun</option>
                  {available_years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-display">Bulan</span>
                <Select
                  value={draft.month}
                  onChange={(e) => setDraft({ ...draft, month: e.target.value })}
                >
                  <option value="">Semua Bulan</option>
                  {MONTHS_LABEL.slice(1).map((name, i) => (
                    <option key={i + 1} value={String(i + 1)}>{name}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-display">Status</span>
                <Select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                >
                  <option value="">Semua Status</option>
                  {(["pending", "processing", "completed", "failed", "cancelled"] as const).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-display">Cari filename</span>
                <Input
                  type="search"
                  value={draft.search}
                  onChange={(e) => setDraft({ ...draft, search: e.target.value })}
                />
              </label>
            </>
          )}
        </MobileFilterSheet>

        {/* Mobile sort sheet */}
        <MobileSortSheet
          open={sortOpen}
          onOpenChange={setSortOpen}
          current={{ sort, direction }}
          options={SORT_OPTIONS}
          onSelect={(opt) => {
            navigate({ sort: opt.sort, direction: opt.direction })
            setSortOpen(false)
          }}
        />
      </AdminShell>
    </>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortableHeader({
  col,
  label,
  sort,
  direction,
  onSort,
  align = "left",
}: {
  col: string
  label: string
  sort: string
  direction: "asc" | "desc"
  onSort: (col: string) => void
  align?: "left" | "right"
}) {
  const active = sort === col
  return (
    <th
      className={`cursor-pointer select-none px-4 py-2.5 font-medium text-ink-muted hover:text-ink-body text-${align}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  )
}

function PreviewCard({
  preview,
  checked,
  onToggle,
}: {
  preview: Exclude<PreviewServerResult, { error: string }>
  checked: boolean
  onToggle: () => void
}) {
  const isDuplicate = preview.will_replace
  const periodLabel = buildPeriodLabel(
    preview.period_year_from, preview.period_month_from,
    preview.period_year_to,   preview.period_month_to
  )

  return (
    <div
      className={[
        "rounded-md border p-4",
        isDuplicate ? "border-signal bg-signal-faded" : "border-hairline bg-surface",
        !checked ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Checkbox
            id={`check-${preview.filename}`}
            checked={checked}
            onChange={onToggle}
            className="mt-0.5 shrink-0"
          />
          <label
            htmlFor={`check-${preview.filename}`}
            className="min-w-0 cursor-pointer truncate font-normal text-ink-body"
            title={preview.filename}
          >
            {preview.filename}
          </label>
        </div>
        {isDuplicate && (
          <Badge tone="signal" className="shrink-0">Replacement</Badge>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-4 pl-6 text-xs text-ink-muted">
        <span>Account: <strong className="text-ink-body">{preview.account_code}</strong></span>
        <span>Nama: <strong className="text-ink-body">{preview.account_name}</strong></span>
        <span>Tipe: <strong className="text-ink-body capitalize">{preview.report_type}</strong></span>
        <span>Periode: <strong className="text-ink-body">{periodLabel}</strong></span>
      </div>

      {isDuplicate ? (
        <div className="mt-3 overflow-hidden rounded border border-hairline pl-6 text-xs">
          <div className="grid grid-cols-3 bg-surface px-3 py-1.5 font-medium text-ink-muted">
            <span />
            <span className="text-center">Sebelumnya</span>
            <span className="text-center">File ini</span>
          </div>
          <div className="divide-y divide-hairline">
            <div className="grid grid-cols-3 px-3 py-1.5">
              <span className="text-ink-muted">Jumlah Record</span>
              <span className="text-center tabular-nums text-ink-body">{preview.existing_count.toLocaleString()}</span>
              <span className="text-center tabular-nums text-ink-body">{preview.row_count.toLocaleString()}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-4 pl-6 text-xs text-ink-muted">
          <span>Estimasi Record: <strong className="text-ink-body">{preview.row_count.toLocaleString()}</strong></span>
        </div>
      )}
    </div>
  )
}

function UnknownTemplateCard({ filename, reason }: { filename: string; reason: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950">
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        <span className="truncate font-medium text-ink-display">{filename}</span>
        <Badge tone="danger" className="shrink-0 ml-auto">Template Tidak Dikenal</Badge>
      </div>
      <p className="mt-1 text-xs text-red-700 dark:text-red-300">{reason}</p>
      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
        File ini tidak bisa diimport. Parser baru harus ditambahkan di code.
      </p>
    </div>
  )
}

function ProgressCard({ upload, onCancel }: { upload: TrackedUpload; onCancel: () => void }) {
  const isInFlight  = upload.status === "pending" || upload.status === "processing"
  const showProgress = upload.status === "processing" && upload.progress_rows > 0

  return (
    <div className="rounded-md border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-display" title={upload.filename}>
            {upload.filename}
          </p>
          {(upload.account_code || upload.period_label) && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {upload.account_code}
              {upload.account_code && upload.report_type ? " · " : ""}
              <span className="capitalize">{upload.report_type}</span>
              {upload.period_label ? " · " : ""}
              {upload.period_label}
            </p>
          )}
          {upload.status === "completed" && upload.row_count != null && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {upload.row_count.toLocaleString()} record diimport
            </p>
          )}
          {showProgress && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {upload.progress_rows.toLocaleString()} record diproses…
            </p>
          )}
          {upload.error_message && (
            <p className="mt-0.5 text-xs text-red-600 dark:text-red-400" title={upload.error_message}>
              {upload.error_message.length > 80
                ? upload.error_message.slice(0, 80) + "…"
                : upload.error_message}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={upload.status} />
          {isInFlight && (
            <Button variant="secondary" size="sm" onClick={onCancel}>
              <Ban className="mr-1 h-3 w-3" />
              Batalkan
            </Button>
          )}
        </div>
      </div>
      {(showProgress || upload.status === "pending") && (
        <div className="mt-2">
          <ProgressBar indeterminate />
        </div>
      )}
    </div>
  )
}

function UploadTableRow({ upload, onDelete }: { upload: UploadRow; onDelete: () => void }) {
  const canDelete = !upload.status.match(/^(pending|processing)$/)

  return (
    <tr>
      <td className="max-w-[200px] truncate px-4 py-3 font-medium text-ink-display" title={upload.filename}>
        {upload.filename}
      </td>
      <td className="px-4 py-3 text-ink-body">
        <div className="font-medium">{upload.account_code}</div>
        <div className="text-xs text-ink-muted">{upload.account_name}</div>
      </td>
      <td className="px-4 py-3 capitalize text-ink-body">{upload.report_type}</td>
      <td className="px-4 py-3 text-ink-body">{upload.period_label}</td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-body">
        {upload.row_count != null ? upload.row_count.toLocaleString() : "—"}
      </td>
      <td className="px-4 py-3"><StatusBadge status={upload.status} /></td>
      <td className="px-4 py-3 text-xs text-ink-muted">
        {upload.imported_at ? formatDate(upload.imported_at) : formatDate(upload.created_at)}
      </td>
      <td className="px-4 py-3">
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
            title="Hapus upload ini"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  )
}

function UploadCard({ upload, onDelete }: { upload: UploadRow; onDelete: () => void }) {
  const canDelete = !upload.status.match(/^(pending|processing)$/)
  return (
    <DataCard>
      <DataCardHeader>
        <DataCardTitle>
          <span className="break-all" title={upload.filename}>{upload.filename}</span>
        </DataCardTitle>
        <DataCardStatus><StatusBadge status={upload.status} /></DataCardStatus>
      </DataCardHeader>
      <DataCardGrid>
        <DataCardField
          wide
          label="Account"
          value={
            <>
              <div className="font-medium">{upload.account_code}</div>
              <div className="text-xs text-ink-muted">{upload.account_name}</div>
            </>
          }
        />
        <DataCardField label="Tipe" value={<span className="capitalize">{upload.report_type}</span>} />
        <DataCardField label="Periode" value={upload.period_label} />
        <DataCardField
          label="Baris"
          value={upload.row_count != null ? upload.row_count.toLocaleString() : "—"}
        />
        <DataCardField
          wide
          label="Diunggah"
          value={upload.imported_at ? formatDate(upload.imported_at) : formatDate(upload.created_at)}
        />
      </DataCardGrid>
      {canDelete && (
        <DataCardActions>
          <Button variant="ghost" size="sm" onClick={onDelete} className="gap-2 text-red-600">
            <Trash2 className="h-4 w-4" />
            Hapus
          </Button>
        </DataCardActions>
      )}
    </DataCard>
  )
}

function StatusBadge({ status }: { status: UploadStatus }) {
  switch (status) {
    case "pending":
      return <Badge tone="muted"><Clock className="mr-1 h-3 w-3" />Pending</Badge>
    case "processing":
      return <Badge tone="accent"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Processing</Badge>
    case "completed":
      return <Badge tone="success"><CheckCircle2 className="mr-1 h-3 w-3" />Completed</Badge>
    case "failed":
      return <Badge tone="danger"><XCircle className="mr-1 h-3 w-3" />Failed</Badge>
    case "cancelled":
      return <Badge tone="muted"><Ban className="mr-1 h-3 w-3" />Dibatalkan</Badge>
  }
}

function ProgressBar({ value, indeterminate }: { value?: number; indeterminate?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
      {indeterminate ? (
        <div className="h-full w-1/3 animate-[progress-slide_1.4s_ease-in-out_infinite] rounded-full bg-accent" />
      ) : (
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${Math.min(value ?? 0, 100)}%` }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function buildPeriodLabel(yf: number, mf: number, yt: number, mt: number): string {
  const from = `${MONTHS_LABEL[mf]} ${yf}`
  const to   = `${MONTHS_LABEL[mt]} ${yt}`
  return from === to ? from : `${from} – ${to}`
}

function getCsrfToken(): string {
  return (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content ?? ""
}

function xhrPost<T>(
  url: string,
  body: FormData,
  onProgress: (pct: number) => void,
  xhrRef?: React.MutableRefObject<XMLHttpRequest | null>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    if (xhrRef) xhrRef.current = xhr
    xhr.open("POST", url)
    xhr.setRequestHeader("X-CSRF-Token", getCsrfToken())
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhrRef) xhrRef.current = null
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(data as T)
        else reject(new Error(data?.error ?? `HTTP ${xhr.status}`))
      } catch {
        reject(new Error("Response parse error"))
      }
    }
    xhr.onerror = () => reject(new Error("Network error saat upload."))
    xhr.onabort = () => reject(new Error("Upload dibatalkan."))
    xhr.send(body)
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}
