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
  Loader2,
  Upload,
  XCircle,
} from "lucide-react"
import { AdminShell } from "@/components/AdminShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { consumer } from "@/lib/actioncable"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UploadStatus = "pending" | "processing" | "completed" | "failed" | "cancelled"

type UploadRow = {
  id: number
  filename: string
  region: string
  period_year: number
  period_month: number
  period_label: string
  schema_version: string
  status: UploadStatus
  row_count: number | null
  netto_wise_sum: number | null
  replaced_row_count: number
  error_message: string | null
  imported_at: string | null
  created_at: string
  uploaded_by: string | null
}

type PreviewResult =
  | {
      filename: string
      region: string
      period_year: number
      period_month: number
      period_label?: string
      schema_version: string
      row_count: number
      netto_wise_sum: number
      existing_row_count: number
      existing_netto_wise_sum?: number
      will_replace: boolean
      is_unchanged?: boolean
      error?: never
    }
  | { filename: string; error: string }

type TrackedUpload = {
  id: number
  filename: string
  status: UploadStatus
  row_count: number | null
  netto_wise_sum: number | null
  error_message: string | null
  progress_rows: number
}

type StatusUpdate = {
  type: "status_update"
  upload_id: number
  status: UploadStatus
  row_count: number | null
  netto_wise_sum: number | null
  error_message: string | null
}

type ProgressUpdate = {
  type: "progress_update"
  upload_id: number
  progress_rows: number
}

type Filters = {
  region: string | null
  year: string | null
  month: string | null
  status: string | null
  search: string | null
}

// ---------------------------------------------------------------------------
// Page props
// ---------------------------------------------------------------------------

export default function AdminTimeseriesUploads({
  uploads,
  total,
  page,
  per_page,
  sort,
  direction,
  filters,
  available_regions,
  available_years,
}: {
  uploads: UploadRow[]
  total: number
  page: number
  per_page: number
  sort: string
  direction: "asc" | "desc"
  filters: Filters
  available_regions: string[]
  available_years: number[]
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const activeXhrRef = React.useRef<XMLHttpRequest | null>(null)
  const [previews, setPreviews] = React.useState<PreviewResult[] | null>(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [previewUploadProgress, setPreviewUploadProgress] = React.useState<number | null>(null)
  const [importFiles, setImportFiles] = React.useState<File[]>([])
  const [importing, setImporting] = React.useState(false)
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [checkedFiles, setCheckedFiles] = React.useState<Set<string>>(new Set())
  const [trackedUploads, setTrackedUploads] = React.useState<TrackedUpload[]>([])
  const [searchValue, setSearchValue] = React.useState(filters.search ?? "")

  // Sync search input when URL changes (browser back/forward)
  React.useEffect(() => {
    setSearchValue(filters.search ?? "")
  }, [filters.search])

  // Subscribe to ActionCable channels for each tracked upload
  React.useEffect(() => {
    if (trackedUploads.length === 0) return

    const subs = trackedUploads.map((u) =>
      consumer.subscriptions.create(
        { channel: "TimeseriesUploadChannel", upload_id: u.id },
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
                  netto_wise_sum: data.netto_wise_sum ?? t.netto_wise_sum,
                  error_message: data.error_message ?? t.error_message,
                }
              })
            )
          },
        }
      )
    )

    return () => subs.forEach((s) => s.unsubscribe())
    // Re-subscribe only when upload IDs change (not on every status update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedUploads.map((u) => u.id).join(",")])

  // -------------------------------------------------------------------------
  // Navigation helper (URL-based state)
  // -------------------------------------------------------------------------

  function navigate(overrides: Record<string, string | number | null>) {
    const params: Record<string, string | number> = {}
    if (filters.region) params.region = filters.region
    if (filters.year)   params.year   = filters.year
    if (filters.month)  params.month  = filters.month
    if (filters.status) params.status = filters.status
    if (filters.search) params.search = filters.search
    if (sort !== "created_at") params.sort = sort
    if (direction !== "desc")  params.direction = direction
    if (page > 1) params.page = page
    Object.entries(overrides).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== "") params[k] = v as string | number
      else delete params[k]
    })
    router.get("/admin/timeseries/uploads", params as Record<string, string>, {
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

  // -------------------------------------------------------------------------
  // Upload handlers
  // -------------------------------------------------------------------------

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    const xlsx = Array.from(files).filter((f) => f.name.endsWith(".xlsx"))
    if (xlsx.length === 0) return
    runPreview(xlsx)
  }

  async function runPreview(files: File[]) {
    setPreviewLoading(true)
    setPreviewUploadProgress(0)
    setPreviews(null)
    setImportFiles(files)

    const fd = new FormData()
    files.forEach((f) => fd.append("files[]", f))

    try {
      const data = await xhrPost<PreviewResult[]>(
        "/admin/timeseries/uploads/preview",
        fd,
        (pct) => setPreviewUploadProgress(pct)
      )
      setPreviews(data)
      // New files checked by default; duplicates unchecked (require explicit opt-in)
      const initialChecked = new Set(
        data
          .filter(
            (p): p is Exclude<PreviewResult, { error: string }> =>
              !("error" in p) && !p.will_replace
          )
          .map((p) => p.filename)
      )
      setCheckedFiles(initialChecked)
    } catch {
      setPreviews(files.map((f) => ({ filename: f.name, error: "Network error" })))
    } finally {
      setPreviewLoading(false)
      setPreviewUploadProgress(null)
    }
  }

  function handleAbortImport() {
    activeXhrRef.current?.abort()
    activeXhrRef.current = null
    setImporting(false)
    setUploadProgress(null)
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
        "/admin/timeseries/uploads",
        fd,
        (pct) => setUploadProgress(pct),
        activeXhrRef
      )
      const initial: TrackedUpload[] = data.upload_ids.map((id, idx) => ({
        id,
        filename: filesToImport[idx]?.name ?? `upload-${id}`,
        status: "pending" as UploadStatus,
        row_count: null,
        netto_wise_sum: null,
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

  function handleCancelPreview() {
    setPreviews(null)
    setImportFiles([])
    setCheckedFiles(new Set())
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleCancelUpload(id: number) {
    await fetch(`/admin/timeseries/uploads/${id}/cancel`, {
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

  // -------------------------------------------------------------------------
  // Drop zone
  // -------------------------------------------------------------------------

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFilesSelected(e.dataTransfer.files)
  }

  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------

  const noneChecked = checkedFiles.size === 0
  const isInProgressView = trackedUploads.length > 0

  const TERMINAL: UploadStatus[] = ["completed", "failed", "cancelled"]
  const allDone =
    isInProgressView && trackedUploads.every((u) => TERMINAL.includes(u.status))
  const successCount = trackedUploads.filter((u) => u.status === "completed").length
  const cancelCount = trackedUploads.filter((u) => u.status === "cancelled").length
  const failCount = trackedUploads.filter((u) => u.status === "failed").length

  const hasActiveFilter = !!(
    filters.region || filters.year || filters.month || filters.status || filters.search
  )
  const totalPages = Math.ceil(total / per_page)

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <Head title="Timeseries Uploads">
        <meta name="description" content="Upload and manage timeseries Excel files." />
        <meta property="og:title" content="Timeseries Uploads" />
        <meta property="og:description" content="Upload and manage timeseries Excel files." />
      </Head>
      <AdminShell>
        {/* Header */}
        <div className="border-b border-hairline pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1>Timeseries Uploads</h1>
              <p className="mt-1">Upload file Excel bulanan per region ke database.</p>
            </div>
            {!isInProgressView && (
              <>
                <Button
                  variant="primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={previewLoading || importing}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
              </>
            )}
          </div>
        </div>

        {/* Drop zone (visible only when idle) */}
        {!isInProgressView && !previews && !previewLoading && (
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
              Drag &amp; drop file .xlsx ke sini
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Format: <code>Report Time Series (Regular) - Region (...) - YYYY-MM_....xlsx</code>
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Region: Jakarta 1 · RegBar · RegCen · RegTim · Wipro Unza Indonesia ECOM
            </p>
          </div>
        )}

        {/* Preview loading with upload progress */}
        {previewLoading && (
          <div className="mt-8 space-y-3">
            {previewUploadProgress !== null && previewUploadProgress < 100 ? (
              <>
                <p className="text-center text-sm text-ink-muted">
                  Mengirim file… {previewUploadProgress}%
                </p>
                <ProgressBar value={previewUploadProgress} />
              </>
            ) : (
              <div className="flex items-center justify-center gap-2 text-ink-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Membaca file…</span>
              </div>
            )}
          </div>
        )}

        {/* Preview panel */}
        {!isInProgressView && previews && !previewLoading && (
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
                ),
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
                <ProgressCard
                  key={u.id}
                  upload={u}
                  onCancel={() => handleCancelUpload(u.id)}
                />
              ))}
            </div>

            {/* Final summary + Upload lagi */}
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

        {/* Uploads list */}
        <div className="mt-10">
          {/* Filter bar */}
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Select
              value={filters.region ?? ""}
              onChange={(e) => navigate({ region: e.target.value || null, page: null })}
              className="w-44"
            >
              <option value="">Semua Region</option>
              {available_regions.map((r) => (
                <option key={r} value={r}>{r}</option>
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
              {MONTHS.slice(1).map((name, i) => (
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
                    region: null, year: null, month: null,
                    status: null, search: null, page: null,
                  })
                }
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
            <div className="overflow-hidden rounded-md border border-hairline">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-ink-muted">File</th>
                    <SortableHeader
                      col="region" label="Region"
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
                      col="netto_wise_sum" label="Netto Wise" align="right"
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
                  {uploads.map((u) => (
                    <UploadTableRow key={u.id} upload={u} />
                  ))}
                </tbody>
              </table>
            </div>
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
  preview: Exclude<PreviewResult, { error: string }>
  checked: boolean
  onToggle: () => void
}) {
  const isDuplicate = preview.will_replace
  const isUnchanged = preview.is_unchanged === true

  return (
    <div
      className={[
        "rounded-md border p-4",
        isDuplicate
          ? "border-signal bg-signal-faded"
          : "border-hairline bg-surface",
        !checked ? "opacity-60" : "",
      ].join(" ")}
    >
      {/* Header: filename + badge + checkbox */}
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
            Replacement
          </Badge>
        )}
      </div>

      {/* Metadata row */}
      <div className="mt-2 flex flex-wrap gap-4 pl-6 text-xs text-ink-muted">
        <span>
          Region: <strong className="text-ink-body">{preview.region}</strong>
        </span>
        <span>
          Periode:{" "}
          <strong className="text-ink-body">
            {monthName(preview.period_month)} {preview.period_year}
          </strong>
        </span>
        <span>
          Skema: <strong className="text-ink-body">{preview.schema_version}</strong>
        </span>
      </div>

      {/* Comparison section for duplicates */}
      {isDuplicate && (
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
                  <span className="text-ink-muted">Baris</span>
                  <span className="text-center tabular-nums text-ink-body">
                    {preview.existing_row_count.toLocaleString()}
                  </span>
                  <span className="text-center tabular-nums text-ink-body">
                    {preview.row_count.toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-3 px-3 py-1.5">
                  <span className="text-ink-muted">Netto Wise</span>
                  <span className="text-center tabular-nums text-ink-body">
                    {preview.existing_netto_wise_sum != null
                      ? formatNumber(preview.existing_netto_wise_sum)
                      : "—"}
                  </span>
                  <span className="text-center tabular-nums text-ink-body">
                    {formatNumber(preview.netto_wise_sum)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Row count + netto wise for new files */}
      {!isDuplicate && (
        <div className="mt-2 flex flex-wrap gap-4 pl-6 text-xs text-ink-muted">
          <span>
            Baris: <strong className="text-ink-body">{preview.row_count.toLocaleString()}</strong>
          </span>
          <span>
            Netto Wise:{" "}
            <strong className="text-ink-body">{formatNumber(preview.netto_wise_sum)}</strong>
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

function ProgressCard({
  upload,
  onCancel,
}: {
  upload: TrackedUpload
  onCancel: () => void
}) {
  const isInFlight = upload.status === "pending" || upload.status === "processing"
  const showProcessingProgress = upload.status === "processing" && upload.progress_rows > 0

  return (
    <div className="rounded-md border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-ink-display"
            title={upload.filename}
          >
            {upload.filename}
          </p>
          {upload.status === "completed" && upload.row_count != null && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {upload.row_count.toLocaleString()} baris
              {upload.netto_wise_sum != null && (
                <> · Netto Wise {formatNumber(upload.netto_wise_sum)}</>
              )}
            </p>
          )}
          {showProcessingProgress && (
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
      {showProcessingProgress && (
        <div className="mt-2">
          <ProgressBar indeterminate />
        </div>
      )}
      {upload.status === "pending" && (
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
      <td className="max-w-[200px] truncate px-4 py-3 font-medium text-ink-display" title={upload.filename}>
        {upload.filename}
      </td>
      <td className="px-4 py-3 text-ink-body">{upload.region}</td>
      <td className="px-4 py-3 text-ink-body">{upload.period_label}</td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-body">
        {upload.row_count != null ? upload.row_count.toLocaleString() : "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-body">
        {upload.netto_wise_sum != null ? formatNumber(upload.netto_wise_sum) : "—"}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={upload.status} />
      </td>
      <td className="px-4 py-3 text-xs text-ink-muted">
        {upload.imported_at
          ? formatDate(upload.imported_at)
          : formatDate(upload.created_at)}
      </td>
    </tr>
  )
}

function StatusBadge({ status }: { status: UploadStatus }) {
  switch (status) {
    case "pending":
      return (
        <Badge tone="muted">
          <Clock className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      )
    case "processing":
      return (
        <Badge tone="accent">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Processing
        </Badge>
      )
    case "completed":
      return (
        <Badge tone="signal">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      )
    case "failed":
      return (
        <Badge tone="neutral">
          <XCircle className="mr-1 h-3 w-3 text-red-500" />
          Failed
        </Badge>
      )
    case "cancelled":
      return (
        <Badge tone="muted">
          <Ban className="mr-1 h-3 w-3" />
          Dibatalkan
        </Badge>
      )
  }
}

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------

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
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data as T)
        } else {
          reject(new Error(data?.error ?? `HTTP ${xhr.status}`))
        }
      } catch {
        reject(new Error("Response parse error"))
      }
    }
    xhr.onerror = () => reject(new Error("Network error saat upload."))
    xhr.onabort = () => reject(new Error("Upload dibatalkan."))
    xhr.send(body)
  })
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
]
function monthName(m: number): string {
  return MONTHS[m] ?? String(m)
}
