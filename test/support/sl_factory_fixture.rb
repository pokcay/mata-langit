# frozen_string_literal: true

require "axlsx"

# Builds a small synthetic "Detail SL" workbook that mirrors the real SAP export
# structure (preamble + PERIOD row + double header with a grand-total row
# between, data starting at row 8, data columns in B–AA), plus a decoy "(2)"
# brand-code sheet that the parser must ignore.
module SlFactoryFixture
  module_function

  # Header row: nil in A, real labels in B–AA (X/Z blank — they hold "%" units).
  HEADER = [
    nil,
    "Shipping", "Sold-to Party", "Area", "F & R", "Customer Name",
    "DATE SO", "NO SO", "NO DN", "DATE Invoice", "NO Invoice",
    "CODE MATERIAL", "BRAND", "DESCRIPTION MATERIAL",
    "Qty SO", "Value SO", "Qty Delivery Order", "Value Delivery Order",
    "Qty Return", "Value Return", "Qty Net", "Value Net",
    "% QTY", nil, "% Value", nil, "Reason For Rejection"
  ].freeze

  # Default data rows; value_net sums to 2500.00.
  DEFAULT_ROWS = [
    { shipping: "SLT",   sold_to: "0030000041", area: "Sumteng", fr: "Faktur", cust: "PT ANUGERAH", date_so: "07.04.2026", no_so: "60120424", no_dn: "200120811", date_inv: "07.04.2026", no_inv: "550119811", code: "1404001", brand: "Doremi", desc: "DM BWS SS GLITZY 200", qty_so: 60,  value_so: 1000.5,  qdo: 60, vdo: 1000.5, qret: 0, vret: 0, qnet: 60, value_net: 1000.5, pct_qty: 100, pct_value: 100, reason: nil },
    { shipping: "JKT2",  sold_to: "200095",     area: "Jabo 2",  fr: "Faktur", cust: "PT IZZI",     date_so: "10.04.2026", no_so: "60120425", no_dn: "200120812", date_inv: "10.04.2026", no_inv: "550119812", code: "1408001", brand: "Izzi",   desc: "IZ EDT TRUE LOVE 100",  qty_so: 40,  value_so: 2000.25, qdo: 40, vdo: 2000.25, qret: 0, vret: 0, qnet: 40, value_net: 2000.25, pct_qty: 100, pct_value: 100, reason: "Insufficient stock available" },
    { shipping: "Other", sold_to: "200100",     area: "Lainnya", fr: "Return", cust: "PT SAFI",     date_so: "12.04.2026", no_so: "60120426", no_dn: "200120813", date_inv: "12.04.2026", no_inv: "550119813", code: "1409006", brand: "Safi",   desc: "SF SHP HAIRX 10",        qty_so: -10, value_so: -500.75, qdo: 0,  vdo: 0,      qret: -10, vret: -500.75, qnet: -10, value_net: -500.75, pct_qty: 100, pct_value: 100, reason: nil }
  ].freeze

  # Returns the path to a freshly-built .xlsx Tempfile. Caller keeps the Tempfile
  # alive (we stash it on the returned path's singleton to avoid GC/unlink).
  def build(period: "01.04.2026 TO 30.04.2026",
            sheet_name: "Detail SL Test 2026",
            rows: DEFAULT_ROWS,
            include_period: true,
            include_detail_sheet: true)
    pkg = Axlsx::Package.new
    wb  = pkg.workbook

    # Decoy "(2)" sheet first — the parser must NOT pick this one.
    wb.add_worksheet(name: "#{sheet_name} (2)") do |s|
      s.add_row HEADER
      s.add_row data_row(DEFAULT_ROWS.first.merge(shipping: "DECOY", value_net: 999_999, brand: "WRONG"))
    end

    if include_detail_sheet
      wb.add_worksheet(name: sheet_name) do |s|
        s.add_row ["SERVICE LEVEL BY DETAIL SO-DN-Invoice"]
        s.add_row (include_period ? ["PERIOD :", nil, period.split(" TO ").first, nil, "TO", period.split(" TO ").last] : ["(no period here)"])
        s.add_row ["SALES TYPE :", nil, nil, "ALL"]
        s.add_row ["ZBS_SERVICE_LEVEL01"]
        s.add_row HEADER                                  # header #1
        s.add_row grand_total_row                         # grand-total (blank Shipping)
        s.add_row HEADER                                  # header #2 (data starts after)
        rows.each_with_index do |r, i|
          # Force :string cells so numeric-looking identifiers keep leading zeros
          # (mirrors the real export, which stores them as shared strings).
          s.add_row data_row(r), types: Array.new(27, :string)
          # Interleave a repeated header + a blank-shipping total to verify skipping.
          if i == 0
            s.add_row HEADER
            s.add_row grand_total_row
          end
        end
      end
    else
      wb.add_worksheet(name: "National") { |s| s.add_row ["nothing useful"] }
    end

    tmp = Tempfile.new([ "sl_factory_fixture", ".xlsx" ])
    tmp.binmode
    tmp.write(pkg.to_stream.read)
    tmp.flush
    tmp.rewind
    path = tmp.path
    path.define_singleton_method(:_keepalive) { tmp }
    path
  end

  def expected_value_net_sum(rows = DEFAULT_ROWS)
    rows.sum { |r| r[:value_net] }
  end

  def data_row(r)
    [
      nil,
      r[:shipping], r[:sold_to], r[:area], r[:fr], r[:cust],
      r[:date_so], r[:no_so], r[:no_dn], r[:date_inv], r[:no_inv],
      r[:code], r[:brand], r[:desc],
      r[:qty_so], r[:value_so], r[:qdo], r[:vdo],
      r[:qret], r[:vret], r[:qnet], r[:value_net],
      r[:pct_qty], "%", r[:pct_value], "%", r[:reason]
    ]
  end

  def grand_total_row
    row = Array.new(27)
    (14..21).each { |i| row[i] = -123 }
    row
  end
end
