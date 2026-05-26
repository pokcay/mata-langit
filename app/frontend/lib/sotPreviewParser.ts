import { unzipSync } from "fflate"

export type SotPreviewRow = {
  region: string
  year: number
  month: number
  nettoWise: number
}

export type SotMalformedRow = {
  rowNumber: number
  reason: string
}

export type SotParseResult = {
  totalRows: number
  validRows: number
  malformedRows: SotMalformedRow[]
  distinctRegions: string[]
  periodMinYear: number | null
  periodMinMonth: number | null
  periodMaxYear: number | null
  periodMaxMonth: number | null
  previewRows: SotPreviewRow[]
}

const REQUIRED_COLUMNS = ["Region", "Year", "Month", "Netto_Wise"] as const

export async function parseSotForPreview(file: File): Promise<SotParseResult> {
  const buf = await file.arrayBuffer()
  const extracted = unzipSync(new Uint8Array(buf), {
    filter: (f) =>
      f.name === "xl/sharedStrings.xml" || f.name === "xl/worksheets/sheet1.xml",
  })

  const decode = (b: Uint8Array) => new TextDecoder().decode(b)

  // ── Build shared strings table ─────────────────────────────────────────────
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

  const wsBytes = extracted["xl/worksheets/sheet1.xml"]
  if (!wsBytes) throw new Error("Invalid XLSX: worksheet not found")
  const wsXml = decode(wsBytes)
  const rowParts = wsXml.split("<row ")

  // ── Locate required column letters from header row ─────────────────────────
  const letterToCol: Record<string, string> = {}
  if (rowParts.length > 1) {
    const headerEnd = rowParts[1].indexOf("</row>")
    const headerXml = rowParts[1].slice(0, headerEnd >= 0 ? headerEnd : undefined)
    for (const cellXml of headerXml.split("<c ").slice(1)) {
      const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
      if (!letterMatch) continue
      const letter = letterMatch[1]
      const colName = xlsxCellString(cellXml, sharedStrings)
      if (colName && REQUIRED_COLUMNS.includes(colName.trim() as (typeof REQUIRED_COLUMNS)[number])) {
        letterToCol[letter] = colName.trim()
      }
    }
  }

  const missingCols = REQUIRED_COLUMNS.filter((c) => !Object.values(letterToCol).includes(c))
  if (missingCols.length > 0) {
    throw new Error(`SoT file missing required columns: ${missingCols.join(", ")}`)
  }

  // ── Parse data rows ────────────────────────────────────────────────────────
  const validRows: SotPreviewRow[] = []
  const malformedRows: SotMalformedRow[] = []
  let rowIndex = 0

  for (let i = 2; i < rowParts.length; i++) {
    const end = rowParts[i].indexOf("</row>")
    const rowContent = end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]
    if (!rowContent.includes("<v>") && !rowContent.includes("<is>")) continue

    rowIndex++
    const data: Record<string, string | undefined> = {}

    for (const cellXml of rowContent.split("<c ").slice(1)) {
      const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
      if (!letterMatch) continue
      const colName = letterToCol[letterMatch[1]]
      if (!colName) continue
      data[colName] = xlsxCellValue(cellXml, sharedStrings) ?? undefined
    }

    const errors: string[] = []
    const regionStr = (data["Region"] ?? "").trim()
    if (!regionStr) errors.push("Region kosong")

    const yearVal = parseInt(data["Year"] ?? "", 10)
    if (isNaN(yearVal) || yearVal <= 1900) errors.push(`Year tidak valid (${data["Year"]})`)

    const monthVal = parseInt(data["Month"] ?? "", 10)
    if (isNaN(monthVal) || monthVal < 1 || monthVal > 12)
      errors.push(`Month tidak valid (${data["Month"]})`)

    const nettoStr = (data["Netto_Wise"] ?? "").trim()
    const nettoVal = parseFloat(nettoStr)
    if (!nettoStr || isNaN(nettoVal)) errors.push(`Netto_Wise bukan angka (${data["Netto_Wise"]})`)

    if (errors.length > 0) {
      malformedRows.push({ rowNumber: rowIndex + 1, reason: errors.join("; ") })
    } else {
      validRows.push({ region: regionStr, year: yearVal, month: monthVal, nettoWise: nettoVal })
    }
  }

  const periods = validRows.map((r) => [r.year, r.month] as [number, number]).sort((a, b) =>
    a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]
  )
  const distinctRegions = [...new Set(validRows.map((r) => r.region))].sort()

  return {
    totalRows: validRows.length + malformedRows.length,
    validRows: validRows.length,
    malformedRows,
    distinctRegions,
    periodMinYear:  periods[0]?.[0] ?? null,
    periodMinMonth: periods[0]?.[1] ?? null,
    periodMaxYear:  periods[periods.length - 1]?.[0] ?? null,
    periodMaxMonth: periods[periods.length - 1]?.[1] ?? null,
    previewRows: validRows.slice(0, 10),
  }
}

// ── XLSX cell parsing helpers ──────────────────────────────────────────────────

function xlsxCellString(cellXml: string, ss: string[]): string | null {
  if (cellXml.includes('t="s"')) {
    const m = cellXml.match(/<v>(\d+)<\/v>/)
    return m ? (ss[parseInt(m[1], 10)] ?? null) : null
  }
  if (cellXml.includes('t="inlineStr"')) {
    const m = cellXml.match(/<t(?:[^>]*)>(.*?)<\/t>/s)
    return m ? m[1] : null
  }
  if (cellXml.includes('t="str"')) {
    const m = cellXml.match(/<v>([^<]*)<\/v>/)
    return m ? m[1] : null
  }
  return null
}

function xlsxCellValue(cellXml: string, ss: string[]): string | null {
  if (cellXml.includes('t="inlineStr"')) {
    const m = cellXml.match(/<t(?:[^>]*)>(.*?)<\/t>/s)
    return m ? m[1] : null
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
