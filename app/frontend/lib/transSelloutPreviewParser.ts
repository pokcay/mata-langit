import { unzipSync } from "fflate"

/**
 * Browser-side parser for Trans Sell Out Account (Distributor) .xlsx files.
 *
 * Extracts distributor code + period from the filename (no file reading needed),
 * then opens the file to locate the "Report Time Series" sheet by name,
 * count data rows, and sum the Netto Wise column.
 *
 * Filename format:
 *   Report Time Series (Regular) - Distributor ({Name}, Indonesia) - {YYYY}-{MM}_{timestamp}.xlsx
 */

const DISTRIBUTOR_NAME_MAP: Record<string, string> = {
  "Indomaret DC, Indonesia": "IDM",
  "Indogrosir DC, Indonesia": "IDG",
  "Midi Utama DC, Indonesia": "MIDI",
  "Sumber Alfaria Trijaya DC, Indonesia": "SAT",
  "Sumber Indah Lestari DC, Indonesia": "SIL",
}

export type SelloutPreviewResult = {
  distributorCode: string
  distributorName: string
  periodYear: number
  periodMonth: number
  rowCount: number
  nettoSum: number
}

export function parseFilenameForSellout(filename: string): {
  distributorCode: string
  distributorName: string
  periodYear: number
  periodMonth: number
} {
  const match = filename.match(/Distributor \((.+?)\)\s*-\s*(\d{4})-(\d{2})/)
  if (!match) {
    throw new Error(
      `Filename "${filename}" tidak bisa diparse. ` +
        `Format yang diharapkan: "Report Time Series (Regular) - Distributor ({Nama}, Indonesia) - {YYYY}-{MM}_....xlsx".`
    )
  }

  const distName = match[1].trim()
  const year = parseInt(match[2], 10)
  const month = parseInt(match[3], 10)

  const code = DISTRIBUTOR_NAME_MAP[distName]
  if (!code) {
    const known = Object.keys(DISTRIBUTOR_NAME_MAP).join(", ")
    throw new Error(
      `Distributor "${distName}" tidak dikenal. Distributor yang dikenal: ${known}.`
    )
  }

  return { distributorCode: code, distributorName: distName, periodYear: year, periodMonth: month }
}

export async function parseSelloutAccountForPreview(file: File): Promise<SelloutPreviewResult> {
  const filenameInfo = parseFilenameForSellout(file.name)

  const buf = await file.arrayBuffer()
  const data = new Uint8Array(buf)
  const decode = (b: Uint8Array) => new TextDecoder().decode(b)

  // ── 1. Find the "Report Time Series" sheet path ──────────────────────────
  const worksheetPath = resolveSheetByName(data, decode, "Report Time Series")

  // ── 2. Load shared strings ────────────────────────────────────────────────
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
      sharedStrings.push(matches.map((m) => m[1]).join(""))
    }
  }

  const wsBytes = extracted[worksheetPath]
  if (!wsBytes) throw new Error(`Sheet "Report Time Series" tidak ditemukan dalam file.`)
  const wsXml = decode(wsBytes)
  const rowParts = wsXml.split("<row ")

  // ── 3. Locate Netto Wise column letter ───────────────────────────────────
  let nettoCol = ""
  if (rowParts.length > 1) {
    const headerEnd = rowParts[1].indexOf("</row>")
    const headerXml = rowParts[1].slice(0, headerEnd >= 0 ? headerEnd : undefined)
    for (const cellXml of headerXml.split("<c ").slice(1)) {
      const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
      if (!letterMatch) continue
      const colName = xlsxCellString(cellXml, sharedStrings)
      if (colName?.trim() === "Netto Wise") {
        nettoCol = letterMatch[1]
        break
      }
    }
  }

  // ── 4. Count rows and sum Netto Wise ─────────────────────────────────────
  let rowCount = 0
  let nettoSum = 0

  for (let i = 2; i < rowParts.length; i++) {
    const end = rowParts[i].indexOf("</row>")
    const rowContent = end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]
    if (!rowContent.includes("<v>") && !rowContent.includes("<is>")) continue
    rowCount++

    if (!nettoCol) continue
    for (const cellXml of rowContent.split("<c ").slice(1)) {
      const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
      if (!letterMatch || letterMatch[1] !== nettoCol) continue
      const raw = xlsxCellValue(cellXml, sharedStrings)
      if (raw != null) {
        const val = parseFloat(raw)
        if (!isNaN(val)) nettoSum += val
      }
      break
    }
  }

  return {
    ...filenameInfo,
    rowCount,
    nettoSum: Math.round(nettoSum * 10000) / 10000,
  }
}

// ── Sheet path resolution ──────────────────────────────────────────────────────

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

  throw new Error(`Relationship target missing for sheet "${sheetName}".`)
}

// ── XLSX cell helpers ──────────────────────────────────────────────────────────

function xlsxCellString(cellXml: string, ss: string[]): string | null {
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

function xlsxCellValue(cellXml: string, ss: string[]): string | null {
  if (cellXml.includes('t="inlineStr"')) {
    const matches = [...cellXml.matchAll(/<t(?:[^>]*)>(.*?)<\/t>/gs)]
    return matches.length > 0 ? matches.map((m) => m[1]).join("") : null
  }
  if (cellXml.includes('t="s"')) {
    const m = cellXml.match(/<v>(\d+)<\/v>/)
    return m ? (ss[parseInt(m[1], 10)] ?? null) : null
  }
  if (cellXml.includes('t="str"')) {
    const m = cellXml.match(/<v>([^<]*)<\/v>/)
    return m ? m[1] : null
  }
  const m = cellXml.match(/<v>([^<]*)<\/v>/)
  return m ? m[1] : null
}
