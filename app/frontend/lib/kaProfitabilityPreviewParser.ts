import { unzipSync } from "fflate"

/**
 * Browser-side preview parser for KA Profitability .xlsx files.
 *
 * Reads the "Detail" sheet and extracts:
 *   - fiscalYear  — from the first ~10 rows, matches /\d{4}-\d{4}/
 *   - outletCount — number of unique outlet_group values (column A after the header row)
 *   - rowCount    — estimated record count (data rows × period columns)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KaProfitabilityPreviewResult =
  | {
      unknown?: false
      filename: string
      fiscalYear: string
      outletCount: number
      rowCount: number
    }
  | { unknown: true; filename: string; reason: string }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FISCAL_YEAR_RE = /\b(\d{4}-\d{4})\b/
const PERIOD_MONTHS = ["APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR"]

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function parseKaProfitabilityForPreview(
  file: File
): Promise<KaProfitabilityPreviewResult> {
  const filename = file.name

  try {
    const buf = await file.arrayBuffer()
    const data = new Uint8Array(buf)
    const decode = (b: Uint8Array) => new TextDecoder().decode(b)

    // ── 1. Find "Detail" sheet path ────────────────────────────────────────
    const sheetPath = resolveSheetByName(data, decode, "Detail")

    // ── 2. Load shared strings + worksheet XML ─────────────────────────────
    const extracted = unzipSync(data, {
      filter: (f) => f.name === "xl/sharedStrings.xml" || f.name === sheetPath,
    })

    const sharedStrings = buildSharedStrings(
      extracted["xl/sharedStrings.xml"] ? decode(extracted["xl/sharedStrings.xml"]) : ""
    )

    const wsBytes = extracted[sheetPath]
    if (!wsBytes) throw new Error(`Sheet "Detail" tidak dapat dibaca dari file.`)
    const wsXml = decode(wsBytes)

    // ── 3. Parse rows ──────────────────────────────────────────────────────
    // Sheet uses a 2-row header:
    //   Row 1 (type row):  "MTD 2026-2027", "MTD-May", … | "YTD 2026-2027", "YTD-May", …
    //   Row 2 (month row): "APR", "MAY", …               | "APR", "MAY", …
    //   Row 3+: data rows
    const rowParts = wsXml.split("<row ")

    let fiscalYear: string | null = null
    let typeRowIdx = -1
    const colTypeMap: Record<number, string> = {}  // col_idx => "MTD" | "YTD"
    let headerBuilt = false
    let periodColCount = 0
    const outletGroups = new Set<string>()
    let dataRowCount = 0

    for (let i = 1; i < rowParts.length; i++) {
      const rowXml = rowParts[i]
      const rowIdx = i - 1

      const cells = parseRowCells(rowXml, sharedStrings)

      // Scan first 10 rows for fiscal year
      if (rowIdx < 10 && !fiscalYear) {
        for (const val of Object.values(cells)) {
          const m = val.match(FISCAL_YEAR_RE)
          if (m) {
            fiscalYear = m[1]
            break
          }
        }
      }

      // Detect type row: cells starting with "MTD" or "YTD"
      if (typeRowIdx < 0) {
        const typePairs = Object.entries(cells).filter(([, v]) => {
          const u = v.trim().toUpperCase()
          return u.startsWith("MTD") || u.startsWith("YTD")
        })
        if (typePairs.length > 0) {
          typeRowIdx = rowIdx
          for (const [ci, val] of typePairs) {
            colTypeMap[parseInt(ci, 10)] = val.trim().toUpperCase().startsWith("MTD") ? "MTD" : "YTD"
          }
          continue
        }
      }

      // Detect month row: immediately after type row
      if (typeRowIdx >= 0 && !headerBuilt && rowIdx === typeRowIdx + 1) {
        headerBuilt = true
        periodColCount = Object.entries(cells).filter(([ci, val]) => {
          const month = val.trim().toUpperCase()
          return PERIOD_MONTHS.includes(month) && colTypeMap[parseInt(ci, 10)] !== undefined
        }).length
        continue
      }

      // Data rows: after month row
      if (headerBuilt && rowIdx > typeRowIdx + 1) {
        const colKeys = Object.keys(cells).map(Number)
        if (colKeys.length === 0) continue

        const outletGroup = cells[0]?.trim()
        const description = cells[2]?.trim()
        if (!outletGroup && !description) continue

        dataRowCount++
        if (outletGroup) outletGroups.add(outletGroup)
      }
    }

    if (!fiscalYear) {
      return { unknown: true, filename, reason: "Fiscal year tidak ditemukan dalam file." }
    }
    if (typeRowIdx < 0 || !headerBuilt) {
      return { unknown: true, filename, reason: "Header kolom periode (MTD/YTD) tidak ditemukan." }
    }

    return {
      filename,
      fiscalYear,
      outletCount: outletGroups.size,
      rowCount: dataRowCount * (periodColCount || 24),
    }
  } catch (err) {
    return {
      unknown: true,
      filename,
      reason: err instanceof Error ? err.message : "Gagal memparse file.",
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveSheetByName(
  data: Uint8Array,
  decode: (b: Uint8Array) => string,
  sheetName: string
): string {
  const metaFiles = unzipSync(data, {
    filter: (f) => f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels",
  })

  const wbBytes = metaFiles["xl/workbook.xml"]
  const relsBytes = metaFiles["xl/_rels/workbook.xml.rels"]
  if (!wbBytes || !relsBytes) throw new Error("workbook.xml metadata missing dari file.")

  const wbXml = decode(wbBytes)
  const relsXml = decode(relsBytes)

  const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const sheetMatch = wbXml.match(new RegExp(`<sheet\\b[^>]*name="${escaped}"[^>]*>`))
  if (!sheetMatch) throw new Error(`Sheet "${sheetName}" tidak ditemukan dalam workbook.`)

  const rIdMatch = sheetMatch[0].match(/\br:id="([^"]+)"/)
  if (!rIdMatch) throw new Error(`r:id missing for sheet "${sheetName}".`)
  const rId = rIdMatch[1]

  for (const part of relsXml.split(/<Relationship\b/).slice(1)) {
    if (!part.includes(`Id="${rId}"`)) continue
    const targetMatch = part.match(/\bTarget="([^"]+)"/)
    if (!targetMatch) continue
    let target = targetMatch[1]
    if (target.startsWith("../")) target = target.slice(3)
    else if (target.startsWith("/")) target = target.slice(1)
    else target = `xl/${target}`
    return target
  }

  throw new Error(`Relationship target missing for sheet "${sheetName}".`)
}

function buildSharedStrings(ssXml: string): string[] {
  if (!ssXml) return []
  return ssXml.split("<si>").slice(1).map((part) => {
    const matches = [...part.matchAll(/<t(?:[^>]*)>(.*?)<\/t>/gs)]
    return matches.map((m) => m[1]).join("")
  })
}

function parseRowCells(rowXml: string, ss: string[]): Record<number, string> {
  const cells: Record<number, string> = {}
  for (const cellXml of rowXml.split("<c ").slice(1)) {
    const refMatch = cellXml.match(/\br="([A-Z]+)\d+"/)
    if (!refMatch) continue
    const colIdx = colLetterToIndex(refMatch[1])
    const val = cellStringValue(cellXml, ss)
    if (val != null) cells[colIdx] = val
  }
  return cells
}

function colLetterToIndex(letters: string): number {
  return letters.toUpperCase().split("").reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0) - 1
}

function cellStringValue(cellXml: string, ss: string[]): string | null {
  if (cellXml.includes('t="s"')) {
    const m = cellXml.match(/<v>(\d+)<\/v>/)
    return m ? (ss[parseInt(m[1], 10)] ?? null) : null
  }
  if (cellXml.includes('t="inlineStr"')) {
    const matches = [...cellXml.matchAll(/<t(?:[^>]*)>(.*?)<\/t>/gs)]
    return matches.length > 0 ? matches.map((m) => m[1]).join("") : null
  }
  if (cellXml.includes('t="str"')) {
    const m = cellXml.match(/<v>([^<]*)<\/v>/)
    return m ? m[1] : null
  }
  const m = cellXml.match(/<v>([^<]*)<\/v>/)
  return m ? m[1] : null
}
