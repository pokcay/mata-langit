import { describe, it, expect } from "vitest"
import { zipSync, strToU8 } from "fflate"
import { parseXlsxForPreview } from "@/lib/xlsxPreviewParser"

// ── XLSX builder helpers ─────────────────────────────────────────────────────
// These assemble the minimal set of ZIP entries the parser actually reads:
// xl/workbook.xml, xl/_rels/workbook.xml.rels, optional xl/sharedStrings.xml,
// and one or more xl/worksheets/sheetN.xml. Everything else a real .xlsx needs
// (Content_Types, styles, etc.) is irrelevant to the preview parse.

/** A cell carrying an inline string (LibreOffice Calc style — no sharedStrings). */
function inlineCell(ref: string, text: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`
}

/** A cell referencing the shared-strings table by index. */
function sharedCell(ref: string, index: number): string {
  return `<c r="${ref}" t="s"><v>${index}</v></c>`
}

/** A numeric cell. */
function numCell(ref: string, value: number | string): string {
  return `<c r="${ref}"><v>${value}</v></c>`
}

function rowXml(ref: number, cells: string[]): string {
  return `<row r="${ref}">${cells.join("")}</row>`
}

function worksheet(rows: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rows.join("")}</sheetData></worksheet>`
  )
}

function sharedStringsXml(strings: string[]): string {
  const items = strings.map((s) => `<si><t>${s}</t></si>`).join("")
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `count="${strings.length}" uniqueCount="${strings.length}">${items}</sst>`
  )
}

function workbookXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, i) => {
    const n = i + 1
    return `<sheet name="Sheet${n}" sheetId="${n}" r:id="rId${n}"/>`
  }).join("")
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${sheets}</sheets></workbook>`
  )
}

function workbookRels(sheetCount: number): string {
  const rels = Array.from({ length: sheetCount }, (_, i) => {
    const n = i + 1
    return (
      `<Relationship Id="rId${n}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
      `Target="worksheets/sheet${n}.xml"/>`
    )
  }).join("")
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `${rels}</Relationships>`
  )
}

interface XlsxParts {
  sheets: string[] // worksheet XML, one per sheet, in tab order
  sharedStrings?: string[]
}

function makeXlsxFile(parts: XlsxParts): File {
  const entries: Record<string, Uint8Array> = {
    "xl/workbook.xml": strToU8(workbookXml(parts.sheets.length)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels(parts.sheets.length)),
  }
  parts.sheets.forEach((xml, i) => {
    entries[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml)
  })
  if (parts.sharedStrings) {
    entries["xl/sharedStrings.xml"] = strToU8(sharedStringsXml(parts.sharedStrings))
  }
  const zipped = zipSync(entries)
  return new File([zipped], "test.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

/** Convenience: build a single-sheet file from already-formed rows. */
function singleSheet(rows: string[], sharedStrings?: string[]): File {
  return makeXlsxFile({ sheets: [worksheet(rows)], sharedStrings })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("parseXlsxForPreview", () => {
  it("parses inline-string worksheets with no sharedStrings.xml (LibreOffice Calc)", async () => {
    const file = singleSheet([
      rowXml(1, [inlineCell("A1", "Region"), inlineCell("B1", "Netto Wise")]),
      rowXml(2, [inlineCell("A2", "RegCen"), numCell("B2", 100.5)]),
      rowXml(3, [inlineCell("A3", "RegEast"), numCell("B3", 200.25)]),
      rowXml(4, [inlineCell("A4", "RegWest"), numCell("B4", 50)]),
    ])
    const result = await parseXlsxForPreview(file)
    expect(result.rowCount).toBe(3)
    expect(result.nettoSum).toBe(350.75)
  })

  it("resolves strings via a sharedStrings table", async () => {
    // index 0 = "Region", 1 = "Netto Wise"
    const file = singleSheet(
      [
        rowXml(1, [sharedCell("A1", 0), sharedCell("B1", 1)]),
        rowXml(2, [sharedCell("A2", 0), numCell("B2", 1000)]),
        rowXml(3, [sharedCell("A3", 0), numCell("B3", 2000)]),
      ],
      ["Region", "Netto Wise"],
    )
    const result = await parseXlsxForPreview(file)
    expect(result.rowCount).toBe(2)
    expect(result.nettoSum).toBe(3000)
  })

  it("locates the Netto Wise column regardless of its position", async () => {
    // Netto Wise is column C, not B.
    const file = singleSheet([
      rowXml(1, [
        inlineCell("A1", "Region"),
        inlineCell("B1", "Periode"),
        inlineCell("C1", "Netto Wise"),
      ]),
      rowXml(2, [inlineCell("A2", "RegCen"), inlineCell("B2", "Mei"), numCell("C2", 42)]),
    ])
    const result = await parseXlsxForPreview(file)
    expect(result.rowCount).toBe(1)
    expect(result.nettoSum).toBe(42)
  })

  it("counts rows but sums 0 when there is no Netto Wise column", async () => {
    const file = singleSheet([
      rowXml(1, [inlineCell("A1", "Region"), inlineCell("B1", "Gross")]),
      rowXml(2, [inlineCell("A2", "RegCen"), numCell("B2", 999)]),
      rowXml(3, [inlineCell("A3", "RegEast"), numCell("B3", 888)]),
    ])
    const result = await parseXlsxForPreview(file)
    expect(result.rowCount).toBe(2)
    expect(result.nettoSum).toBe(0)
  })

  it("skips blank rows (no <v> or <is> cells)", async () => {
    const file = singleSheet([
      rowXml(1, [inlineCell("A1", "Region"), inlineCell("B1", "Netto Wise")]),
      rowXml(2, [inlineCell("A2", "RegCen"), numCell("B2", 7)]),
      rowXml(3, []), // fully blank
    ])
    const result = await parseXlsxForPreview(file)
    expect(result.rowCount).toBe(1)
    expect(result.nettoSum).toBe(7)
  })

  it("falls back to the data sheet when the first sheet is an empty cover sheet", async () => {
    const cover = worksheet([]) // no rows
    const data = worksheet([
      rowXml(1, [inlineCell("A1", "Region"), inlineCell("B1", "Netto Wise")]),
      rowXml(2, [inlineCell("A2", "RegCen"), numCell("B2", 11)]),
      rowXml(3, [inlineCell("A3", "RegEast"), numCell("B3", 22)]),
    ])
    const file = makeXlsxFile({ sheets: [cover, data] })
    const result = await parseXlsxForPreview(file)
    expect(result.rowCount).toBe(2)
    expect(result.nettoSum).toBe(33)
  })

  it("handles a worksheet larger than the 8 MB decode chunk (rows straddle boundaries)", async () => {
    const NROWS = 120_000
    const rows = [rowXml(1, [inlineCell("A1", "Region"), inlineCell("B1", "Netto Wise")])]
    for (let i = 0; i < NROWS; i++) {
      const r = i + 2
      rows.push(rowXml(r, [inlineCell(`A${r}`, "RegCen"), numCell(`B${r}`, 1)]))
    }
    const sheetXml = worksheet(rows)
    // Guard the premise: the worksheet must actually exceed one decode window.
    expect(sheetXml.length).toBeGreaterThan(8 * 1024 * 1024)

    const file = makeXlsxFile({ sheets: [sheetXml] })
    const result = await parseXlsxForPreview(file)
    expect(result.rowCount).toBe(NROWS)
    expect(result.nettoSum).toBe(NROWS)
  })

  it("rounds the netto sum to 4 decimal places", async () => {
    const file = singleSheet([
      rowXml(1, [inlineCell("A1", "Region"), inlineCell("B1", "Netto Wise")]),
      rowXml(2, [inlineCell("A2", "RegCen"), numCell("B2", "100.123456")]),
    ])
    const result = await parseXlsxForPreview(file)
    expect(result.nettoSum).toBe(100.1235)
  })
})
