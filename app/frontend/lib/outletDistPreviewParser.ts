import { unzipSync } from "fflate"

/**
 * Browser-side parser for OUTLET_DIST_*.xlsx files.
 *
 * Locates the "OUTLET DISTRIBUTOR" sheet by name (not by tab position),
 * reads the header row to find "Distributor SAP Code" and "Distributor Child
 * Name" column letters, extracts those values from the first data row, and
 * counts all data rows.
 */
export async function parseOutletDistForPreview(
  file: File,
): Promise<{ rowCount: number; distSapCode: string; distName: string }> {
  const buf = await file.arrayBuffer()
  const data = new Uint8Array(buf)
  const decode = (b: Uint8Array) => new TextDecoder().decode(b)

  // ── 1. Find the OUTLET DISTRIBUTOR sheet path ─────────────────────────────
  const worksheetPath = resolveOutletDistSheetPath(data, decode)

  // ── 2. Load shared strings (may be empty for inline-string files) ─────────
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
  if (!wsBytes) throw new Error("OUTLET DISTRIBUTOR sheet not found in file")
  const wsXml = decode(wsBytes)
  const rowParts = wsXml.split("<row ")

  if (rowParts.length < 2) throw new Error("OUTLET DISTRIBUTOR sheet is empty")

  // ── 3. Map column letters from header row ─────────────────────────────────
  let sapCodeCol = ""
  let childNameCol = ""

  const headerEnd = rowParts[1].indexOf("</row>")
  const headerXml = rowParts[1].slice(0, headerEnd >= 0 ? headerEnd : undefined)
  for (const cellXml of headerXml.split("<c ").slice(1)) {
    const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
    if (!letterMatch) continue
    const letter = letterMatch[1]
    const colName = xlsxCellString(cellXml, sharedStrings)
    if (!colName) continue
    if (colName.trim() === "Distributor SAP Code") sapCodeCol = letter
    if (colName.trim() === "Distributor Child Name") childNameCol = letter
  }

  if (!sapCodeCol) throw new Error("Column 'Distributor SAP Code' not found in OUTLET DISTRIBUTOR sheet")
  if (!childNameCol) throw new Error("Column 'Distributor Child Name' not found in OUTLET DISTRIBUTOR sheet")

  // ── 4. Read first data row for distributor identity ───────────────────────
  let distSapCode = ""
  let distName = ""

  if (rowParts.length >= 3) {
    const firstDataEnd = rowParts[2].indexOf("</row>")
    const firstDataXml = rowParts[2].slice(0, firstDataEnd >= 0 ? firstDataEnd : undefined)
    for (const cellXml of firstDataXml.split("<c ").slice(1)) {
      const letterMatch = cellXml.match(/r="([A-Z]+)\d+"/)
      if (!letterMatch) continue
      const letter = letterMatch[1]
      const val = xlsxCellValue(cellXml, sharedStrings)
      if (val == null) continue
      if (letter === sapCodeCol) distSapCode = val.trim()
      if (letter === childNameCol) distName = val.trim()
    }
  }

  if (!distSapCode) throw new Error("Distributor SAP Code is blank in the first data row")
  if (!distName) throw new Error("Distributor Child Name is blank in the first data row")

  // ── 5. Count all data rows ────────────────────────────────────────────────
  let rowCount = 0
  for (let i = 2; i < rowParts.length; i++) {
    const end = rowParts[i].indexOf("</row>")
    const content = end >= 0 ? rowParts[i].slice(0, end) : rowParts[i]
    if (content.includes("<v>") || content.includes("<is>")) rowCount++
  }

  return { rowCount, distSapCode, distName }
}

// ── Sheet path resolution ─────────────────────────────────────────────────────

function resolveOutletDistSheetPath(data: Uint8Array, decode: (b: Uint8Array) => string): string {
  const fallback = "xl/worksheets/sheet3.xml"
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

    const rId = extractSheetRIdByName(wbXml, "OUTLET DISTRIBUTOR")
    if (!rId) throw new Error("Sheet 'OUTLET DISTRIBUTOR' not found in workbook")

    const target = extractRelTarget(relsXml, rId)
    if (!target) return fallback

    if (target.startsWith("../")) return target.slice(3)
    if (target.startsWith("/")) return target.slice(1)
    return `xl/${target}`
  } catch (err) {
    // Surface the error if it's the "not found" one so users get a clear message
    if (err instanceof Error && err.message.includes("OUTLET DISTRIBUTOR")) throw err
    return fallback
  }
}

function extractSheetRIdByName(wbXml: string, sheetName: string): string | null {
  // Match <sheet name="OUTLET DISTRIBUTOR" ... r:id="rIdSheetN" ...>
  const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`<sheet\\b[^>]*name="${escaped}"[^>]*>`)
  const match = wbXml.match(re)
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

// ── XLSX cell helpers ─────────────────────────────────────────────────────────

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
