import * as React from "react"
import { Head, router } from "@inertiajs/react"
import { parseOutletDistForPreview } from "@/lib/outletDistPreviewParser"
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
import { Input } from "@/components/ui/input"
import { MobileFilterSheet } from "@/components/ui/mobile-filter-sheet"
import { MobileFilterSortBar } from "@/components/ui/mobile-filter-sort-bar"
import { MobileSortSheet, type SortOption } from "@/components/ui/mobile-sort-sheet"
import { useMobileFilterSort } from "@/hooks/use-mobile-filter-sort"
import { Select } from "@/components/ui/select"
import { consumer } from "@/lib/actioncable"

const SORT_OPTIONS: SortOption[] = [
  { sort: "created_at", direction: "desc", label: "Tanggal terbaru" },
  { sort: "created_at", direction: "asc", label: "Tanggal terlama" },
  { sort: "dist_name", direction: "asc", label: "Distributor A–Z" },
  { sort: "dist_name", direction: "desc", label: "Distributor Z–A" },
  { sort: "row_count", direction: "desc", label: "Outlet terbanyak" },
  { sort: "row_count", direction: "asc", label: "Outlet paling sedikit" },
  { sort: "replaced_row_count", direction: "desc", label: "Diganti terbanyak" },
  { sort: "replaced_row_count", direction: "asc", label: "Diganti paling sedikit" },
  { sort: "status", direction: "asc", label: "Status A–Z" },
  { sort: "status", direction: "desc", label: "Status Z–A" },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UploadStatus = "pending" | "processing" | "completed" | "failed" | "cancelled"

type UploadRow = {
  id: number
  filename: string
  dist_sap_code: string
  dist_name: string
  status: UploadStatus
  row_count: number | null
  replaced_row_count: number
  error_message: string | null
  imported_at: string | null
  created_at: string
  uploaded_by: string | null
}

type WorkerFileResult =
  | { filename: string; rowCount: number; distSapCode: string; distName: string }
  | { filename: string; error: string }

type PreviewResult =
  | {
      filename: string
      dist_sap_code: string
      dist_name: string
      row_count: number
      existing_row_count: number
      will_replace: boolean
      is_unchanged: boolean
      error?: never
    }
  | { filename: string; error: string }

type TrackedUpload = {
  id: number
  filename: string
  dist_name: string
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
  dist_name: string | null
  status: string | null
  search: string | null
}

// ---------------------------------------------------------------------------
// Page props
// ---------------------------------------------------------------------------

export default function AdminMasterOutletDistUploads({
  uploads,
  total,
  page,
  per_page,
  sort,
  direction,
  filters,
  available_dist_names,
}: {
  uploads: UploadRow[]
  total: number
  page: number
  per_page: number
  sort: string
  direction: "asc" | "desc"
  filters: Filters
  available_dist_names: string[]
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const folderInputRef = React.useRef<HTMLInputElement>(null)
  const activeXhrRef = React.useRef<XMLHttpRequest | null>(null)
  const serverAbortRef = React.useRef<AbortController | null>(null)
  const cancelledRef = React.useRef(false)

  const [previews, setPreviews] = React.useState<PreviewResult[] | null>(null)
  const [workerProgress, setWorkerProgress] = React.useState<{ total: number; done: number } | null>(null)
  const [serverQuerying, setServerQuerying] = React.useState(false)
  const [importFiles, setImportFiles] = React.useState<File[]>([])
  const [importing, setImporting] = React.useState(false)
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [checkedFiles, setCheckedFiles] = React.useState<Set<string>>(new Set())
  const [trackedUploads, setTrackedUploads] = React.useState<TrackedUpload[]>([])
  const [searchValue, setSearchValue] = React.useState(filters.search ?? "")

  React.useEffect(() => {
    setSearchValue(filters.search ?? "")
  }, [filters.search])

  // Subscribe to ActionCable for in-progress uploads
  React.useEffect(() => {
    if (trackedUploads.length === 0) return
    const subs = trackedUploads.map((u) =>
      consumer.subscriptions.create(
        { channel: "MasterOutletDistUploadChannel", upload_id: u.id },
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
                  status: data.status,
                  row_count: data.row_count ?? t.row_count,
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
        { channel: "MasterOutletDistUploadChannel", upload_id: id },
        {
          received(data: StatusUpdate | ProgressUpdate) {
            if (data.type !== "status_update") return
            setLiveUploads((prev) =>
              prev.map((u) =>
                u.id === data.upload_id
                  ? {
                      ...u,
                      status: data.status,
                      row_count: data.row_count ?? u.row_count,
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

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  function navigate(overrides: Record<string, string | number | null>) {
    const params: Record<string, string | number> = {}
    if (filters.dist_name) params.dist_name = filters.dist_name
    if (filters.status)    params.status    = filters.status
    if (filters.search)    params.search    = filters.search
    if (sort !== "created_at")  params.sort      = sort
    if (direction !== "desc")   params.direction = direction
    if (page > 1) params.page = page
    Object.entries(overrides).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== "") params[k] = v as string | number
      else delete params[k]
    })
    router.get("/admin/master-outlet-dist/uploads", params as Record<string, string>, {
      preserveScroll: false,
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
    setPreviews(null)
    setWorkerProgress({ total: files.length, done: 0 })

    const collected: WorkerFileResult[] = []
    for (const file of files) {
      if (cancelledRef.current) return
      try {
        const { rowCount, distSapCode, distName } = await parseOutletDistForPreview(file)
        collected.push({ filename: file.name, rowCount, distSapCode, distName })
      } catch (err) {
        collected.push({
          filename: file.name,
          error: err instanceof Error ? err.message : "Gagal membaca file",
        })
      }
      if (cancelledRef.current) return
      setWorkerProgress((prev) => prev ? { ...prev, done: prev.done + 1 } : null)
    }

    if (!cancelledRef.current) await runServerPreview(collected, files)
  }

  async function runServerPreview(workerResults: WorkerFileResult[], originalFiles: File[]) {
    setWorkerProgress(null)
    setServerQuerying(true)

    const abortController = new AbortController()
    serverAbortRef.current = abortController

    try {
      const metadata = workerResults.map((r) => ({
        filename:      r.filename,
        row_count:     "rowCount" in r ? r.rowCount : 0,
        dist_sap_code: "rowCount" in r ? r.distSapCode : "",
        dist_name:     "rowCount" in r ? r.distName : "",
      }))

      const resp = await fetch("/admin/master-outlet-dist/uploads/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        credentials: "same-origin",
        body: JSON.stringify({ files_metadata: metadata }),
        signal: abortController.signal,
      })

      if (cancelledRef.current) return
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? `HTTP ${resp.status}`)
      }

      const serverResults: PreviewResult[] = await resp.json()
      const serverMap = new Map(serverResults.map((p) => [p.filename, p]))

      const finalPreviews: PreviewResult[] = workerResults.map((r) => {
        if ("error" in r) return { filename: r.filename, error: r.error }
        return serverMap.get(r.filename) ?? { filename: r.filename, error: "Tidak ada hasil dari server" }
      })

      if (cancelledRef.current) return
      setPreviews(finalPreviews)

      const initialChecked = new Set(
        finalPreviews
          .filter((p): p is Exclude<PreviewResult, { error: string }> => !("error" in p) && !p.will_replace)
          .map((p) => p.filename)
      )
      setCheckedFiles(initialChecked)
    } catch (err) {
      if (cancelledRef.current || (err instanceof DOMException && err.name === "AbortError")) return
      setPreviews(originalFiles.map((f) => ({ filename: f.name, error: "Network error" })))
    } finally {
      serverAbortRef.current = null
      if (!cancelledRef.current) setServerQuerying(false)
    }
  }

  function handleCancelPreviewInProgress() {
    cancelledRef.current = true
    serverAbortRef.current?.abort()
    serverAbortRef.current = null
    setWorkerProgress(null)
    setServerQuerying(false)
    setImportFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (folderInputRef.current) folderInputRef.current.value = ""
  }

  function handleAbortImport() {
    activeXhrRef.current?.abort()
    activeXhrRef.current = null
    setImporting(false)
    setUploadProgress(null)
  }

  function handleCancelPreview() {
    setPreviews(null)
    setImportFiles([])
    setCheckedFiles(new Set())
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (folderInputRef.current) folderInputRef.current.value = ""
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
        "/admin/master-outlet-dist/uploads",
        fd,
        (pct) => setUploadProgress(pct),
        activeXhrRef
      )

      // Build initial tracked uploads — dist_name from preview
      const previewMap = new Map(
        (previews ?? [])
          .filter((p): p is Exclude<PreviewResult, { error: string }> => !("error" in p))
          .map((p) => [p.filename, p.dist_name])
      )

      const initial: TrackedUpload[] = data.upload_ids.map((id, idx) => ({
        id,
        filename:     filesToImport[idx]?.name ?? `upload-${id}`,
        dist_name:    previewMap.get(filesToImport[idx]?.name ?? "") ?? "",
        status:       "pending" as UploadStatus,
        row_count:    null,
        error_message: null,
        progress_rows: 0,
      }))

      setPreviews(null)
      setImportFiles([])
      setCheckedFiles(new Set())
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
    await fetch(`/admin/master-outlet-dist/uploads/${id}/cancel`, {
      method: "PATCH",
      headers: { "X-CSRF-Token": getCsrfToken() },
    })
  }

  function handleUploadAgain() {
    setTrackedUploads([])
    router.reload({ only: ["uploads"] })
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function toggleFile(filename: string) {
    setCheckedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFilesSelected(e.dataTransfer.files)
  }

  function handleSortColumn(col: string) {
    if (sort === col) {
      navigate({ direction: direction === "asc" ? "desc" : "asc", page: null })
    } else {
      navigate({ sort: col, direction: "asc", page: null })
    }
  }

  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------

  const noneChecked = checkedFiles.size === 0
  const isInProgressView = trackedUploads.length > 0

  const TERMINAL: UploadStatus[] = ["completed", "failed", "cancelled"]
  const allDone = isInProgressView && trackedUploads.every((u) => TERMINAL.includes(u.status))
  const successCount = trackedUploads.filter((u) => u.status === "completed").length
  const cancelCount  = trackedUploads.filter((u) => u.status === "cancelled").length
  const failCount    = trackedUploads.filter((u) => u.status === "failed").length

  const hasActiveFilter = !!(filters.dist_name || filters.status || filters.search)

  // Mobile filter / sort sheets
  const { filterOpen, setFilterOpen, sortOpen, setSortOpen, activeFilterCount, applyFilters, resetFilters } =
    useMobileFilterSort(filters, navigate, [ "dist_name", "status", "search" ] as const)
  const sortLabel =
    SORT_OPTIONS.find((o) => o.sort === sort && o.direction === direction)?.label ?? "Urutkan"
  const totalPages = Math.ceil(total / per_page)

  const trackedIds = React.useMemo(() => new Set(trackedUploads.map((u) => u.id)), [trackedUploads])
  const visibleUploads = React.useMemo(
    () => liveUploads.filter((u) => !trackedIds.has(u.id)),
    [liveUploads, trackedIds]
  )

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <Head title="Master Outlet Dist">
        <meta name="description" content="Upload dan kelola file Master Outlet Distributor." />
        <meta property="og:title" content="Master Outlet Dist" />
        <meta property="og:description" content="Upload dan kelola file Master Outlet Distributor." />
      </Head>
      <AdminShell>
        {/* Header */}
        <div className="border-b border-hairline pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1>Master Outlet Dist</h1>
              <p className="mt-1">Upload file Excel outlet per distributor ke database.</p>
            </div>
            {!isInProgressView && (
              <>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!!workerProgress || serverQuerying || importing}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload File
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => folderInputRef.current?.click()}
                    disabled={!!workerProgress || serverQuerying || importing}
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
        {!isInProgressView && !previews && !workerProgress && !serverQuerying && (
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
              Drag &amp; drop file .xlsx ke sini, atau pilih folder
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Format: <code>OUTLET_DIST_*.xlsx</code> — satu file per distributor
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Sheet yang dibaca: <strong>OUTLET DISTRIBUTOR</strong>
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
          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-ink-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Mengambil info duplikat…</span>
            </div>
          </div>
        )}

        {/* Preview panel */}
        {!isInProgressView && previews && !serverQuerying && (
          <div className="mt-6">
            <h2 className="mb-1">Preview Import</h2>
            <p className="mb-4 text-sm text-ink-muted">
              Periksa detail berikut sebelum memulai import.
            </p>
            <div className="space-y-3">
              {previews.map((p) =>
                "error" in p && p.error ? (
                  <PreviewErrorCard key={p.filename} filename={p.filename} error={p.error} />
                ) : (
                  <PreviewCard
                    key={p.filename}
                    preview={p as Exclude<PreviewResult, { error: string }>}
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
              value={filters.dist_name ?? ""}
              onChange={(e) => navigate({ dist_name: e.target.value || null, page: null })}
              className="w-56"
            >
              <option value="">Semua Distributor</option>
              {available_dist_names.map((n) => (
                <option key={n} value={n}>{n}</option>
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
                onClick={() => navigate({ dist_name: null, status: null, search: null, page: null })}
              >
                Reset filter
              </Button>
            )}
          </div>

          {/* Table */}
          {uploads.length === 0 ? (
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
                  <UploadCard key={u.id} upload={u} />
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-md border border-hairline md:block">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-ink-muted">File</th>
                    <SortableHeader
                      col="dist_name" label="Distributor"
                      sort={sort} direction={direction} onSort={handleSortColumn}
                    />
                    <SortableHeader
                      col="row_count" label="Jumlah Outlet" align="right"
                      sort={sort} direction={direction} onSort={handleSortColumn}
                    />
                    <SortableHeader
                      col="replaced_row_count" label="Diganti" align="right"
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {visibleUploads.map((u) => (
                    <UploadTableRow key={u.id} upload={u} />
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}

          {/* Pagination */}
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
            dist_name: filters.dist_name ?? "",
            status: filters.status ?? "",
            search: filters.search ?? "",
          }}
          onApply={applyFilters}
          onReset={resetFilters}
        >
          {(draft, setDraft) => (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-display">Distributor</span>
                <Select
                  value={draft.dist_name}
                  onChange={(e) => setDraft({ ...draft, dist_name: e.target.value })}
                >
                  <option value="">Semua Distributor</option>
                  {available_dist_names.map((n) => (
                    <option key={n} value={n}>{n}</option>
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
  col, label, sort, direction, onSort, align = "left",
}: {
  col: string; label: string; sort: string; direction: "asc" | "desc"
  onSort: (col: string) => void; align?: "left" | "right"
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
          direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  )
}

function PreviewCard({
  preview, checked, onToggle,
}: {
  preview: Exclude<PreviewResult, { error: string }>
  checked: boolean
  onToggle: () => void
}) {
  const isDuplicate = preview.will_replace
  const isUnchanged = preview.is_unchanged

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
        <span>
          Distributor: <strong className="text-ink-body">{preview.dist_name}</strong>
        </span>
        <span>
          SAP Code: <strong className="text-ink-body">{preview.dist_sap_code}</strong>
        </span>
      </div>

      {isDuplicate ? (
        <div className="mt-3 pl-6">
          {isUnchanged ? (
            <Badge tone="muted">Tidak ada perubahan terdeteksi</Badge>
          ) : (
            <div className="overflow-hidden rounded border border-hairline text-xs">
              <div className="grid grid-cols-3 bg-surface px-3 py-1.5 font-medium text-ink-muted">
                <span />
                <span className="text-center">Sebelumnya</span>
                <span className="text-center">File ini</span>
              </div>
              <div className="divide-y divide-hairline">
                <div className="grid grid-cols-3 px-3 py-1.5">
                  <span className="text-ink-muted">Jumlah Outlet</span>
                  <span className="text-center tabular-nums text-ink-body">
                    {preview.existing_row_count.toLocaleString()}
                  </span>
                  <span className="text-center tabular-nums text-ink-body">
                    {preview.row_count.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-4 pl-6 text-xs text-ink-muted">
          <span>
            Jumlah Outlet:{" "}
            <strong className="text-ink-body">{preview.row_count.toLocaleString()}</strong>
          </span>
        </div>
      )}
    </div>
  )
}

function PreviewErrorCard({ filename, error }: { filename: string; error: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950">
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        <span className="font-medium text-ink-display truncate">{filename}</span>
      </div>
      <p className="mt-1 text-xs text-red-700 dark:text-red-300">{error}</p>
    </div>
  )
}

function ProgressCard({ upload, onCancel }: { upload: TrackedUpload; onCancel: () => void }) {
  const isInFlight = upload.status === "pending" || upload.status === "processing"
  const showProgress = upload.status === "processing" && upload.progress_rows > 0

  return (
    <div className="rounded-md border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-display" title={upload.filename}>
            {upload.filename}
          </p>
          {upload.dist_name && (
            <p className="mt-0.5 text-xs text-ink-muted">{upload.dist_name}</p>
          )}
          {upload.status === "completed" && upload.row_count != null && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {upload.row_count.toLocaleString()} outlet diimport
            </p>
          )}
          {showProgress && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {upload.progress_rows.toLocaleString()} baris diproses…
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

function UploadTableRow({ upload }: { upload: UploadRow }) {
  return (
    <tr>
      <td className="max-w-[180px] truncate px-4 py-3 font-medium text-ink-display" title={upload.filename}>
        {upload.filename}
      </td>
      <td className="px-4 py-3 text-ink-body">
        <div className="font-medium">{upload.dist_name}</div>
        <div className="text-xs text-ink-muted">{upload.dist_sap_code}</div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-body">
        {upload.row_count != null ? upload.row_count.toLocaleString() : "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-body">
        {upload.replaced_row_count > 0 ? upload.replaced_row_count.toLocaleString() : "—"}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={upload.status} />
      </td>
      <td className="px-4 py-3 text-xs text-ink-muted">
        {upload.imported_at ? formatDate(upload.imported_at) : formatDate(upload.created_at)}
      </td>
    </tr>
  )
}

function UploadCard({ upload }: { upload: UploadRow }) {
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
          label="Distributor"
          value={
            <>
              <div className="font-medium">{upload.dist_name}</div>
              <div className="text-xs text-ink-muted">{upload.dist_sap_code}</div>
            </>
          }
        />
        <DataCardField
          label="Jumlah Outlet"
          value={upload.row_count != null ? upload.row_count.toLocaleString() : "—"}
        />
        <DataCardField
          label="Diganti"
          value={upload.replaced_row_count > 0 ? upload.replaced_row_count.toLocaleString() : "—"}
        />
        <DataCardField
          wide
          label="Diunggah"
          value={upload.imported_at ? formatDate(upload.imported_at) : formatDate(upload.created_at)}
        />
      </DataCardGrid>
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
