# frozen_string_literal: true

require "axlsx"

# Builds a small synthetic "Rental Cost" workbook that mirrors the real file
# structure: a single sheet named "RENTAL" with the period title in the merged
# A1 cell ({MONTH NAME} - {YYYY}), the header on row 2
# (NO | REGION | AREA | DIST PARENT | DIST CHILD | OUTLET CODE | OUTLET NAME | RENTAL | COST),
# and data from row 3. A blank-region decoy row is interleaved to exercise the
# skip logic.
module MasterRentalFixture
  module_function

  HEADER = [
    "NO", "REGION", "AREA", "DIST PARENT", "DIST CHILD",
    "OUTLET CODE", "OUTLET NAME", "RENTAL", "COST"
  ].freeze

  # Default data rows; COST sums to 7,100,000.
  DEFAULT_ROWS = [
    { region: "RegCen", area: "Jawa Barat", dist_parent: "Cahaya Sejahtera Waluya, Bandung", dist_child: "Cahaya Sejahtera Waluya, Bandung", outlet_code: "RCJBB000357", outlet_name: "DAYTI",            rental: "Back Wall 1",   cost: 2_500_000 },
    { region: "RegTim", area: "JatimSel",   dist_parent: "Bahagia Intra Niaga, Jember",      dist_child: "Bahagia Intra Niaga, Jember",      outlet_code: "REJTS000650", outlet_name: "JEMBER ROXY",        rental: "End Gondola 1", cost: 4_000_000 },
    { region: "RegBar", area: "SumUt",      dist_parent: "Liandi Prima Abadi, Medan",        dist_child: "Liandi Prima Abadi, Medan",        outlet_code: "RWSBU001736", outlet_name: "IRIAN BAHAGIA",      rental: "Shelving 1a",   cost: 600_000 }
  ].freeze

  # Returns the path to a freshly-built .xlsx Tempfile. Caller keeps the Tempfile
  # alive (we stash it on the returned path's singleton to avoid GC/unlink).
  def build(title: "MAY - 2026",
            rows: DEFAULT_ROWS,
            include_title: true,
            sheet_name: "RENTAL")
    pkg = Axlsx::Package.new
    wb  = pkg.workbook

    wb.add_worksheet(name: sheet_name) do |s|
      s.add_row(include_title ? [ title ] : [ "" ])  # row 1 — merged title cell A1
      s.add_row HEADER                               # row 2 — header
      rows.each_with_index do |r, i|
        s.add_row data_row(i + 1, r)
        # Interleave one blank-region row to verify it is skipped.
        if i == 0
          s.add_row [ 999, nil, "Lainnya", "X", "X", "BLANK0001", "BLANK OUTLET", "Ghost", 99_999 ]
        end
      end
    end

    tmp = Tempfile.new([ "master_rental_fixture", ".xlsx" ])
    tmp.binmode
    tmp.write(pkg.to_stream.read)
    tmp.flush
    tmp.rewind
    path = tmp.path
    path.define_singleton_method(:_keepalive) { tmp }
    path
  end

  def expected_total_cost(rows = DEFAULT_ROWS)
    rows.sum { |r| r[:cost] }
  end

  def data_row(no, r)
    [
      no,
      r[:region], r[:area], r[:dist_parent], r[:dist_child],
      r[:outlet_code], r[:outlet_name], r[:rental], r[:cost]
    ]
  end
end
