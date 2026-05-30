import type { MutableRefObject } from "react"

function csrfToken(): string {
  return (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content ?? ""
}

/**
 * POST a single multipart request (one or more `files[]` entries), reporting the
 * number of bytes uploaded so the caller can compute progress, and supporting
 * abort via an optional XHR ref.
 */
function xhrPostFile<T>(
  url: string,
  body: FormData,
  onLoaded: (loaded: number) => void,
  xhrRef?: MutableRefObject<XMLHttpRequest | null>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    if (xhrRef) xhrRef.current = xhr
    xhr.open("POST", url)
    xhr.setRequestHeader("X-CSRF-Token", csrfToken())
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onLoaded(e.loaded)
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

export interface SequentialUploadResult<T> {
  /** Successful uploads, each paired with its source File, in submission order. */
  uploaded: Array<{ file: File; data: T }>
  /** Human-readable per-file error messages for files that failed to upload. */
  errors: string[]
  /** True if the batch was aborted (via `abortRef`) before finishing. */
  aborted: boolean
}

/**
 * Upload files **one request at a time** (a single `files[]` per POST) so that no
 * individual request exceeds the reverse-proxy / Cloudflare request-body limit
 * (~100 MB on the Cloudflare Free plan). Large exports can be 60+ MB each, so a
 * combined multipart POST of several files stalls at the CDN edge and never
 * reaches the origin. Progress is reported as an aggregate across all files,
 * weighted by byte size.
 *
 * This is the standard upload path for every admin upload feature — new upload
 * pages should call this rather than bundling all files into one request.
 *
 * Abort: set `abortRef.current = true` and call `xhrRef.current?.abort()`; the
 * in-flight request rejects and the loop stops. Check `result.aborted` to decide
 * whether to skip post-success handling.
 */
export async function uploadFilesSequentially<T>(opts: {
  url: string
  files: File[]
  abortRef: MutableRefObject<boolean>
  xhrRef?: MutableRefObject<XMLHttpRequest | null>
  onProgress?: (pct: number) => void
}): Promise<SequentialUploadResult<T>> {
  const { url, files, abortRef, xhrRef, onProgress } = opts
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  let sentBytes = 0
  const uploaded: Array<{ file: File; data: T }> = []
  const errors: string[] = []

  for (const file of files) {
    if (abortRef.current) break
    const fd = new FormData()
    fd.append("files[]", file)
    try {
      const data = await xhrPostFile<T>(
        url,
        fd,
        (loaded) => {
          const pct = totalBytes > 0 ? Math.round(((sentBytes + loaded) / totalBytes) * 100) : 100
          onProgress?.(Math.min(pct, 100))
        },
        xhrRef,
      )
      uploaded.push({ file, data })
    } catch (err) {
      if (abortRef.current) break
      errors.push(`${file.name}: ${err instanceof Error ? err.message : "gagal diunggah"}`)
    }
    sentBytes += file.size
    onProgress?.(totalBytes > 0 ? Math.round((sentBytes / totalBytes) * 100) : 100)
  }

  return { uploaded, errors, aborted: abortRef.current }
}
