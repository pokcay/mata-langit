# frozen_string_literal: true

# Parses KA Profitability .xlsx files from the "Detail" sheet.
#
# Sheet layout (wide format):
#   - First ~10 rows: header area containing the fiscal year string (e.g. "2026-2027")
#   - One row with column headers: <Outlet Group> | <Level> | <Description> | APR MTD | APR YTD | MAY MTD | ...
#   - Data rows: one per (outlet_group, level, description) combination.
#     Each period column holds a decimal value or is empty (→ NULL).
#
# Public API:
#   KaProfitabilityFileParser.detect(file_path, original_filename)
#     => { fiscal_year:, outlet_count:, row_count: }
#
#   KaProfitabilityFileParser.each_batch(file_path, original_filename,
#                                         upload_id:, fiscal_year:,
#                                         batch_size: 500) { |batch| }
#     Yields Arrays of attribute hashes ready for KaProfitabilityRecord.insert_all!
class KaProfitabilityFileParser
  ADVISORY_LOCK_KEY = 0x6B617072_6F666974 # "kaprofit"

  FISCAL_YEAR_PATTERN = /\b(\d{4}-\d{4})\b/.freeze
  PERIOD_MONTHS       = %w[APR MAY JUN JUL AUG SEP OCT NOV DEC JAN FEB MAR].freeze
  PERIOD_TYPES        = %w[MTD YTD].freeze

  # Returns { fiscal_year:, outlet_count:, row_count: } or raises ArgumentError.
  def self.detect(file_path, original_filename)
    require "zip"

    Zip::File.open(file_path) do |zip|
      sheet_path = find_detail_sheet_path(zip) ||
        raise(ArgumentError, "Sheet 'Detail' tidak ditemukan dalam \"#{original_filename}\".")

      shared_strings = load_shared_strings(zip)
      fiscal_year, col_map, data_rows = parse_sheet_xml(zip, sheet_path, shared_strings, original_filename)

      outlet_groups = data_rows.map { |r| r[:outlet_group] }.uniq.compact
      {
        fiscal_year:  fiscal_year,
        outlet_count: outlet_groups.size,
        row_count:    data_rows.size * col_map.size
      }
    end
  end

  # Yields batches of attribute hashes ready for KaProfitabilityRecord.insert_all!
  def self.each_batch(file_path, original_filename, upload_id:, fiscal_year:, batch_size: 500)
    require "zip"

    Zip::File.open(file_path) do |zip|
      sheet_path = find_detail_sheet_path(zip) ||
        raise(ArgumentError, "Sheet 'Detail' tidak ditemukan dalam \"#{original_filename}\".")

      shared_strings = load_shared_strings(zip)
      _fy, col_map, data_rows = parse_sheet_xml(zip, sheet_path, shared_strings, original_filename)

      batch = []
      data_rows.each do |row|
        col_map.each do |col_idx, (period_month, period_type)|
          batch << {
            ka_profitability_upload_id: upload_id,
            outlet_group: row[:outlet_group],
            level:        row[:level],
            description:  row[:description],
            period_type:  period_type,
            period_month: period_month,
            fiscal_year:  fiscal_year,
            value:        row[:values][col_idx]
          }
          if batch.size >= batch_size
            yield batch
            batch = []
          end
        end
      end
      yield batch unless batch.empty?
    end
  end

  # ---------------------------------------------------------------------------
  private_class_method def self.find_detail_sheet_path(zip)
    wb_entry = zip.find_entry("xl/workbook.xml")
    return nil unless wb_entry

    wb_xml = wb_entry.get_input_stream.read.force_encoding("UTF-8")
    sheet_node = wb_xml.match(/<sheet\b[^>]*\bname="Detail"[^>]*>/)
    return nil unless sheet_node

    rid_match = sheet_node[0].match(/\br:id="([^"]+)"/)
    return nil unless rid_match
    rid = rid_match[1]

    rels_entry = zip.find_entry("xl/_rels/workbook.xml.rels")
    return nil unless rels_entry

    rels_xml = rels_entry.get_input_stream.read.force_encoding("UTF-8")
    rels_xml.split(/<Relationship\b/).each do |part|
      next unless part.include?("Id=\"#{rid}\"")
      target_match = part.match(/\bTarget="([^"]+)"/)
      next unless target_match
      target = target_match[1].delete_prefix("../").delete_prefix("/")
      target = "xl/#{target}" unless target.start_with?("xl/")
      return target
    end
    nil
  end

  private_class_method def self.load_shared_strings(zip)
    ss_entry = zip.find_entry("xl/sharedStrings.xml")
    return [] unless ss_entry

    ss_xml = ss_entry.get_input_stream.read.force_encoding("UTF-8")
    ss_xml.split("<si>").drop(1).map do |part|
      part.scan(/<t(?:[^>]*)>(.*?)<\/t>/m).map { |m| m[0] }.join
    end
  end

  # Returns [fiscal_year, col_map, data_rows]
  # col_map: { col_idx(int) => [period_month, period_type] }
  # data_rows: Array of { outlet_group:, level:, description:, values: { col_idx => decimal_or_nil } }
  #
  # Sheet uses a 2-row header:
  #   Row 1 (type row):  "MTD 2026-2027", "MTD-May", "MTD-Jun", … | "YTD 2026-2027", "YTD-May", …
  #   Row 2 (month row): "APR", "MAY", "JUN", …                   | "APR", "MAY", …
  #   Row 3+: data rows
  private_class_method def self.parse_sheet_xml(zip, sheet_path, shared_strings, original_filename)
    entry = zip.find_entry(sheet_path)
    raise ArgumentError, "Worksheet '#{sheet_path}' tidak ditemukan dalam \"#{original_filename}\"." unless entry

    ws_xml = entry.get_input_stream.read.force_encoding("UTF-8")

    fiscal_year  = nil
    type_row_idx = nil   # row index of the MTD/YTD type header row
    col_type_map = {}    # col_idx => "MTD" | "YTD"
    col_map      = {}    # col_idx => [period_month, period_type]
    data_rows    = []

    ws_xml.split(/<row\b/).drop(1).each_with_index do |row_xml, row_idx|
      cells = parse_cells(row_xml, shared_strings)

      # Scan first 10 rows for fiscal year pattern
      if row_idx < 10 && fiscal_year.nil?
        cells.each_value do |val|
          m = val.to_s.match(FISCAL_YEAR_PATTERN)
          if m
            fiscal_year = m[1]
            break
          end
        end
      end

      # Detect type row: cells that start with "MTD" or "YTD"
      if type_row_idx.nil?
        type_cells = cells.select { |_, v| v.to_s.strip.upcase.start_with?("MTD", "YTD") }
        unless type_cells.empty?
          type_row_idx = row_idx
          type_cells.each do |ci, val|
            col_type_map[ci] = val.to_s.strip.upcase.start_with?("MTD") ? "MTD" : "YTD"
          end
          next
        end
      end

      # Detect month row: immediately after the type row, cells contain PERIOD_MONTHS
      if type_row_idx && col_map.empty? && row_idx == type_row_idx + 1
        cells.each do |ci, val|
          month = val.to_s.strip.upcase
          if PERIOD_MONTHS.include?(month) && col_type_map[ci]
            col_map[ci] = [month, col_type_map[ci]]
          end
        end
        next
      end

      # Data rows start after the month row
      next unless col_map.any? && row_idx > type_row_idx + 1

      # Skip rows with nothing in identifier columns and no period values
      next unless cells[0] || cells[1] || cells[2] || col_map.keys.any? { |ci| cells[ci] }

      outlet_group = cells[0].to_s.strip.presence
      level        = cells[1].to_s.strip.presence
      description  = cells[2].to_s.strip.presence
      next if outlet_group.nil? && description.nil?

      values = col_map.keys.index_with { |ci| parse_decimal(cells[ci]) }

      data_rows << {
        outlet_group: outlet_group,
        level:        level,
        description:  description.to_s,
        values:       values
      }
    end

    raise ArgumentError, "Fiscal year tidak ditemukan dalam file \"#{original_filename}\"." unless fiscal_year
    raise ArgumentError, "Header periode (MTD/YTD) tidak ditemukan dalam \"#{original_filename}\"." if col_map.empty?

    [ fiscal_year, col_map, data_rows ]
  end

  private_class_method def self.parse_cells(row_xml, shared_strings)
    cells = {}
    row_xml.split(/<c\b/).drop(1).each do |cell_xml|
      ref = cell_xml.match(/\br="([A-Z]+)\d+"/)
      next unless ref
      col_idx = col_letter_to_index(ref[1])
      val     = cell_string_value(cell_xml, shared_strings)
      cells[col_idx] = val if val
    end
    cells
  end

  private_class_method def self.col_letter_to_index(letters)
    letters.upcase.chars.reduce(0) { |acc, c| acc * 26 + (c.ord - "A".ord + 1) } - 1
  end

  private_class_method def self.cell_string_value(cell_xml, shared_strings)
    if cell_xml.include?('t="s"')
      m = cell_xml.match(/<v>(\d+)<\/v>/)
      m ? shared_strings[m[1].to_i] : nil
    elsif cell_xml.include?('t="inlineStr"')
      cell_xml.scan(/<t(?:[^>]*)>(.*?)<\/t>/m).map { |m| m[0] }.join.presence
    elsif cell_xml.include?('t="str"')
      m = cell_xml.match(/<v>([^<]*)<\/v>/)
      m ? m[1].presence : nil
    else
      m = cell_xml.match(/<v>([^<]*)<\/v>/)
      m ? m[1].presence : nil
    end
  end

  private_class_method def self.parse_decimal(raw)
    return nil if raw.nil? || raw.to_s.strip.empty?
    BigDecimal(raw.to_s.gsub(",", "."), 10)
  rescue ArgumentError, TypeError
    nil
  end
end
