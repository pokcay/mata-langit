# frozen_string_literal: true

# Parses a Source-of-Truth (SoT) .xlsx file for the Data Integrity feature.
#
# Expected column headers (exact, case-sensitive): Region, Year, Month, Netto_Wise
# Returns a ParseResult struct containing validated rows plus a list of malformed rows.
class IntegritySotParser
  REQUIRED_COLUMNS = %w[Region Year Month Netto_Wise].freeze

  MalformedRow = Struct.new(:row_number, :reason)

  ParseResult = Struct.new(
    :rows,              # Array of { region:, year:, month:, netto_wise: BigDecimal }
    :malformed_rows,    # Array of MalformedRow
    :total_rows_in_file,
    :period_min_year,
    :period_min_month,
    :period_max_year,
    :period_max_month,
    :distinct_regions
  )

  def self.parse(file_path)
    require "zip"

    letter_map  = {}
    rows        = []
    malformed   = []
    row_index   = 0

    Zip::File.open(file_path) do |zip|
      shared_strings = build_shared_strings(zip)

      ws_entry = zip.find_entry("xl/worksheets/sheet1.xml") ||
                 zip.select { |e| e.name.match?(%r{xl/worksheets/sheet\d+\.xml}) }.min_by(&:name)
      raise ArgumentError, "No worksheet found in SoT file" unless ws_entry

      ws_xml    = ws_entry.get_input_stream.read.force_encoding("UTF-8")
      row_parts = ws_xml.split("<row ")

      letter_map = build_letter_map(row_parts, shared_strings)

      missing = REQUIRED_COLUMNS - letter_map.values
      if missing.any?
        raise ArgumentError, "SoT file missing required columns: #{missing.join(', ')}"
      end

      col_for = letter_map.invert

      row_parts.drop(2).each do |row_part|
        end_idx     = row_part.index("</row>") || row_part.length
        row_content = row_part[0, end_idx]
        next unless row_content.include?("<v>") || row_content.include?("<is>")

        row_index += 1
        data = extract_row_data(row_content, letter_map, shared_strings)
        errors = validate_row(data)

        if errors.any?
          malformed << MalformedRow.new(row_index + 1, errors.join("; "))
        else
          # Normalize human-readable region labels (e.g. "Jakarta 1") to the DB
          # codes used by TimeseriesTransaction ("Jkt1"). Unknown labels pass
          # through unchanged — they'll show as "Missing in DB" downstream.
          raw_region = data["Region"].to_s.strip
          rows << {
            region:     TimeseriesFileParser::REGION_NAME_MAP[raw_region] || raw_region,
            year:       data["Year"].to_s.strip.to_i,
            month:      data["Month"].to_s.strip.to_i,
            netto_wise: BigDecimal(data["Netto_Wise"].to_s.strip)
          }
        end
      end
    end

    periods          = rows.map { |r| [r[:year], r[:month]] }.sort
    distinct_regions = rows.map { |r| r[:region] }.uniq.sort

    ParseResult.new(
      rows,
      malformed,
      rows.size + malformed.size,
      periods.first&.first, periods.first&.last,
      periods.last&.first,  periods.last&.last,
      distinct_regions
    )
  end

  # -------------------------------------------------------------------------
  # Private helpers
  # -------------------------------------------------------------------------

  def self.build_shared_strings(zip)
    ss_entry = zip.find_entry("xl/sharedStrings.xml")
    return [] unless ss_entry
    ss_xml = ss_entry.get_input_stream.read.force_encoding("UTF-8")
    ss_xml.split("<si>").drop(1).map do |part|
      part.scan(/<t(?:[^>]*)>(.*?)<\/t>/m).map(&:first).join
    end
  end
  private_class_method :build_shared_strings

  def self.build_letter_map(row_parts, shared_strings)
    map = {}
    return map if row_parts.size < 2
    end_idx = row_parts[1].index("</row>") || row_parts[1].length
    row_parts[1][0, end_idx].split("<c ").drop(1).each do |cell_xml|
      col_letter = cell_xml[/r="([A-Z]+)\d+"/, 1]
      next unless col_letter
      col_name = xlsx_cell_string(cell_xml, shared_strings)
      next unless col_name
      col_name = col_name.strip
      map[col_letter] = col_name if REQUIRED_COLUMNS.include?(col_name)
    end
    map
  end
  private_class_method :build_letter_map

  def self.extract_row_data(row_content, letter_map, shared_strings)
    data = {}
    row_content.split("<c ").drop(1).each do |cell_xml|
      col_letter = cell_xml[/r="([A-Z]+)\d+"/, 1]
      next unless col_letter
      col_name = letter_map[col_letter]
      next unless col_name
      data[col_name] = xlsx_cell_value(cell_xml, shared_strings)
    end
    data
  end
  private_class_method :extract_row_data

  def self.validate_row(data)
    errors = []
    region = data["Region"].to_s.strip
    errors << "Region kosong" if region.empty?

    year = data["Year"].to_s.strip.to_i
    errors << "Year tidak valid (#{data['Year'].inspect})" unless year > 1900

    month = data["Month"].to_s.strip.to_i
    errors << "Month tidak valid (#{data['Month'].inspect})" unless (1..12).cover?(month)

    netto = data["Netto_Wise"].to_s.strip
    unless netto.match?(/\A[+-]?[\d]+(?:\.[\d]+)?(?:[Ee][+-]?[\d]+)?\z/)
      errors << "Netto_Wise bukan angka (#{data['Netto_Wise'].inspect})"
    end

    errors
  end
  private_class_method :validate_row

  def self.xlsx_cell_string(cell_xml, shared_strings)
    if cell_xml.include?('t="s"')
      idx = cell_xml[/<v>(\d+)<\/v>/, 1]
      idx ? shared_strings[idx.to_i] : nil
    elsif cell_xml.include?('t="inlineStr"')
      cell_xml[/<t(?:[^>]*)>(.*?)<\/t>/m, 1]
    elsif cell_xml.include?('t="str"')
      cell_xml[/<v>([^<]*)<\/v>/, 1]
    end
  end
  private_class_method :xlsx_cell_string

  def self.xlsx_cell_value(cell_xml, shared_strings)
    if cell_xml.include?('t="inlineStr"')
      cell_xml[/<t(?:[^>]*)>(.*?)<\/t>/m, 1]
    elsif cell_xml.include?('t="s"')
      idx = cell_xml[/<v>(\d+)<\/v>/, 1]
      idx ? shared_strings[idx.to_i] : nil
    elsif cell_xml.include?('t="str"')
      cell_xml[/<v>([^<]*)<\/v>/, 1]
    else
      cell_xml[/<v>([^<]*)<\/v>/, 1]
    end
  end
  private_class_method :xlsx_cell_value
end
