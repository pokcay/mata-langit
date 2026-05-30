import { unzipSync } from "fflate"

/**
 * Browser-side parser for the monthly "Listing Cost {Year} - {Month}" file (the
 * nationwide snapshot of the listing/slotting fees paid to outlets).
 *
 * Locates the single `Listing Cost` sheet by name, reads the period from the
 * merged A1 title cell (`{MONTH NAME} - {YYYY}`, e.g. "MAY - 2026"), counts data
 * rows, and sums the COST column — mirroring the server-side
 * MasterListingFileParser so the duplicate-detection (is_unchanged) comparison
 * stays consistent. Unlike Master Rental, there is no RENTAL (fixture) column.
 */

const SHEET_NAME = "Listing Cost"
const SHEET_NAME_UC = SHEET_NAME.toUpperCase()
const HEADER_MATCH_THRESHOLD = 5

const COLUMN_MAP: Record<string, string> = {
  "region": "region",
  "area": "area",
  "dist parent": "dist_parent",
  "dist child": "dist_child",
  "outlet code": "outlet_code",
  "outlet name": "outlet_name",
  "cost": "cost",
}

const MONTH_NAMES: Record<string, number> = {
  JANUARY: 1, JAN: 1,
  FEBRUARY: 2, FEB: 2,
  MARCH: 3, MAR: 3,
  APRIL: 4, APR: 4,
  MAY: 5,
  JUNE: 6, JUN: 6,
  JULY: 7, JUL: 7,
  AUGUST: 8, AUG: 8,
  SEPTEMBER: 9, SEP: 9, SEPT: 9,
  OCTOBER: 10, OCT: 10,
  NOVEMBER: 11, NOV: 11,
  DECEMBER: 12, DEC: 12,
}

export type MasterListingPreviewResult = {
  periodYear: number
  periodMonth: number
  rowCount: number
  totalCost: number
}

export async function parseMasterListingForPreview(file: File): Promise<MasterListingPreviewResult> {
  const buf = await file.arrayBuffer()
  const data = new Uint8Array(buf)
  const decode = (b: Uint8Array) => new TextDecoder().decode(b)

  // ── 1. Resolve the Listing Cost sheet path ──────────────────────────────
  const worksheetPath = resolveSheet(data, decode)

  // ── 2. Load shared strings + the worksheet ──────────────────────────────
  const extracted = unzipSync(data, {
    filter: (f) => f.name === "xl/sharedStrings.xml" || f.name === worksheetPath,
  })

  const sharedStrings: string[] = []
  const ssBytes = extracted["xl/sharedStrings.xml"]
  if (ssBytes) {
    const ssXml = decode(ssBytes)
    const parts = ssXml.split("<si>")
    for (let i = 1; i < parts.length; i++) {
      const matches = [...parts[i].matchAll(/<t(?:[^>]*)>(.*?)<\/t>/gs)]
      sharedStrings.push(unescapeXml(matches.map((m) => m[1]).join("")))
    }
  }

  const wsBytes = extracted[worksheetPath]
  if (!wsBytes) throw new Error(`Sheet "${SHEET_NAME}" tidak ditemukan dalam file.`)
  const wsXml = decode(wsBytes)
  const rowParts = wsXml.split("<row ")

  // ── 3. Read the period from the A1 title cell ───────────────────────────
  const { periodYear, periodMonth } = readPeriod(rowParts, sharedStrings)

  // ── 4. Find the header row + the COST + REGION columns ──────────────────
  const { letterMap, headerIdx } = findHeader(rowParts, sharedStrings)
  if (!letterMap) throw new Error(`Baris header Listing Cost tidak ditemukan dalam file.`)

  const costCol = letterFor(letterMap, "cost")
  const regionCol = letterFor(letterMap, "region")

  // ── 5. Count data rows + sum COST (identical rules to the server) ───────
  let rowCount = 0
  let totalCost = 0

  for (let i = headerIdx + 1; i < rowParts.length; i++) {
    const end = rowParts[i].indexOf("</row>")
    const rowContent = end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]
    if (!rowContent.includes("<v>") && !rowContent.includes("<is>")) continue

    let region: string | null = null
    let costRaw: string | null = null
    for (const cellXml of rowContent.split("<c ").slice(1)) {
      const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
      if (!letterMatch) continue
      const letter = letterMatch[1]
      if (letter === regionCol) region = xlsxCellValue(cellXml, sharedStrings)
      else if (letter === costCol) costRaw = xlsxCellValue(cellXml, sharedStrings)
    }

    // Skip blank-region rows and any repeated "REGION" header label.
    if (!region || region.trim() === "") continue
    if (region.trim().toLowerCase() === "region") continue

    rowCount++
    if (costRaw != null) {
      const val = parseFloat(costRaw.replace(/,/g, "").replace(/\s/g, ""))
      if (!isNaN(val)) totalCost += Math.round(val)
    }
  }

  return { periodYear, periodMonth, rowCount, totalCost }
}

// ── Period extraction (merged A1 title cell) ────────────────────────────────

function readPeriod(
  rowParts: string[],
  ss: string[]
): { periodYear: number; periodMonth: number } {
  const firstRow = rowParts[1]
  if (firstRow) {
    const end = firstRow.indexOf("</row>")
    const content = end >= 0 ? firstRow.slice(0, end) : firstRow
    for (const cellXml of content.split("<c ").slice(1)) {
      const v = xlsxCellValue(cellXml, ss)
      if (v == null || v.trim() === "") continue
      const m = v.trim().match(/^([A-Za-z]+)\s*[-–]\s*(\d{4})$/)
      if (m) {
        const month = MONTH_NAMES[m[1].toUpperCase()]
        const year = parseInt(m[2], 10)
        if (month) return { periodYear: year, periodMonth: month }
      }
      break
    }
  }
  throw new Error(
    `Sel judul A1 (mis. "MAY - 2026") tidak dapat dibaca. ` +
      `Pastikan file yang diupload adalah file "Listing Cost" yang benar.`
  )
}

// ── Header detection ─────────────────────────────────────────────────────────

function findHeader(
  rowParts: string[],
  ss: string[]
): { letterMap: Record<string, string> | null; headerIdx: number } {
  for (let i = 1; i < Math.min(rowParts.length, 11); i++) {
    const end = rowParts[i].indexOf("</row>")
    const content = end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]
    const map: Record<string, string> = {}
    for (const cellXml of content.split("<c ").slice(1)) {
      const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
      if (!letterMatch) continue
      const name = xlsxCellString(cellXml, ss)
      if (!name) continue
      const dbCol = COLUMN_MAP[normalize(name)]
      if (dbCol) map[letterMatch[1]] = dbCol
    }
    const cols = Object.values(map)
    if (cols.length >= HEADER_MATCH_THRESHOLD && cols.includes("region") && cols.includes("cost")) {
      return { letterMap: map, headerIdx: i }
    }
  }

  return { letterMap: null, headerIdx: -1 }
}

function letterFor(map: Record<string, string>, dbCol: string): string {
  for (const [letter, col] of Object.entries(map)) if (col === dbCol) return letter
  return ""
}

// ── Sheet path resolution ────────────────────────────────────────────────────

function resolveSheet(data: Uint8Array, decode: (b: Uint8Array) => string): string {
  const metaFiles = unzipSync(data, {
    filter: (f) => f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels",
  })

  const wbBytes = metaFiles["xl/workbook.xml"]
  const relsBytes = metaFiles["xl/_rels/workbook.xml.rels"]
  if (!wbBytes || !relsBytes) throw new Error("workbook.xml metadata missing dari file.")

  const wbXml = decode(wbBytes)
  const relsXml = decode(relsBytes)

  const sheetTag = (wbXml.match(/<sheet\s[^>]*>/g) || []).find((tag) => {
    const nameMatch = tag.match(/name="([^"]*)"/)
    if (!nameMatch) return false
    return unescapeXml(nameMatch[1]).trim().toUpperCase() === SHEET_NAME_UC
  })
  if (!sheetTag) throw new Error(`Sheet "${SHEET_NAME}" tidak ditemukan dalam workbook.`)

  const rIdMatch = sheetTag.match(/\br:id="([^"]+)"/)
  if (!rIdMatch) throw new Error(`r:id missing for sheet "${SHEET_NAME}".`)
  const rId = rIdMatch[1]

  const parts = relsXml.split(/<Relationship\b/)
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].includes(`Id="${rId}"`)) {
      const targetMatch = parts[i].match(/\bTarget="([^"]+)"/)
      if (targetMatch) {
        const target = targetMatch[1]
        if (target.startsWith("../")) return target.slice(3)
        if (target.startsWith("/")) return target.slice(1)
        return `xl/${target}`
      }
    }
  }

  throw new Error(`Relationship target missing for sheet "${SHEET_NAME}".`)
}

// ── XLSX cell helpers ────────────────────────────────────────────────────────

function xlsxCellString(cellXml: string, ss: string[]): string | null {
  if (cellXml.includes('t="s"')) {
    const m = cellXml.match(/<v>(\d+)<\/v>/)
    return m ? (ss[parseInt(m[1], 10)] ?? null) : null
  }
  if (cellXml.includes('t="inlineStr"')) {
    const matches = [...cellXml.matchAll(/<t(?:[^>]*)>(.*?)<\/t>/gs)]
    return matches.length > 0 ? unescapeXml(matches.map((m) => m[1]).join("")) : null
  }
  if (cellXml.includes('t="str"')) {
    const m = cellXml.match(/<v>([^<]*)<\/v>/)
    return m ? unescapeXml(m[1]) : null
  }
  return null
}

function xlsxCellValue(cellXml: string, ss: string[]): string | null {
  if (cellXml.includes('t="inlineStr"')) {
    const matches = [...cellXml.matchAll(/<t(?:[^>]*)>(.*?)<\/t>/gs)]
    return matches.length > 0 ? unescapeXml(matches.map((m) => m[1]).join("")) : null
  }
  if (cellXml.includes('t="s"')) {
    const m = cellXml.match(/<v>(\d+)<\/v>/)
    return m ? (ss[parseInt(m[1], 10)] ?? null) : null
  }
  if (cellXml.includes('t="str"')) {
    const m = cellXml.match(/<v>([^<]*)<\/v>/)
    return m ? unescapeXml(m[1]) : null
  }
  const m = cellXml.match(/<v>([^<]*)<\/v>/)
  return m ? unescapeXml(m[1]) : null
}

function normalize(str: string): string {
  return unescapeXml(str).replace(/\s+/g, " ").trim().toLowerCase()
}

function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}
