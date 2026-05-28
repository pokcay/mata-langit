import { unzipSync } from "fflate"

/**
 * Minimal XLSX preview parser.
 *
 * Resolves worksheet order from workbook metadata, builds a shared-strings
 * table, identifies the Netto Wise column letter from the header row, and
 * sums that column across all data rows.
 *
 * If the first worksheet has no data rows (e.g. blank cover sheet or wrong
 * sheet resolved from metadata), the parser scans all xl/worksheets/*.xml
 * entries and returns the result from the sheet with the most data rows.
 */
export async function parseXlsxForPreview(
  file: File
): Promise<{ rowCount: number; nettoSum: number }> {
  const buf = await file.arrayBuffer()
  const data = new Uint8Array(buf)
  const decode = (b: Uint8Array) => new TextDecoder().decode(b)

  // ── 1. Resolve all worksheet paths in tab order from workbook metadata ──────
  const worksheetPaths = resolveWorksheetPaths(data, decode)

  // ── 2. Extract shared strings + ALL worksheets in one ZIP pass ────────────
  //    Extracting all sheets avoids a second unzip when the primary sheet is
  //    empty (e.g. blank cover sheet before the actual data sheet).
  const extracted = unzipSync(data, {
    filter: (f) =>
      f.name === "xl/sharedStrings.xml" ||
      (f.name.startsWith("xl/worksheets/") && f.name.endsWith(".xml")),
  })

  // ── 3. Build shared-strings table (joining <r><t>…</t></r> runs) ───────────
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

  // ── 4. Build ordered list: workbook tab order first, then any extras ────────
  const extractedWsNames = Object.keys(extracted).filter(
    (n) => n.startsWith("xl/worksheets/") && n.endsWith(".xml"),
  )
  const remainingPaths = extractedWsNames.filter((n) => !worksheetPaths.includes(n))
  const orderedPaths = [...worksheetPaths, ...remainingPaths]

  if (orderedPaths.length === 0) {
    throw new Error("Invalid XLSX: no worksheet paths found")
  }

  // ── 5. Parse each worksheet; return result from the sheet with most rows ────
  //    This handles the case where sheet1 is empty (cover/title sheet) and
  //    actual data lives on sheet2 or later.
  let bestRowCount = 0
  let bestNettoSum = 0
  let anyReadable = false

  for (const path of orderedPaths) {
    const wsBytes = extracted[path]
    if (!wsBytes) continue
    anyReadable = true
    const { rowCount, nettoSum } = parseWorksheetXml(decode(wsBytes), sharedStrings)
    if (rowCount > bestRowCount) {
      bestRowCount = rowCount
      bestNettoSum = nettoSum
    }
  }

  if (!anyReadable) {
    throw new Error("Invalid XLSX: no readable worksheet found")
  }

  return { rowCount: bestRowCount, nettoSum: Math.round(bestNettoSum * 10000) / 10000 }
}

// ── Worksheet XML parser ───────────────────────────────────────────────────────

function parseWorksheetXml(
  wsXml: string,
  sharedStrings: string[],
): { rowCount: number; nettoSum: number } {
  const rowParts = wsXml.split("<row ")

  // ── Locate Netto Wise column letter from header row ───────────────────────
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

  // ── Count rows and sum netto column ──────────────────────────────────────
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

  return { rowCount, nettoSum }
}

// ── Workbook path resolution ───────────────────────────────────────────────────

/**
 * Reads xl/workbook.xml and xl/_rels/workbook.xml.rels to return ALL worksheet
 * paths in tab order.  Falls back to ["xl/worksheets/sheet1.xml"].
 *
 * The XLSX ZIP's sheetN.xml filenames reflect creation order, not tab order.
 * If sheets are reordered in Excel, the first visible tab may map to sheet2.xml
 * or higher.  Without this lookup, the parser silently reads the wrong sheet.
 */
function resolveWorksheetPaths(
  data: Uint8Array,
  decode: (b: Uint8Array) => string,
): string[] {
  const fallback = ["xl/worksheets/sheet1.xml"]
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

    // Extract ALL sheet rIds in tab order (not just the first one)
    const rIds: string[] = []
    for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
      const idMatch = m[0].match(/\br:id="([^"]+)"/)
      if (idMatch) rIds.push(idMatch[1])
    }
    if (!rIds.length) return fallback

    const paths = rIds
      .map((rId) => extractRelTarget(relsXml, rId))
      .filter((t): t is string => t !== null)
      .map((target) => {
        // Target is relative to the xl/ directory (stored in xl/_rels/).
        // Common forms: "worksheets/sheet2.xml" or "../worksheets/sheet2.xml"
        if (target.startsWith("../")) return target.slice(3)
        if (target.startsWith("/")) return target.slice(1)
        return `xl/${target}`
      })

    return paths.length > 0 ? paths : fallback
  } catch {
    return fallback
  }
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
