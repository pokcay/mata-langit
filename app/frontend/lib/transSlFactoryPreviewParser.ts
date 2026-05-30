import { unzipSync } from "fflate"

/**
 * Browser-side parser for the monthly "Detail SL {Month} {Year}" SAP export
 * (report ZBS_SERVICE_LEVEL01).
 *
 * Locates the primary detail sheet by the "Detail SL" tab-name prefix (the name
 * changes every month), excluding the "(2)" brand-code variant. Reads the period
 * from the in-file `PERIOD :` row (DD.MM.YYYY), counts data rows, and sums the
 * "Value Net" column — mirroring the server-side TransSlFactoryFileParser so the
 * duplicate-detection (is_unchanged) comparison stays consistent.
 */

const DETAIL_SHEET_PREFIX = "Detail SL"
const HEADER_MATCH_THRESHOLD = 12

const COLUMN_MAP: Record<string, string> = {
  "shipping": "shipping_point",
  "sold-to party": "sold_to_party",
  "area": "area",
  "f & r": "f_and_r_type",
  "customer name": "customer_name",
  "date so": "date_so",
  "no so": "no_so",
  "no dn": "no_dn",
  "date invoice": "date_invoice",
  "no invoice": "no_invoice",
  "code material": "code_material",
  "brand": "brand",
  "description material": "description_material",
  "qty so": "qty_so",
  "value so": "value_so",
  "qty delivery order": "qty_delivery_order",
  "value delivery order": "value_delivery_order",
  "qty return": "qty_return",
  "value return": "value_return",
  "qty net": "qty_net",
  "value net": "value_net",
  "% qty": "pct_qty",
  "% value": "pct_value",
  "reason for rejection": "reason_for_rejection",
}

export type SlFactoryPreviewResult = {
  periodYear: number
  periodMonth: number
  rowCount: number
  valueNetSum: number
}

export async function parseSlFactoryForPreview(file: File): Promise<SlFactoryPreviewResult> {
  const buf = await file.arrayBuffer()
  const data = new Uint8Array(buf)
  const decode = (b: Uint8Array) => new TextDecoder().decode(b)

  // ── 1. Resolve the primary "Detail SL …" sheet path ─────────────────────
  const worksheetPath = resolveDetailSheet(data, decode)

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
  if (!wsBytes) throw new Error(`Sheet detail "Detail SL …" tidak ditemukan dalam file.`)
  const wsXml = decode(wsBytes)
  const rowParts = wsXml.split("<row ")

  // ── 3. Read the period from the PERIOD row ──────────────────────────────
  const { periodYear, periodMonth } = readPeriod(rowParts, sharedStrings)

  // ── 4. Find the (last) header row + the Value Net + Shipping columns ─────
  const { letterMap, headerIdx } = findHeader(rowParts, sharedStrings)
  if (!letterMap) throw new Error(`Baris header detail SL tidak ditemukan dalam file.`)

  const valueNetCol = letterFor(letterMap, "value_net")
  const shippingCol = letterFor(letterMap, "shipping_point")

  // ── 5. Count data rows + sum Value Net (identical rules to the server) ───
  let rowCount = 0
  let valueNetSum = 0

  for (let i = headerIdx + 1; i < rowParts.length; i++) {
    const end = rowParts[i].indexOf("</row>")
    const rowContent = end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]
    if (!rowContent.includes("<v>") && !rowContent.includes("<is>")) continue

    let shipping: string | null = null
    let valueNetRaw: string | null = null
    for (const cellXml of rowContent.split("<c ").slice(1)) {
      const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
      if (!letterMatch) continue
      const letter = letterMatch[1]
      if (letter === shippingCol) shipping = xlsxCellValue(cellXml, sharedStrings)
      else if (letter === valueNetCol) valueNetRaw = xlsxCellValue(cellXml, sharedStrings)
    }

    // Skip grand-total rows (blank Shipping) and repeated header rows.
    if (!shipping || shipping.trim() === "") continue
    if (shipping.trim().toLowerCase() === "shipping") continue

    rowCount++
    if (valueNetRaw != null) {
      const val = parseFloat(valueNetRaw.replace(/,/g, "").replace(/\s/g, ""))
      if (!isNaN(val)) valueNetSum += val
    }
  }

  return {
    periodYear,
    periodMonth,
    rowCount,
    valueNetSum: Math.round(valueNetSum * 10000) / 10000,
  }
}

// ── Period extraction ──────────────────────────────────────────────────────

function readPeriod(
  rowParts: string[],
  ss: string[]
): { periodYear: number; periodMonth: number } {
  for (let i = 1; i < Math.min(rowParts.length, 13); i++) {
    const end = rowParts[i].indexOf("</row>")
    const content = end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]
    const values: string[] = []
    for (const cellXml of content.split("<c ").slice(1)) {
      const v = xlsxCellValue(cellXml, ss)
      if (v != null) values.push(v)
    }
    const joined = values.join(" ")
    if (!/PERIOD/i.test(joined)) continue
    const m = joined.match(/(\d{2})\.(\d{2})\.(\d{4})/)
    if (m) {
      const month = parseInt(m[2], 10)
      const year = parseInt(m[3], 10)
      if (month >= 1 && month <= 12) return { periodYear: year, periodMonth: month }
    }
  }
  throw new Error(
    `Baris "PERIOD :" (mis. "01.04.2026 TO 30.04.2026") tidak ditemukan. ` +
      `Pastikan file yang diupload adalah export "Detail SL" yang benar.`
  )
}

// ── Header detection (returns the LAST matching header) ──────────────────────

function findHeader(
  rowParts: string[],
  ss: string[]
): { letterMap: Record<string, string> | null; headerIdx: number } {
  // First header-matching row; repeated headers/totals are skipped per-row.
  for (let i = 1; i < Math.min(rowParts.length, 41); i++) {
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
    if (cols.length >= HEADER_MATCH_THRESHOLD && cols.includes("shipping_point") && cols.includes("value_net")) {
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

function resolveDetailSheet(data: Uint8Array, decode: (b: Uint8Array) => string): string {
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
    const clean = unescapeXml(nameMatch[1]).trim()
    return clean.startsWith(DETAIL_SHEET_PREFIX) && !clean.endsWith("(2)")
  })
  if (!sheetTag) throw new Error(`Sheet detail "Detail SL …" tidak ditemukan dalam workbook.`)

  const rIdMatch = sheetTag.match(/\br:id="([^"]+)"/)
  if (!rIdMatch) throw new Error(`r:id missing for sheet detail.`)
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

  throw new Error(`Relationship target missing for sheet detail.`)
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
