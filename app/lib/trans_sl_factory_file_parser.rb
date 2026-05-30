# frozen_string_literal: true

# Parses the monthly "Detail SL {Month} {Year}" SAP export (report
# ZBS_SERVICE_LEVEL01, "SERVICE LEVEL BY DETAIL SO-DN-Invoice") into DB-ready
# hashes for TransSlFactoryTransaction.
#
# The workbook contains several pivot summary tabs plus TWO detail tabs:
#   "Detail SL {Month} {Year}"      — full brand names  (TARGET)
#   "Detail SL {Month} {Year} (2)"  — brand codes       (skipped)
# The detail sheet is located by the "Detail SL" tab-name prefix (which changes
# every month), excluding the "(2)" variant.
#
# Sheet layout (verified against a real file):
#   row 1  "SERVICE LEVEL BY DETAIL SO-DN-Invoice" (title)
#   row 2  "PERIOD :"  …  "01.04.2026"  "TO"  "30.04.2026"   ← period source
#   row 3  "SALES TYPE :  ALL"
#   row 4  "ZBS_SERVICE_LEVEL01"
#   row 5  header (cols B–AA)
#   row 6  grand-total row (numbers only, blank Shipping)
#   row 7  header repeated
#   row 8+ data
#
# Period (year + month) is read from the PERIOD row's start date (DD.MM.YYYY),
# never from the filename. Data columns live in B–AA; column A is blank and
# cols X/Z hold literal "%" units that are ignored.
class TransSlFactoryFileParser
  DETAIL_SHEET_PREFIX = "Detail SL"

  # Header label (normalized, see #normalize) => DB column.
  COLUMN_MAP = {
    "shipping"               => :shipping_point,
    "sold-to party"          => :sold_to_party,
    "area"                   => :area,
    "f & r"                  => :f_and_r_type,
    "customer name"          => :customer_name,
    "date so"                => :date_so,
    "no so"                  => :no_so,
    "no dn"                  => :no_dn,
    "date invoice"           => :date_invoice,
    "no invoice"             => :no_invoice,
    "code material"          => :code_material,
    "brand"                  => :brand,
    "description material"   => :description_material,
    "qty so"                 => :qty_so,
    "value so"               => :value_so,
    "qty delivery order"     => :qty_delivery_order,
    "value delivery order"   => :value_delivery_order,
    "qty return"             => :qty_return,
    "value return"           => :value_return,
    "qty net"                => :qty_net,
    "value net"              => :value_net,
    "% qty"                  => :pct_qty,
    "% value"                => :pct_value,
    "reason for rejection"   => :reason_for_rejection
  }.freeze

  NUMERIC_COLUMNS = %i[
    qty_so value_so qty_delivery_order value_delivery_order
    qty_return value_return qty_net value_net pct_qty pct_value
  ].freeze

  DATE_COLUMNS = %i[date_so date_invoice].freeze

  # Minimum mapped columns for a row to qualify as the header row.
  HEADER_MATCH_THRESHOLD = 12

  # -------------------------------------------------------------------------
  # Public API
  # -------------------------------------------------------------------------

  # Returns { period_year:, period_month: } read from the in-file PERIOD row.
  def self.read_period(file_path)
    require "zip"
    Zip::File.open(file_path) do |zip|
      shared_strings = load_shared_strings(zip)
      ws_xml = read_detail_sheet(zip)
      rows   = ws_xml.split("<row ")

      rows[1, 12].to_a.each do |row_part|
        end_idx = row_part.index("</row>") || row_part.length
        content = row_part[0, end_idx]
        values  = content.split("<c ").drop(1).map { |cx| xlsx_cell_value(cx, shared_strings) }
        joined  = values.compact.map(&:to_s).join(" ")
        next unless joined =~ /PERIOD/i

        if (m = joined.match(/(\d{2})\.(\d{2})\.(\d{4})/))
          month = m[2].to_i
          year  = m[3].to_i
          unless (1..12).cover?(month)
            raise ArgumentError, "Bulan tidak valid (#{month}) di baris PERIOD."
          end
          return { period_year: year, period_month: month }
        end
      end

      raise ArgumentError,
        "Baris 'PERIOD :' (mis. \"01.04.2026 TO 30.04.2026\") tidak ditemukan di sheet detail. " \
        "Pastikan file yang diupload adalah export 'Detail SL' yang benar."
    end
  end

  # Yields batches of insert_all-ready hashes from the detail sheet.
  def self.each_batch(file_path, upload_id:, period_year:, period_month:, batch_size: 1000)
    require "zip"

    base_attrs = {
      trans_sl_factory_upload_id: upload_id,
      period_year:  period_year,
      period_month: period_month
    }

    Zip::File.open(file_path) do |zip|
      shared_strings = load_shared_strings(zip)
      ws_xml = read_detail_sheet(zip)
      rows   = ws_xml.split("<row ")

      letter_map, header_idx = find_header(rows, shared_strings)
      raise ArgumentError, "Baris header detail SL tidak ditemukan." unless letter_map

      shipping_letter = letter_map.key(:shipping_point)

      row_template = base_attrs.dup
      letter_map.each_value { |col| row_template[col] = nil }

      batch = []

      rows.drop(header_idx + 1).each do |row_part|
        end_idx     = row_part.index("</row>") || row_part.length
        row_content = row_part[0, end_idx]
        next unless row_content.include?("<v>") || row_content.include?("<is>")

        row_attrs = row_template.dup

        row_content.split("<c ").drop(1).each do |cell_xml|
          col_letter = cell_xml[/r="([A-Z]+)\d+"/, 1]
          next unless col_letter
          db_col = letter_map[col_letter]
          next unless db_col

          raw = xlsx_cell_value(cell_xml, shared_strings)
          next if raw.nil?
          row_attrs[db_col] = cast_value(db_col, raw)
        end

        # Skip grand-total rows (blank Shipping) and repeated header rows.
        shipping = row_attrs[:shipping_point]
        next if shipping.nil? || shipping.to_s.strip.empty?
        next if shipping.to_s.strip.casecmp?("Shipping")

        batch << row_attrs
        if batch.size >= batch_size
          yield batch
          batch = []
        end
      end

      yield batch unless batch.empty?
    end
  end

  # -------------------------------------------------------------------------
  # Private helpers
  # -------------------------------------------------------------------------

  def self.read_detail_sheet(zip)
    path = resolve_sheet_path(zip)
    zip.find_entry(path).get_input_stream.read.force_encoding("UTF-8")
  end
  private_class_method :read_detail_sheet

  def self.resolve_sheet_path(zip)
    wb_entry = zip.find_entry("xl/workbook.xml")
    raise ArgumentError, "workbook.xml not found in file." unless wb_entry
    wb_xml = wb_entry.get_input_stream.read.force_encoding("UTF-8")

    sheet_tag = wb_xml.scan(/<sheet\s[^>]*>/).find do |tag|
      name = tag[/name="([^"]*)"/, 1]
      next false unless name
      clean = unescape(name).strip
      clean.start_with?(DETAIL_SHEET_PREFIX) && !clean.end_with?("(2)")
    end

    unless sheet_tag
      raise ArgumentError,
        "Sheet detail '#{DETAIL_SHEET_PREFIX} ...' tidak ditemukan. " \
        "Pastikan file yang diupload adalah export 'Detail SL' yang benar."
    end

    r_id = sheet_tag.match(/r:id="([^"]+)"/)&.captures&.first
    raise ArgumentError, "r:id missing for detail sheet." unless r_id

    rels_entry = zip.find_entry("xl/_rels/workbook.xml.rels")
    raise ArgumentError, "workbook.xml.rels not found in file." unless rels_entry
    rels_xml = rels_entry.get_input_stream.read.force_encoding("UTF-8")

    rel_tag = rels_xml.match(/<Relationship[^>]*Id="#{Regexp.escape(r_id)}"[^>]*>/)
    raise ArgumentError, "Relationship #{r_id} not found in rels." unless rel_tag

    target = rel_tag[0].match(/Target="([^"]+)"/)&.captures&.first
    raise ArgumentError, "Target missing for relationship #{r_id}." unless target

    target.start_with?("../") ? target[3..] : "xl/#{target}"
  end
  private_class_method :resolve_sheet_path

  # Returns [letter_map, header_fragment_index] for the FIRST header-matching
  # row. The sheet repeats the header with a grand-total row between the copies,
  # plus the data may itself contain stray repeated headers/totals — all of
  # those are dropped per-row in each_batch (blank Shipping / "Shipping"), so we
  # only need the first header to establish the column→letter mapping.
  def self.find_header(rows, shared_strings)
    rows[1, 40].to_a.each_with_index do |row_part, offset|
      idx = offset + 1
      end_idx = row_part.index("</row>") || row_part.length
      content = row_part[0, end_idx]

      map = {}
      content.split("<c ").drop(1).each do |cell_xml|
        col_letter = cell_xml[/r="([A-Z]+)\d+"/, 1]
        next unless col_letter
        name = xlsx_cell_string(cell_xml, shared_strings)
        next unless name
        db_col = COLUMN_MAP[normalize(name)]
        map[col_letter] = db_col if db_col
      end

      if map.size >= HEADER_MATCH_THRESHOLD && map.value?(:shipping_point) && map.value?(:value_net)
        return [ map, idx ]
      end
    end

    [ nil, nil ]
  end
  private_class_method :find_header

  def self.load_shared_strings(zip)
    ss_entry = zip.find_entry("xl/sharedStrings.xml")
    return [] unless ss_entry
    ss_xml = ss_entry.get_input_stream.read.force_encoding("UTF-8")
    ss_xml.split("<si>").drop(1).map do |part|
      unescape(part.scan(/<t(?:[^>]*)>(.*?)<\/t>/m).map(&:first).join)
    end
  end
  private_class_method :load_shared_strings

  def self.xlsx_cell_string(cell_xml, shared_strings)
    if cell_xml.include?('t="s"')
      idx = cell_xml[/<v>(\d+)<\/v>/, 1]
      idx ? shared_strings[idx.to_i] : nil
    elsif cell_xml.include?('t="inlineStr"')
      val = cell_xml[/<t(?:[^>]*)>(.*?)<\/t>/m, 1]
      val ? unescape(val) : nil
    elsif cell_xml.include?('t="str"')
      val = cell_xml[/<v>([^<]*)<\/v>/, 1]
      val ? unescape(val) : nil
    end
  end
  private_class_method :xlsx_cell_string

  def self.xlsx_cell_value(cell_xml, shared_strings)
    if cell_xml.include?('t="inlineStr"')
      val = cell_xml[/<t(?:[^>]*)>(.*?)<\/t>/m, 1]
      val ? unescape(val) : nil
    elsif cell_xml.include?('t="s"')
      idx = cell_xml[/<v>(\d+)<\/v>/, 1]
      idx ? shared_strings[idx.to_i] : nil
    elsif cell_xml.include?('t="str"')
      val = cell_xml[/<v>([^<]*)<\/v>/, 1]
      val ? unescape(val) : nil
    else
      val = cell_xml[/<v>([^<]*)<\/v>/, 1]
      val ? unescape(val) : nil
    end
  end
  private_class_method :xlsx_cell_value

  def self.cast_value(db_col, raw)
    return nil if raw.nil?
    val = raw.to_s.strip
    return nil if val.empty?

    if DATE_COLUMNS.include?(db_col)
      parse_date(val)
    elsif NUMERIC_COLUMNS.include?(db_col)
      # Strip thousands separators / stray spaces, keep sign + decimal point.
      cleaned = val.delete(",").delete(" ")
      Float(cleaned) rescue nil
    else
      val # string identifiers — preserve leading zeros verbatim
    end
  end
  private_class_method :cast_value

  # Detail dates are DD.MM.YYYY; tolerate ISO and Excel serials as a fallback.
  def self.parse_date(val)
    if (m = val.match(/\A(\d{2})\.(\d{2})\.(\d{4})\z/))
      Date.new(m[3].to_i, m[2].to_i, m[1].to_i) rescue nil
    elsif val.match?(/\A\d{8}\z/)
      Date.strptime(val, "%Y%m%d") rescue nil
    elsif val.match?(/\A\d+(?:\.\d+)?\z/)
      Date.new(1899, 12, 30) + val.to_f.to_i
    else
      Date.parse(val) rescue nil
    end
  end
  private_class_method :parse_date

  def self.normalize(str)
    unescape(str.to_s).gsub(/\s+/, " ").strip.downcase
  end
  private_class_method :normalize

  def self.unescape(str)
    str.to_s
       .gsub("&lt;", "<")
       .gsub("&gt;", ">")
       .gsub("&quot;", '"')
       .gsub("&apos;", "'")
       .gsub("&amp;", "&")
  end
  private_class_method :unescape
end
