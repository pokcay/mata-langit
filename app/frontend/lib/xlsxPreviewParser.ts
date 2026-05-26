import { unzipSync } from "fflate"

/**
 * Minimal XLSX preview parser.
 *
 * Reads workbook.xml + rels to find the correct first-sheet path (the ZIP
 * internal filename doesn't always match the visible tab order), then builds a
 * shared-strings table, identifies the Netto Wise column letter from the header
 * row, and sums that column across all data rows.
 */
export async function parseXlsxForPreview(
  file: File
): Promise<{ rowCount: number; nettoSum: number }> {
  const buf = await file.arrayBuffer()
  const data = new Uint8Array(buf)
  const decode = (b: Uint8Array) => new TextDecoder().decode(b)

  // ── 1. Resolve the first worksheet path from workbook metadata ─────────────
  const worksheetPath = resolveFirstWorksheetPath(data, decode)

  // ── 2. Build shared-strings table (joining <r><t>…</t></r> runs) ───────────
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
  if (!wsBytes) throw new Error("Invalid XLSX: worksheet not found")
  const wsXml = decode(wsBytes)
  const rowParts = wsXml.split("<row ")

  // ── 3. Locate Netto Wise column letter from header row ─────────────────────
  let nettoCol = ""
  if (rowParts.length > 1) {
    const headerEnd = rowParts[1].indexOf("</row>")
    const headerXml = rowParts[1].slice(0, headerEnd >= 0 ? headerEnd : undefined)
    for (const cellXml of headerXml.split("<c ").slice(1)) {
      const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
      if (!letterMatch) continue
      const colName = xlsxCellString(cellXml, sharedStrings)
      if (colName && colName.trim() === "Netto Wise") {
        nettoCol = letterMatch[1]
        break
      }
    }
  }

  // ── 4. Count rows and sum netto column ─────────────────────────────────────
  let rowCount = 0
  let nettoSum = 0

  for (let i = 2; i < rowParts.length; i++) {
    const end = rowParts[i].indexOf("</row>")
    const rowContent = end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]

    if (!rowContent.includes("<v>") && !rowContent.includes("<is>")) continue // blank row
    rowCount++

    if (!nettoCol) continue

    for (const cellXml of rowContent.split("<c ").slice(1)) {
      const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
      if (!letterMatch || letterMatch[1] !== nettoCol) continue
      const raw = xlsxCellValue(cellXml, sharedStrings)
      if (raw == null) break
      const val = parseFloat(raw)
      if (!isNaN(val)) nettoSum += val
      break
    }
  }

  return { rowCount, nettoSum: Math.round(nettoSum * 10000) / 10000 }
}

// ── Workbook path resolution ───────────────────────────────────────────────────

/**
 * Reads xl/workbook.xml and xl/_rels/workbook.xml.rels to find the ZIP-internal
 * path of the first worksheet (by tab order).  Falls back to sheet1.xml.
 *
 * The XLSX ZIP's sheetN.xml filenames reflect creation order, not tab order.
 * If sheets are reordered in Excel, the first visible tab may map to sheet2.xml
 * or higher.  Without this lookup, the parser silently reads the wrong sheet.
 */
function resolveFirstWorksheetPath(
  data: Uint8Array,
  decode: (b: Uint8Array) => string,
): string {
  const fallback = "xl/worksheets/sheet1.xml"
  try {
    const metaFiles = unzipSync(data, {
      filter: (f) =>
        f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels",
    })

    const wbBytes = metaFiles["xl/workbook.xml"]
    const relsBytes = metaFiles["xl/_rels/workbook.xml.rels"]
    if (!wbBytes || !relsBytes) return fallback

    const wbXml = decode(wbBytes)
    const relsXml = decode(relsBytes)

    const rId = extractFirstSheetRId(wbXml)
    if (!rId) return fallback

    const target = extractRelTarget(relsXml, rId)
    if (!target) return fallback

    // Target is relative to the xl/ directory (stored in xl/_rels/).
    // Common forms: "worksheets/sheet2.xml" or "../worksheets/sheet2.xml"
    if (target.startsWith("../")) return target.slice(3)
    if (target.startsWith("/")) return target.slice(1)
    return `xl/${target}`
  } catch {
    return fallback
  }
}

function extractFirstSheetRId(wbXml: string): string | null {
  const match = wbXml.match(/<sheet\b[^>]*>/)
  if (!match) return null
  const m = match[0].match(/\br:id="([^"]+)"/)
  return m ? m[1] : null
}

function extractRelTarget(relsXml: string, rId: string): string | null {
  const parts = relsXml.split(/<Relationship\b/)
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].includes(`Id="${rId}"`)) {
      const m = parts[i].match(/\bTarget="([^"]+)"/)
      if (m) return m[1]
    }
  }
  return null
}

// ── XLSX cell parsing helpers ──────────────────────────────────────────────────

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
