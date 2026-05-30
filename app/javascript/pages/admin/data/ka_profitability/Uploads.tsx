import * as React from "react"
import { Head, router } from "@inertiajs/react"
import { uploadFilesSequentially } from "@/lib/uploadFiles"
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ChevronsUpDown,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react"
import { AdminShell } from "@/components/AdminShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DataCard,
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
import { Select } from "@/components/ui/select"
import { consumer } from "@/lib/actioncable"
import {
  parseKaProfitabilityForPreview,
  type KaProfitabilityPreviewResult,
} from "@/lib/kaProfitabilityPreviewParser"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UploadStatus = "pending" | "processing" | "completed" | "failed" | "cancelled"

type UploadRow = {
  id: number
  filename: string
  fiscal_year: string
  status: UploadStatus
  outlet_count: number | null
  record_count: number | null
  is_latest: boolean
  error_message: string | null
  imported_at: string | null
  created_at: string
  uploaded_by: string | null
}

type ExistingUploadInfo = {
  id: number
  filename: string
  imported_at: string | null
  created_at: string
}

type ServerPreviewResult =
  | {
      filename: string
      fiscal_year: string
      outlet_count: number
      row_count: number
      existing_upload: ExistingUploadInfo | null
      will_replace: boolean
      error?: never
    }
  | { filename: string; error: string }

type TrackedUpload = {
  id: number
  filename: string
  fiscal_year: string
  status: UploadStatus
  record_count: number | null
  error_message: string | null
  progress_rows: number
}

type StatusUpdate = {
  type: "status_update"
  upload_id: number
  status: UploadStatus
  record_count: number | null
  error_message: string | null
}

type ProgressUpdate = {
  type: "progress_update"
  upload_id: number
  progress_rows: number
}

type Filters = {
  status: string | null
  fiscal_year: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCsrfToken(): string {
  return (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content ?? ""
}

const SORT_OPTIONS: SortOption[] = [
  { sort: "created_at", direction: "desc", label: "Tanggal terbaru" },
  { sort: "created_at", direction: "asc", label: "Tanggal terlama" },
  { sort: "filename", direction: "asc", label: "Filename A–Z" },
  { sort: "filename", direction: "desc", label: "Filename Z–A" },
  { sort: "fiscal_year", direction: "desc", label: "Fiscal Year terbaru" },
  { sort: "fiscal_year", direction: "asc", label: "Fiscal Year terlama" },
  { sort: "status", direction: "asc", label: "Status A–Z" },
  { sort: "status", direction: "desc", label: "Status Z–A" },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminKaProfitabilityUploads({
  uploads,
  total,
  page,
  per_page,
  sort,
  direction,
  filters,
  available_fiscal_years,
}: {
  uploads: UploadRow[]
  total: number
  page: number
  per_page: number
  sort: string
  direction: "asc" | "desc"
  filters: Filters
  available_fiscal_years: string[]
}) {
  const fileInputRef   = React.useRef<HTMLInputElement>(null)
  const folderInputRef = React.useRef<HTMLInputElement>(null)
  const activeXhrRef   = React.useRef<XMLHttpRequest | null>(null)
  const importAbortedRef = React.useRef(false)
  const cancelledRef   = React.useRef(false)

  const [parseResults, setParseResults]     = React.useState<KaProfitabilityPreviewResult[] | null>(null)
  const [serverPreviews, setServerPreviews] = React.useState<ServerPreviewResult[] | null>(null)
  const [workerProgress, setWorkerProgress] = React.useState<{ total: number; done: number } | null>(null)
  const [serverQuerying, setServerQuerying] = React.useState(false)
  const [importFiles, setImportFiles]       = React.useState<File[]>([])
  const [importing, setImporting]           = React.useState(false)
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null)
  const [dragOver, setDragOver]             = React.useState(false)
  const [checkedFiles, setCheckedFiles]     = React.useState<Set<string>>(new Set())
  const [trackedUploads, setTrackedUploads] = React.useState<TrackedUpload[]>([])

  // Live-update history rows for in-flight uploads visible in the table
  const [liveUploads, setLiveUploads] = React.useState<UploadRow[]>(uploads)
  React.useEffect(() => { setLiveUploads(uploads) }, [uploads])

  // Mobile filter / sort sheets
  const { filterOpen, setFilterOpen, sortOpen, setSortOpen, activeFilterCount, applyFilters, resetFilters } =
    useMobileFilterSort(filters, navigate, [ "status", "fiscal_year" ] as const)
  const sortLabel =
    SORT_OPTIONS.find((o) => o.sort === sort && o.direction === direction)?.label ?? "Urutkan"

  const isInProgressView = trackedUploads.length > 0
  const isIdleView       = !isInProgressView && !parseResults && !workerProgress && !serverQuerying && !serverPreviews
  const isPreviewView    = !!serverPreviews && !importing && !isInProgressView
  const noneChecked      = checkedFiles.size === 0

  const TERMINAL: UploadStatus[] = ["completed", "failed", "cancelled"]
  const allDone      = isInProgressView && trackedUploads.every((u) => TERMINAL.includes(u.status))
  const successCount = trackedUploads.filter((u) => u.status === "completed").length
  const cancelCount  = trackedUploads.filter((u) => u.status === "cancelled").length
  const failCount    = trackedUploads.filter((u) => u.status === "failed").length

  // Subscribe to ActionCable for uploads in the current progress view
  React.useEffect(() => {
    if (trackedUploads.length === 0) return
    const subs = trackedUploads.map((u) =>
      consumer.subscriptions.create(
        { channel: "KaProfitabilityUploadChannel", upload_id: u.id },
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
                  record_count:  data.record_count ?? t.record_count,
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
        { channel: "KaProfitabilityUploadChannel", upload_id: id },
        {
          received(data: StatusUpdate | ProgressUpdate) {
            if (data.type !== "status_update") return
            setLiveUploads((prev) =>
              prev.map((u) =>
                u.id === data.upload_id
                  ? {
                      ...u,
                      status:        data.status,
                      record_count:  data.record_count ?? u.record_count,
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

  const trackedIds = React.useMemo(() => new Set(trackedUploads.map((u) => u.id)), [trackedUploads])
  const visibleUploads = React.useMemo(
    () => liveUploads.filter((u) => !trackedIds.has(u.id)),
    [liveUploads, trackedIds]
  )

  // -------------------------------------------------------------------------
  // Navigation (filters / sort / pagination)
  // -------------------------------------------------------------------------

  function navigate(overrides: Record<string, string | number | undefined | null>) {
    const current: Record<string, string | number | undefined | null> = {
      status:      filters.status      ?? undefined,
      fiscal_year: filters.fiscal_year ?? undefined,
      sort:        sort !== "created_at" ? sort : undefined,
      direction:   direction !== "desc" ? direction : undefined,
      page:        page > 1 ? page : undefined,
    }
    const next: Record<string, string | undefined> = {}
    const merged = { ...current, ...overrides }
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== "") next[k] = String(v)
    }
    router.get("/admin/data/ka-profitability/uploads", next, {
      preserveState: true,
      replace:       true,
    })
  }

  function handleSortClick(column: string) {
    if (sort === column) {
      navigate({ sort: column, direction: direction === "asc" ? "desc" : "asc", page: undefined })
    } else {
      navigate({ sort: column, direction: "desc", page: undefined })
    }
  }

  function handleFilterChange(key: keyof Filters, value: string) {
    navigate({ [key]: value || undefined, page: undefined })
  }

  // -------------------------------------------------------------------------
  // File selection
  // -------------------------------------------------------------------------

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    const xlsx = Array.from(files).filter((f) => f.name.endsWith(".xlsx"))
    if (xlsx.length === 0) return
    startWorkerPreview(xlsx)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) handleFilesSelected(files)
  }

  async function startWorkerPreview(files: File[]) {
    cancelledRef.current = false
    setImportFiles(files)
    setParseResults(null)
    setServerPreviews(null)
    setWorkerProgress({ total: files.length, done: 0 })

    const results: KaProfitabilityPreviewResult[] = []
    for (const file of files) {
      if (cancelledRef.current) return
      const result = await parseKaProfitabilityForPreview(file)
      results.push(result)
      if (cancelledRef.current) return
      setWorkerProgress((p) => (p ? { ...p, done: p.done + 1 } : null))
    }

    if (cancelledRef.current) return
    setParseResults(results)
    await runServerPreview(results)
  }

  async function runServerPreview(results: KaProfitabilityPreviewResult[]) {
    setWorkerProgress(null)
    setServerQuerying(true)

    try {
      const knownMeta = results
        .filter((r): r is Exclude<KaProfitabilityPreviewResult, { unknown: true }> => !r.unknown)
        .map((r) => ({
          filename:     r.filename,
          fiscal_year:  r.fiscalYear,
          outlet_count: r.outletCount,
          row_count:    r.rowCount,
        }))

      const serverMap = new Map<string, ServerPreviewResult>()

      if (knownMeta.length > 0) {
        const resp = await fetch("/admin/data/ka-profitability/uploads/preview", {
          method:      "POST",
          headers:     { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
          credentials: "same-origin",
          body:        JSON.stringify({ files_metadata: knownMeta }),
        })
        if (resp.ok) {
          const data: ServerPreviewResult[] = await resp.json()
          data.forEach((r) => serverMap.set(r.filename, r))
        }
      }

      const finalPreviews: ServerPreviewResult[] = results.map((r) => {
        if (r.unknown) return { filename: r.filename, error: r.reason }
        return serverMap.get(r.filename) ?? { filename: r.filename, error: "Tidak ada hasil dari server." }
      })

      if (cancelledRef.current) return
      setServerPreviews(finalPreviews)

      const initialChecked = new Set(
        finalPreviews
          .filter((p): p is Exclude<ServerPreviewResult, { error: string }> =>
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

  function resetInputs() {
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (folderInputRef.current) folderInputRef.current.value = ""
  }

  function toggleFile(filename: string) {
    setCheckedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  async function handleConfirmImport() {
    const filesToImport = importFiles.filter((f) => checkedFiles.has(f.name))
    if (!filesToImport.length) return
    setImporting(true)
    setUploadProgress(0)
    importAbortedRef.current = false

    // Build initial tracked uploads — fiscal_year from preview
    const previewMap = new Map(
      (serverPreviews ?? [])
        .filter((p): p is Exclude<ServerPreviewResult, { error: string }> => !("error" in p))
        .map((p) => [p.filename, p])
    )

    try {
      const { uploaded, errors, aborted } = await uploadFilesSequentially<{ queued: number; upload_ids: number[] }>({
        url: "/admin/data/ka-profitability/uploads",
        files: filesToImport,
        abortRef: importAbortedRef,
        xhrRef: activeXhrRef,
        onProgress: setUploadProgress,
      })
      if (aborted) return

      const initial: TrackedUpload[] = uploaded.flatMap(({ file, data }) => {
        const id = data.upload_ids[0]
        if (id == null) return []
        const preview = previewMap.get(file.name)
        return [{
          id,
          filename:      file.name,
          fiscal_year:   preview?.fiscal_year ?? "",
          status:        "pending" as UploadStatus,
          record_count:  null,
          error_message: null,
          progress_rows: 0,
        }]
      })

      if (errors.length) alert(`Sebagian file gagal diunggah:\n${errors.join("\n")}`)

      setServerPreviews(null)
      setParseResults(null)
      setCheckedFiles(new Set())
      setImportFiles([])
      setUploadProgress(null)
      setTrackedUploads(initial)
      router.reload({ only: ["uploads"] })
    } finally {
      setImporting(false)
      setUploadProgress(null)
    }
  }

  function handleAbortImport() {
    importAbortedRef.current = true
    activeXhrRef.current?.abort()
    setImporting(false)
    setUploadProgress(null)
  }

  async function handleCancelUpload(id: number) {
    await fetch(`/admin/data/ka-profitability/uploads/${id}/cancel`, {
      method:  "PATCH",
      headers: { "X-CSRF-Token": getCsrfToken() },
    })
  }

  function handleUploadAgain() {
    setTrackedUploads([])
    router.reload()
    resetInputs()
  }

  // -------------------------------------------------------------------------
  // Pagination helpers
  // -------------------------------------------------------------------------

  const totalPages  = Math.ceil(total / per_page)
  const rangeStart  = total === 0 ? 0 : (page - 1) * per_page + 1
  const rangeEnd    = Math.min(page * per_page, total)

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <Head title="KA Profitability">
        <meta name="description" content="Upload dan kelola laporan profitabilitas per Key Account." />
        <meta property="og:title" content="KA Profitability" />
        <meta property="og:description" content="Upload dan kelola laporan profitabilitas per Key Account." />
      </Head>
      <AdminShell>
        {/* Header */}
        <div className="border-b border-hairline pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1>KA Profitability</h1>
              <p className="mt-1">Upload file Excel profitabilitas per Key Account (INDOMARET, MIDI, SAT, dll.).</p>
            </div>
            {isIdleView && (
              <>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload File
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => folderInputRef.current?.click()}
                    disabled={importing}
                  >
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
            onDrop={handleDrop}
            className={[
              "mt-6 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragOver ? "border-accent bg-surface" : "border-hairline",
            ].join(" ")}
          >
            <FileSpreadsheet className="mb-3 h-10 w-10 text-ink-muted" />
            <p className="text-sm font-medium text-ink-display">
              Drag &amp; drop file .xlsx ke sini, atau klik Upload File
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Format: <code>Profitability_*.xlsx</code>
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Sheet yang dibaca: <strong>Detail</strong>
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
                  Membaca file… {workerProgress.done}/{workerProgress.total}
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
            <span className="text-sm">Mengambil info duplikat…</span>
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
                  <PreviewErrorCard key={p.filename} filename={p.filename} error={p.error} />
                ) : (
                  <PreviewCard
                    key={p.filename}
                    preview={p as Exclude<ServerPreviewResult, { error: string }>}
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
                    {uploadProgress < 100
                      ? `Mengirim file… ${uploadProgress}%`
                      : "File terkirim, menunggu antrian…"}
                  </p>
                  {uploadProgress < 100 && (
                    <Button variant="ghost" size="sm" onClick={handleAbortImport}>
                      <Ban className="mr-1 h-3 w-3" />
                      Batal
                    </Button>
                  )}
                </div>
                <ProgressBar value={uploadProgress} />
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <Button
                variant="primary"
                onClick={handleConfirmImport}
                disabled={importing || noneChecked}
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {uploadProgress !== null && uploadProgress < 100
                      ? `Mengirim… ${uploadProgress}%`
                      : "Mengantri…"}
                  </>
                ) : (
                  "Konfirmasi Import"
                )}
              </Button>
              <Button variant="secondary" onClick={handleCancelPreview} disabled={importing}>
                Batal
              </Button>
            </div>
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

          {/* Filter bar (desktop) */}
          <div className="mb-4 hidden flex-wrap gap-3 md:flex">
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-status" className="font-normal text-ink-body text-sm">
                Status
              </label>
              <select
                id="filter-status"
                value={filters.status ?? ""}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                className="rounded border border-hairline bg-page px-2 py-1 text-sm text-ink-body focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Semua</option>
                <option value="completed">Selesai</option>
                <option value="processing">Memproses</option>
                <option value="failed">Gagal</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>

            {available_fiscal_years.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label htmlFor="filter-fiscal-year" className="font-normal text-ink-body text-sm">
                  Fiscal Year
                </label>
                <select
                  id="filter-fiscal-year"
                  value={filters.fiscal_year ?? ""}
                  onChange={(e) => handleFilterChange("fiscal_year", e.target.value)}
                  className="rounded border border-hairline bg-page px-2 py-1 text-sm text-ink-body focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Semua</option>
                  {available_fiscal_years.map((fy) => (
                    <option key={fy} value={fy}>{fy}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Filter + Sort bar (mobile) */}
          <div className="mb-4 md:hidden">
            <MobileFilterSortBar
              filterCount={activeFilterCount}
              sortLabel={sortLabel}
              onFilterClick={() => setFilterOpen(true)}
              onSortClick={() => setSortOpen(true)}
            />
          </div>

          {visibleUploads.length === 0 && !isInProgressView ? (
            <p className="text-sm text-ink-muted">
              {filters.status || filters.fiscal_year
                ? "Tidak ada upload yang cocok dengan filter ini."
                : "Belum ada upload."}
            </p>
          ) : visibleUploads.length > 0 ? (
            <>
              {/* Mobile card list */}
              <div className="space-y-3 md:hidden">
                {visibleUploads.map((u) => (
                  <UploadCard key={u.id} upload={u} />
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-md border border-hairline md:block">
                <table className="w-full text-sm">
                  <thead className="bg-surface">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-ink-muted">
                        <SortableHeader
                          label="File"
                          column="filename"
                          currentSort={sort}
                          direction={direction}
                          onClick={handleSortClick}
                        />
                      </th>
                      <th className="px-4 py-2.5 text-left font-medium text-ink-muted">
                        <SortableHeader
                          label="Fiscal Year"
                          column="fiscal_year"
                          currentSort={sort}
                          direction={direction}
                          onClick={handleSortClick}
                        />
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Outlet</th>
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Records</th>
                      <th className="px-4 py-2.5 text-left font-medium text-ink-muted">
                        <SortableHeader
                          label="Status"
                          column="status"
                          currentSort={sort}
                          direction={direction}
                          onClick={handleSortClick}
                        />
                      </th>
                      <th className="px-4 py-2.5 text-left font-medium text-ink-muted">
                        <SortableHeader
                          label="Waktu"
                          column="created_at"
                          currentSort={sort}
                          direction={direction}
                          onClick={handleSortClick}
                        />
                      </th>
                      <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Upload oleh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {visibleUploads.map((u) => (
                      <UploadTableRow key={u.id} upload={u} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-3 flex items-center justify-between gap-4">
                <p className="text-xs text-ink-muted">
                  {total === 0
                    ? "Tidak ada upload"
                    : `Menampilkan ${rangeStart}–${rangeEnd} dari ${total} upload`}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => navigate({ page: page - 1 })}
                  >
                    ← Sebelumnya
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => navigate({ page: page + 1 })}
                  >
                    Berikutnya →
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Mobile filter sheet */}
        <MobileFilterSheet
          open={filterOpen}
          onOpenChange={setFilterOpen}
          initial={{
            status: filters.status ?? "",
            fiscal_year: filters.fiscal_year ?? "",
          }}
          onApply={applyFilters}
          onReset={resetFilters}
        >
          {(draft, setDraft) => (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-display">Status</span>
                <Select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                >
                  <option value="">Semua</option>
                  <option value="completed">Selesai</option>
                  <option value="processing">Memproses</option>
                  <option value="failed">Gagal</option>
                  <option value="cancelled">Dibatalkan</option>
                </Select>
              </label>
              {available_fiscal_years.length > 0 && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-ink-display">Fiscal Year</span>
                  <Select
                    value={draft.fiscal_year}
                    onChange={(e) => setDraft({ ...draft, fiscal_year: e.target.value })}
                  >
                    <option value="">Semua</option>
                    {available_fiscal_years.map((fy) => (
                      <option key={fy} value={fy}>{fy}</option>
                    ))}
                  </Select>
                </label>
              )}
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
  label,
  column,
  currentSort,
  direction,
  onClick,
}: {
  label: string
  column: string
  currentSort: string
  direction: "asc" | "desc"
  onClick: (column: string) => void
}) {
  const isActive = currentSort === column
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-ink-display"
      onClick={() => onClick(column)}
    >
      {label}
      {isActive ? (
        direction === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  )
}

function PreviewCard({
  preview,
  checked,
  onToggle,
}: {
  preview: Exclude<ServerPreviewResult, { error: string }>
  checked: boolean
  onToggle: () => void
}) {
  const isDuplicate = preview.will_replace
  const existingDate = preview.existing_upload
    ? new Date(preview.existing_upload.imported_at ?? preview.existing_upload.created_at).toLocaleDateString(
        "id-ID", { day: "numeric", month: "short", year: "numeric" }
      )
    : null

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
          <Badge tone="signal" className="shrink-0">
            Supersede
          </Badge>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-4 pl-6 text-xs text-ink-muted">
        <span>
          Fiscal Year:{" "}
          <strong className="text-ink-body">{preview.fiscal_year}</strong>
        </span>
        <span>
          Estimasi outlet:{" "}
          <strong className="text-ink-body">{preview.outlet_count.toLocaleString("id-ID")}</strong>
        </span>
        <span>
          Estimasi records:{" "}
          <strong className="text-ink-body">{preview.row_count.toLocaleString("id-ID")}</strong>
        </span>
      </div>

      {isDuplicate && preview.existing_upload && (
        <div className="mt-2 pl-6">
          <p className="text-xs text-signal-text">
            Data fiscal year <strong>{preview.fiscal_year}</strong> sudah ada (upload terakhir:{" "}
            <strong>{existingDate}</strong> — {preview.existing_upload.filename}).
            File ini akan menjadi dataset terbaru (upload lama tetap tersimpan di riwayat).
          </p>
        </div>
      )}
    </div>
  )
}

function PreviewErrorCard({ filename, error }: { filename: string; error: string }) {
  return (
    <div className="rounded-md border border-danger bg-danger-faded p-4">
      <p className="truncate text-sm font-medium text-ink-display" title={filename}>
        {filename}
      </p>
      <p className="mt-1 text-xs text-danger-text">{error}</p>
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
          {upload.fiscal_year && (
            <p className="mt-0.5 text-xs text-ink-muted">Fiscal Year: {upload.fiscal_year}</p>
          )}
          {upload.status === "completed" && upload.record_count != null && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {upload.record_count.toLocaleString("id-ID")} records diimport
            </p>
          )}
          {showProgress && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {upload.progress_rows.toLocaleString("id-ID")} records diproses…
            </p>
          )}
          {upload.error_message && (
            <p
              className="mt-0.5 text-xs text-red-600 dark:text-red-400"
              title={upload.error_message}
            >
              {upload.error_message.length > 80
                ? upload.error_message.slice(0, 80) + "…"
                : upload.error_message}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={upload.status} errorMessage={upload.error_message} />
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

function UploadTableRow({ upload }: { upload: UploadRow }) {
  const date = new Date(upload.created_at).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  })
  const time = new Date(upload.created_at).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit",
  })

  return (
    <tr className="hover:bg-surface/50">
      <td className="max-w-[220px] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="truncate text-ink-body" title={upload.filename}>
            {upload.filename}
          </span>
          {upload.is_latest && (
            <Badge tone="success" className="shrink-0 text-xs">
              Terbaru
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-ink-body">{upload.fiscal_year}</td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-body">
        {upload.outlet_count != null ? upload.outlet_count.toLocaleString("id-ID") : "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-body">
        {upload.record_count != null ? upload.record_count.toLocaleString("id-ID") : "—"}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={upload.status} errorMessage={upload.error_message} />
      </td>
      <td className="px-4 py-3 text-ink-muted">
        {date} {time}
      </td>
      <td className="px-4 py-3 text-ink-muted">{upload.uploaded_by ?? "—"}</td>
    </tr>
  )
}

function UploadCard({ upload }: { upload: UploadRow }) {
  const date = new Date(upload.created_at).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  })
  const time = new Date(upload.created_at).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit",
  })

  return (
    <DataCard>
      <DataCardHeader>
        <DataCardTitle>
          <span className="break-all" title={upload.filename}>{upload.filename}</span>
          {upload.is_latest && (
            <Badge tone="success" className="ml-2 align-middle text-xs">Terbaru</Badge>
          )}
        </DataCardTitle>
        <DataCardStatus>
          <StatusBadge status={upload.status} errorMessage={upload.error_message} />
        </DataCardStatus>
      </DataCardHeader>
      <DataCardGrid>
        <DataCardField label="Fiscal Year" value={upload.fiscal_year || "—"} />
        <DataCardField
          label="Outlet"
          value={upload.outlet_count != null ? upload.outlet_count.toLocaleString("id-ID") : "—"}
        />
        <DataCardField
          label="Records"
          value={upload.record_count != null ? upload.record_count.toLocaleString("id-ID") : "—"}
        />
        <DataCardField label="Diunggah" value={`${date} ${time}`} />
        <DataCardField wide label="Oleh" value={upload.uploaded_by ?? "—"} />
      </DataCardGrid>
    </DataCard>
  )
}

function StatusBadge({
  status,
  errorMessage,
}: {
  status: UploadStatus
  errorMessage: string | null
}) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Selesai
        </span>
      )
    case "processing":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Memproses
        </span>
      )
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
          <Clock className="h-3.5 w-3.5" />
          Menunggu
        </span>
      )
    case "failed":
      return (
        <span
          className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
          title={errorMessage ?? undefined}
        >
          <XCircle className="h-3.5 w-3.5" />
          Gagal
        </span>
      )
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
          <Ban className="h-3.5 w-3.5" />
          Dibatalkan
        </span>
      )
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
