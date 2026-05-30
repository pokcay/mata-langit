# frozen_string_literal: true

# Parses the monthly "Listing Cost {Year} - {Month}" file (the nationwide
# snapshot of the listing/slotting fees paid to outlets) into DB-ready hashes
# for MasterListingCost.
#
# The workbook contains a single sheet named "Listing Cost":
#   row 1  merged title cell A1 — e.g. "MAY - 2026"  ({MONTH NAME} - {YYYY})  ← period source
#   row 2  header:  NO | REGION | AREA | DIST PARENT | DIST CHILD | OUTLET CODE | OUTLET NAME | COST
#   row 3+ data
#
# Period (year + month) is read from the in-file A1 title cell, never from the
# filename. The "NO" column (A) is a row index and is not stored. Unlike Master
# Rental, there is no RENTAL (fixture) column — OUTLET NAME goes straight to COST.
class MasterListingFileParser
  SHEET_NAME = "Listing Cost"

  # Header label (normalized, see #normalize) => DB column. Column A ("NO") is
  # intentionally omitted — it is a row index and is not stored.
  COLUMN_MAP = {
    "region"      => :region,
    "area"        => :area,
    "dist parent" => :dist_parent,
    "dist child"  => :dist_child,
    "outlet code" => :outlet_code,
    "outlet name" => :outlet_name,
    "cost"        => :cost
  }.freeze

  INTEGER_COLUMNS = %i[cost].freeze

  # Minimum mapped columns for a row to qualify as the header row.
  HEADER_MATCH_THRESHOLD = 5

  # Month name (full + 3-letter abbreviation, upcased) => month number.
  MONTH_NAMES = {
    "JANUARY" => 1, "JAN" => 1,
    "FEBRUARY" => 2, "FEB" => 2,
    "MARCH" => 3, "MAR" => 3,
    "APRIL" => 4, "APR" => 4,
    "MAY" => 5,
    "JUNE" => 6, "JUN" => 6,
    "JULY" => 7, "JUL" => 7,
    "AUGUST" => 8, "AUG" => 8,
    "SEPTEMBER" => 9, "SEP" => 9, "SEPT" => 9,
    "OCTOBER" => 10, "OCT" => 10,
    "NOVEMBER" => 11, "NOV" => 11,
    "DECEMBER" => 12, "DEC" => 12
  }.freeze

  # -------------------------------------------------------------------------
  # Public API
  # -------------------------------------------------------------------------

  # Returns { period_year:, period_month: } read from the merged A1 title cell.
  def self.read_period(file_path)
    require "zip"
    Zip::File.open(file_path) do |zip|
      shared_strings = load_shared_strings(zip)
      ws_xml = read_sheet(zip)
      rows   = ws_xml.split("<row ")

      first_row = rows[1]
      raise period_error if first_row.nil?

      end_idx = first_row.index("</row>") || first_row.length
      content = first_row[0, end_idx]
      title   = content.split("<c ").drop(1)
        .map { |cx| xlsx_cell_value(cx, shared_strings) }
        .compact.map(&:to_s).find { |v| !v.strip.empty? }

      parse_period(title)
    end
  end

  # Yields batches of insert_all-ready hashes from the Listing Cost sheet.
  def self.each_batch(file_path, upload_id:, period_year:, period_month:, batch_size: 1000)
    require "zip"

    base_attrs = {
      master_listing_upload_id: upload_id,
      period_year:  period_year,
      period_month: period_month
    }

    Zip::File.open(file_path) do |zip|
      shared_strings = load_shared_strings(zip)
      ws_xml = read_sheet(zip)
      rows   = ws_xml.split("<row ")

      letter_map, header_idx = find_header(rows, shared_strings)
      raise ArgumentError, "Baris header Listing Cost tidak ditemukan." unless letter_map

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

        # Skip blank-region rows and any repeated "REGION" header label.
        region = row_attrs[:region]
        next if region.nil? || region.to_s.strip.empty?
        next if region.to_s.strip.casecmp?("Region")

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

  def self.parse_period(title)
    raise period_error if title.nil?
    clean = unescape(title.to_s).strip
    # Format: {MONTH NAME} - {YYYY}, e.g. "MAY - 2026".
    if (m = clean.match(/\A([A-Za-z]+)\s*[-–]\s*(\d{4})\z/))
      month = MONTH_NAMES[m[1].upcase]
      year  = m[2].to_i
      return { period_year: year, period_month: month } if month
    end
    raise period_error
  end
  private_class_method :parse_period

  def self.period_error
    ArgumentError.new(
      "Sel judul A1 (mis. \"MAY - 2026\") tidak dapat dibaca. " \
      "Pastikan file yang diupload adalah file 'Listing Cost' yang benar."
    )
  end
  private_class_method :period_error

  def self.read_sheet(zip)
    path = resolve_sheet_path(zip)
    zip.find_entry(path).get_input_stream.read.force_encoding("UTF-8")
  end
  private_class_method :read_sheet

  def self.resolve_sheet_path(zip)
    wb_entry = zip.find_entry("xl/workbook.xml")
    raise ArgumentError, "workbook.xml not found in file." unless wb_entry
    wb_xml = wb_entry.get_input_stream.read.force_encoding("UTF-8")

    sheet_tag = wb_xml.scan(/<sheet\s[^>]*>/).find do |tag|
      name = tag[/name="([^"]*)"/, 1]
      next false unless name
      unescape(name).strip.casecmp?(SHEET_NAME)
    end

    unless sheet_tag
      raise ArgumentError,
        "Sheet '#{SHEET_NAME}' tidak ditemukan. " \
        "Pastikan file yang diupload adalah file 'Listing Cost' yang benar."
    end

    r_id = sheet_tag.match(/r:id="([^"]+)"/)&.captures&.first
    raise ArgumentError, "r:id missing for Listing Cost sheet." unless r_id

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

  # Returns [letter_map, header_fragment_index] for the header row (row 2; we
  # scan the first several rows defensively).
  def self.find_header(rows, shared_strings)
    rows[1, 10].to_a.each_with_index do |row_part, offset|
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

      if map.size >= HEADER_MATCH_THRESHOLD && map.value?(:region) && map.value?(:cost)
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

    if INTEGER_COLUMNS.include?(db_col)
      # Strip thousands separators / stray spaces, keep sign + decimal point.
      cleaned = val.delete(",").delete(" ")
      (Float(cleaned).round rescue nil)
    else
      val # string fields — preserve verbatim (leading zeros on outlet codes etc.)
    end
  end
  private_class_method :cast_value

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
