import { unzipSync } from "fflate"

/**
 * Browser-side detector + metadata extractor for Market Share B2B .xlsx files.
 *
 * Detection order (matches server-side Ruby parser):
 *   1. IDG  — sheet "MarketShareMOCY"
 *   2. IDM Reguler — any of MF / FF / FH / KIDS SC / KIDS SP present
 *   3. IDM Skincare — sheet SC or Sheet1 present
 *   4. SAT  — sheet "Worksheet" + row 1 contains "PT SUMBER ALFARIA TRIJAYA"
 *   5. MIDI — sheet "Worksheet" + row 3 contains "PT MIDI UTAMA INDONESIA"
 *   6. Unknown
 *
 * All market_share_pct values are normalised to 0-100 scale during import;
 * the preview only reports row counts and metadata — no value normalisation needed here.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MarketShareB2bDetected = {
  unknown?: false
  filename: string
  accountCode: string
  accountName: string
  reportType: string
  templateVersion: string
  periodYearFrom: number
  periodMonthFrom: number
  periodYearTo: number
  periodMonthTo: number
  rowCount: number
}

export type MarketShareB2bUnknown = {
  unknown: true
  filename: string
  reason: string
}

export type MarketShareB2bResult = MarketShareB2bDetected | MarketShareB2bUnknown

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCOUNT_NAMES: Record<string, string> = {
  IDG: "Indogrosir",
  IDM: "Indomaret",
  MIDI: "PT MIDI UTAMA INDONESIA Tbk",
  SAT: "PT SUMBER ALFARIA TRIJAYA Tbk",
}

const IDM_REGULER_SHEETS = new Set(["MF", "FF", "FH", "KIDS SC", "KIDS SP"])
const IDM_SC_SHEETS = new Set(["SC", "Sheet1"])

const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

const MONTH_ID: Record<string, number> = {
  Januari: 1, Februari: 2, Maret: 3, April: 4,
  Mei: 5, Juni: 6, Juli: 7, Agustus: 8,
  September: 9, Oktober: 10, November: 11, Desember: 12,
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function parseMarketShareB2bForPreview(file: File): Promise<MarketShareB2bResult> {
  const filename = file.name

  try {
    const buf = await file.arrayBuffer()
    const data = new Uint8Array(buf)
    const decode = (b: Uint8Array) => new TextDecoder().decode(b)

    // Step 1: extract workbook metadata
    const meta = unzipSync(data, {
      filter: (f) => f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels",
    })
    if (!meta["xl/workbook.xml"]) {
      return { unknown: true, filename, reason: "workbook.xml tidak ditemukan dalam file." }
    }

    const wbXml = decode(meta["xl/workbook.xml"])
    const sheetEntries = parseSheetEntries(wbXml)
    const sheetNames = sheetEntries.map((e) => e.name)
    const relsXml = meta["xl/_rels/workbook.xml.rels"] ? decode(meta["xl/_rels/workbook.xml.rels"]) : ""

    // Step 2: detect template
    if (sheetNames.includes("MarketShareMOCY")) {
      return detectIdg(data, decode, filename, sheetEntries, relsXml)
    }

    const hasRegulerlSheets = sheetNames.some((n) => IDM_REGULER_SHEETS.has(n))
    if (hasRegulerlSheets) {
      return detectIdmReguler(data, decode, filename, sheetNames, sheetEntries, relsXml)
    }

    const hasScSheet = sheetNames.some((n) => IDM_SC_SHEETS.has(n))
    if (hasScSheet) {
      return detectIdmSkincare(data, decode, filename, sheetNames, sheetEntries, relsXml)
    }

    if (sheetNames.includes("Worksheet")) {
      return detectWorksheet(data, decode, filename, sheetEntries, relsXml)
    }

    return {
      unknown: true,
      filename,
      reason: `Template tidak dikenal. Sheet ditemukan: ${sheetNames.join(", ") || "(tidak ada)"}`,
    }
  } catch (err) {
    return {
      unknown: true,
      filename,
      reason: err instanceof Error ? err.message : "Gagal membaca file",
    }
  }
}

// ---------------------------------------------------------------------------
// IDG detection
// ---------------------------------------------------------------------------

function detectIdg(
  data: Uint8Array,
  decode: (b: Uint8Array) => string,
  filename: string,
  sheetEntries: SheetEntry[],
  relsXml: string
): MarketShareB2bResult {
  const reportType = filenameReportType(filename) ?? "reguler"
  const period = idgPeriodFromFilename(filename)
  if (!period) {
    return { unknown: true, filename, reason: "Tidak bisa mengekstrak periode dari nama file IDG." }
  }

  const wsPath = resolveSheetPath(sheetEntries, relsXml, "MarketShareMOCY")
  if (!wsPath) return { unknown: true, filename, reason: "Sheet MarketShareMOCY tidak ditemukan." }

  const extracted = unzipSync(data, {
    filter: (f) => f.name === "xl/sharedStrings.xml" || f.name === wsPath,
  })
  const ss = parseSharedStrings(extracted["xl/sharedStrings.xml"], decode)
  const wsXml = extracted[wsPath] ? decode(extracted[wsPath]) : ""
  const rowCount = countIdgRows(wsXml, ss, period)

  return {
    filename,
    accountCode: "IDG",
    accountName: ACCOUNT_NAMES["IDG"],
    reportType,
    templateVersion: "idg_reguler_v1",
    periodYearFrom: period.yearFrom,
    periodMonthFrom: period.monthFrom,
    periodYearTo: period.yearTo,
    periodMonthTo: period.monthTo,
    rowCount,
  }
}

function idgPeriodFromFilename(
  filename: string
): { yearFrom: number; monthFrom: number; yearTo: number; monthTo: number } | null {
  const base = filename.replace(/\.xlsx?$/i, "")
  const monthPat = Object.keys(MONTH_ID).join("|")
  const rangeRe = new RegExp(`(${monthPat})\\s*-\\s*(${monthPat})\\s+(\\d{4})`, "i")
  const singleRe = new RegExp(`(${monthPat})\\s+(\\d{4})`, "i")

  const rangeMatch = base.match(rangeRe)
  if (rangeMatch) {
    const m1 = resolveMonthName(rangeMatch[1])
    const m2 = resolveMonthName(rangeMatch[2])
    const y = parseInt(rangeMatch[3], 10)
    if (m1 && m2) return { yearFrom: y, monthFrom: m1, yearTo: y, monthTo: m2 }
  }

  const singleMatch = base.match(singleRe)
  if (singleMatch) {
    const m1 = resolveMonthName(singleMatch[1])
    const y = parseInt(singleMatch[2], 10)
    if (m1) return { yearFrom: y, monthFrom: m1, yearTo: y, monthTo: m1 }
  }

  return null
}

function countIdgRows(wsXml: string, ss: string[], period: { yearFrom: number; monthFrom: number; yearTo: number; monthTo: number }): number {
  if (!wsXml) return 0
  const rowParts = wsXml.split("<row ")

  // Row index 4 = row 4 in XML (header row with month labels)
  const monthCols = buildIdgMonthCols(rowParts[4] ?? "", ss, period)
  if (monthCols.size === 0) return 0

  // Count data rows (brand rows: blank A or empty A, non-blank C)
  let brandRows = 0
  for (let i = 6; i < rowParts.length; i++) {
    const end = rowParts[i].indexOf("</row>")
    const rowXml = end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]
    if (!rowXml.includes("<v>") && !rowXml.includes("<is>")) continue
    const colA = xlsxCellString(findCellXml(rowXml, "A"), ss)
    const colC = xlsxCellString(findCellXml(rowXml, "C"), ss)
    // Category rows have non-empty A; data rows have blank A + brand in C
    if ((!colA || colA.trim() === "") && colC && colC.trim()) {
      brandRows++
    }
  }
  return brandRows * monthCols.size
}

function buildIdgMonthCols(
  row4Part: string,
  ss: string[],
  period: { yearFrom: number; monthFrom: number; yearTo: number; monthTo: number }
): Set<string> {
  const activeSet = new Set<string>()
  if (!row4Part) return activeSet
  const end = row4Part.indexOf("</row>")
  const rowXml = end >= 0 ? row4Part.slice(0, end) : row4Part

  for (const cellXml of rowXml.split("<c ").slice(1)) {
    const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
    if (!letterMatch) continue
    const val = xlsxCellString("<c " + cellXml, ss)?.trim() ?? ""
    if (!/^[A-Z]{3}-\d{2}$/.test(val)) continue
    const abbr = val.slice(0, 3)
    const yr = 2000 + parseInt(val.slice(4), 10)
    const mo = MONTH_ABBR.indexOf(abbr) + 1
    if (mo < 1) continue
    // Only count months within the detected period range
    if (yr < period.yearFrom || yr > period.yearTo) continue
    if (yr === period.yearFrom && mo < period.monthFrom) continue
    if (yr === period.yearTo && mo > period.monthTo) continue
    activeSet.add(letterMatch[1])
  }
  return activeSet
}

// ---------------------------------------------------------------------------
// IDM detection
// ---------------------------------------------------------------------------

function detectIdmReguler(
  data: Uint8Array,
  decode: (b: Uint8Array) => string,
  filename: string,
  sheetNames: string[],
  sheetEntries: SheetEntry[],
  relsXml: string
): MarketShareB2bResult {
  const period = filenameSinglePeriod(filename)
  if (!period) return { unknown: true, filename, reason: "Tidak bisa mengekstrak periode dari nama file IDM." }

  const activeSheets = sheetNames.filter((n) => IDM_REGULER_SHEETS.has(n))
  const rowCount = countIdmRows(data, decode, activeSheets, sheetEntries, relsXml)

  return {
    filename,
    accountCode: "IDM",
    accountName: ACCOUNT_NAMES["IDM"],
    reportType: "reguler",
    templateVersion: "idm_reguler_v1",
    periodYearFrom: period.year,
    periodMonthFrom: period.month,
    periodYearTo: period.year,
    periodMonthTo: period.month,
    rowCount,
  }
}

function detectIdmSkincare(
  data: Uint8Array,
  decode: (b: Uint8Array) => string,
  filename: string,
  sheetNames: string[],
  sheetEntries: SheetEntry[],
  relsXml: string
): MarketShareB2bResult {
  const period = filenameSinglePeriod(filename)
  if (!period) return { unknown: true, filename, reason: "Tidak bisa mengekstrak periode dari nama file IDM." }

  const scName = sheetNames.find((n) => IDM_SC_SHEETS.has(n)) ?? "SC"
  const rowCount = countIdmRows(data, decode, [scName], sheetEntries, relsXml)

  return {
    filename,
    accountCode: "IDM",
    accountName: ACCOUNT_NAMES["IDM"],
    reportType: "skincare",
    templateVersion: "idm_skincare_v1",
    periodYearFrom: period.year,
    periodMonthFrom: period.month,
    periodYearTo: period.year,
    periodMonthTo: period.month,
    rowCount,
  }
}

function countIdmRows(
  data: Uint8Array,
  decode: (b: Uint8Array) => string,
  sheets: string[],
  sheetEntries: SheetEntry[],
  relsXml: string
): number {
  let total = 0
  for (const sheetName of sheets) {
    const wsPath = resolveSheetPath(sheetEntries, relsXml, sheetName)
    if (!wsPath) continue
    const extracted = unzipSync(data, { filter: (f) => f.name === wsPath })
    const wsXml = extracted[wsPath] ? decode(extracted[wsPath]) : ""
    const rowParts = wsXml.split("<row ")
    // Data rows start at index 4 (row 4+)
    for (let i = 4; i < rowParts.length; i++) {
      const end = rowParts[i].indexOf("</row>")
      const rowXml = end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]
      if (rowXml.includes("<v>") || rowXml.includes("<is>")) total++
    }
  }
  return total
}

// ---------------------------------------------------------------------------
// MIDI / SAT (Worksheet) detection
// ---------------------------------------------------------------------------

function detectWorksheet(
  data: Uint8Array,
  decode: (b: Uint8Array) => string,
  filename: string,
  sheetEntries: SheetEntry[],
  relsXml: string
): MarketShareB2bResult {
  const wsPath = resolveSheetPath(sheetEntries, relsXml, "Worksheet")
  if (!wsPath) return { unknown: true, filename, reason: "Sheet Worksheet tidak ditemukan." }

  const extracted = unzipSync(data, {
    filter: (f) => f.name === "xl/sharedStrings.xml" || f.name === wsPath,
  })
  const ss = parseSharedStrings(extracted["xl/sharedStrings.xml"], decode)
  const wsXml = extracted[wsPath] ? decode(extracted[wsPath]) : ""
  const rowParts = wsXml.split("<row ")

  // row index 1 = row 1, row index 3 = row 3
  const a1 = xlsxCellString(findCellXml(getRowXml(rowParts, 1), "A"), ss)?.trim() ?? ""
  const a3 = xlsxCellString(findCellXml(getRowXml(rowParts, 3), "A"), ss)?.trim() ?? ""

  const period = filenameSinglePeriod(filename)
  if (!period) return { unknown: true, filename, reason: "Tidak bisa mengekstrak periode dari nama file." }
  const reportType = filenameReportType(filename) ?? "reguler"

  let accountCode: string
  let accountName: string
  let templateVersion: string

  if (a1.startsWith("PT SUMBER ALFARIA TRIJAYA")) {
    accountCode = "SAT"
    accountName = a1 || ACCOUNT_NAMES["SAT"]
    templateVersion = "sat_v1"
  } else if (a3.startsWith("PT MIDI UTAMA INDONESIA")) {
    accountCode = "MIDI"
    accountName = a3 || ACCOUNT_NAMES["MIDI"]
    templateVersion = "midi_v1"
  } else {
    return {
      unknown: true,
      filename,
      reason: `Sheet "Worksheet" ditemukan tapi tidak cocok dengan SAT (A1="${a1}") atau MIDI (A3="${a3}").`,
    }
  }

  const rowCount = countTallRows(rowParts, ss)

  return {
    filename,
    accountCode,
    accountName,
    reportType,
    templateVersion,
    periodYearFrom: period.year,
    periodMonthFrom: period.month,
    periodYearTo: period.year,
    periodMonthTo: period.month,
    rowCount,
  }
}

function countTallRows(rowParts: string[], ss: string[]): number {
  let count = 0
  for (let i = 1; i < rowParts.length; i++) {
    const rowNumAttr = rowParts[i].match(/\br="(\d+)"/)
    const rowNum = rowNumAttr ? parseInt(rowNumAttr[1], 10) : 0
    if (rowNum < 10) continue
    const end = rowParts[i].indexOf("</row>")
    const rowXml = end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]
    if (!rowXml.includes("<v>") && !rowXml.includes("<is>")) continue
    const colA = xlsxCellString(findCellXml(rowXml, "A"), ss)?.trim() ?? ""
    if (/^\d+$/.test(colA) && parseInt(colA, 10) > 0) count++
  }
  return count
}

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

function filenameReportType(filename: string): string | null {
  const base = filename.replace(/\.xlsx?$/i, "")
  if (/skincare/i.test(base)) return "skincare"
  if (/reguler/i.test(base)) return "reguler"
  return null
}

function filenameSinglePeriod(filename: string): { year: number; month: number } | null {
  const base = filename.replace(/\.xlsx?$/i, "")
  const monthPat = Object.keys(MONTH_ID).join("|")
  const re = new RegExp(`(${monthPat})\\s+(\\d{4})`, "i")
  const m = base.match(re)
  if (!m) return null
  const monthName = resolveMonthName(m[1])
  if (!monthName) return null
  return { year: parseInt(m[2], 10), month: monthName }
}

function resolveMonthName(raw: string): number | null {
  const key = Object.keys(MONTH_ID).find((k) => k.toLowerCase() === raw.toLowerCase())
  return key ? MONTH_ID[key] : null
}

// ---------------------------------------------------------------------------
// XLSX / ZIP helpers
// ---------------------------------------------------------------------------

type SheetEntry = { name: string; rId: string }

function parseSheetEntries(wbXml: string): SheetEntry[] {
  const entries: SheetEntry[] = []
  const re = /<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*>/g
  let m
  while ((m = re.exec(wbXml)) !== null) {
    entries.push({ name: m[1], rId: m[2] })
  }
  return entries
}

function resolveSheetPath(
  entries: SheetEntry[],
  relsXml: string,
  sheetName: string
): string | null {
  const entry = entries.find((e) => e.name === sheetName)
  if (!entry) return null
  const rIdEscaped = entry.rId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const relParts = relsXml.split(/<Relationship\b/)
  for (let i = 1; i < relParts.length; i++) {
    if (relParts[i].includes(`Id="${entry.rId}"`)) {
      const targetMatch = relParts[i].match(/\bTarget="([^"]+)"/)
      if (targetMatch) {
        const target = targetMatch[1]
        if (target.startsWith("../")) return target.slice(3)
        if (target.startsWith("/")) return target.slice(1)
        return `xl/${target}`
      }
    }
  }
  void rIdEscaped
  return null
}

function parseSharedStrings(bytes: Uint8Array | undefined, decode: (b: Uint8Array) => string): string[] {
  if (!bytes) return []
  const xml = decode(bytes)
  const ss: string[] = []
  for (const part of xml.split("<si>").slice(1)) {
    const matches = [...part.matchAll(/<t(?:[^>]*)>(.*?)<\/t>/gs)]
    ss.push(matches.map((m) => m[1]).join(""))
  }
  return ss
}

function getRowXml(rowParts: string[], rowNumber: number): string {
  // rowParts[0] is pre-sheetData content; row N starts at rowParts[N] due to split("<row ")
  // but we need to find by r="N" attribute since rows may be sparse (missing empty rows)
  for (let i = 1; i < rowParts.length; i++) {
    const attr = rowParts[i].match(/\br="(\d+)"/)
    if (attr && parseInt(attr[1], 10) === rowNumber) {
      const end = rowParts[i].indexOf("</row>")
      return end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]
    }
  }
  return ""
}

function findCellXml(rowXml: string, colLetter: string): string {
  for (const part of rowXml.split("<c ").slice(1)) {
    if (new RegExp(`r="${colLetter}\\d+"`).test(part)) {
      return "<c " + part
    }
  }
  return ""
}

function xlsxCellString(cellXml: string, ss: string[]): string | null {
  if (!cellXml) return null
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
  return null
}
