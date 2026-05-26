# frozen_string_literal: true

# Detects and parses Excel (.xlsx) Market Share B2B files from multiple retail accounts.
#
# Supported templates (detection order):
#   1. IDG  — sheet "MarketShareMOCY", wide format (months as columns)
#   2. IDM Reguler — sheets MF/FF/FH/KIDS SC/KIDS SP present
#   3. IDM Skincare — sheet SC (or Sheet1) present (no Reguler sheets)
#   4. SAT  — sheet "Worksheet", row 1 = "PT SUMBER ALFARIA TRIJAYA..."
#   5. MIDI — sheet "Worksheet", row 3 = "PT MIDI UTAMA INDONESIA..."
#
# All market_share_pct / market_share_ly_pct values are normalised to the 0-100
# percentage scale: IDG/IDM raw decimal fractions are multiplied ×100; SAT/MIDI
# values are already in percentage notation and stored as-is.
class MarketShareB2bFileParser
  ADVISORY_LOCK_KEY = 0x6D73625F62326200 # "msb_b2b."

  ACCOUNT_NAMES = {
    "IDG"  => "Indogrosir",
    "IDM"  => "Indomaret",
    "MIDI" => "PT MIDI UTAMA INDONESIA Tbk",
    "SAT"  => "PT SUMBER ALFARIA TRIJAYA Tbk",
  }.freeze

  IDM_REGULER_SHEETS = %w[MF FF FH].freeze
  IDM_KIDS_SHEETS    = ["KIDS SC", "KIDS SP"].freeze
  IDM_ALL_SHEETS     = (IDM_REGULER_SHEETS + IDM_KIDS_SHEETS).freeze
  IDM_SC_SHEETS      = %w[SC Sheet1].freeze

  MONTH_ABBR = %w[JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC].freeze
  MONTH_ID   = {
    "Januari" => 1, "Februari" => 2, "Maret" => 3, "April" => 4,
    "Mei" => 5, "Juni" => 6, "Juli" => 7, "Agustus" => 8,
    "September" => 9, "Oktober" => 10, "November" => 11, "Desember" => 12,
  }.freeze

  # -------------------------------------------------------------------------
  # Public API
  # -------------------------------------------------------------------------

  # Returns a detection result hash or raises ArgumentError for unknown templates.
  #
  # Result keys: account_code, account_name, report_type, template_version,
  #              period_year_from, period_month_from, period_year_to, period_month_to
  def self.detect(file_path, original_filename)
    require "zip"

    Zip::File.open(file_path) do |zip|
      sheet_names = workbook_sheet_names(zip)

      if sheet_names.include?("MarketShareMOCY")
        detect_idg(zip, sheet_names, original_filename)
      elsif (IDM_ALL_SHEETS & sheet_names).any?
        detect_idm_reguler(original_filename)
      elsif (IDM_SC_SHEETS & sheet_names).any?
        detect_idm_skincare(original_filename)
      elsif sheet_names.include?("Worksheet")
        detect_worksheet(zip, sheet_names, original_filename)
      else
        raise ArgumentError,
          "Template tidak dikenal dalam file \"#{original_filename}\". " \
          "Sheet yang ditemukan: #{sheet_names.join(', ')}."
      end
    end
  end

  # Yields batches of hashes ready for MarketShareB2bRecord.insert_all.
  def self.each_batch(file_path, original_filename, upload_id:,
                      account_code:, account_name:, report_type:,
                      period_year_from:, period_month_from:,
                      period_year_to:, period_month_to:,
                      batch_size: 500, &block)
    require "zip"

    base = {
      market_share_b2b_upload_id: upload_id,
      account_code:               account_code,
      account_name:               account_name,
      report_type:                report_type,
    }

    Zip::File.open(file_path) do |zip|
      shared_strings = load_shared_strings(zip)
      sheet_names    = workbook_sheet_names(zip)

      case account_code
      when "IDG"
        each_batch_idg(zip, sheet_names, shared_strings, base,
                       period_year_from, period_year_to,
                       batch_size, &block)
      when "IDM"
        sheets = report_type == "skincare" ? IDM_SC_SHEETS : IDM_ALL_SHEETS
        active = sheets & sheet_names
        each_batch_idm(zip, active, shared_strings, base,
                       period_year_from, period_month_from,
                       batch_size, &block)
      when "MIDI", "SAT"
        each_batch_tall(zip, "Worksheet", shared_strings, base,
                        period_year_from, period_month_from,
                        batch_size, &block)
      end
    end
  end

  # -------------------------------------------------------------------------
  # Detection helpers
  # -------------------------------------------------------------------------

  def self.detect_idg(zip, _sheet_names, filename)
    report_type = filename_report_type(filename) || "reguler"
    year_from, month_from, year_to, month_to = idg_period_from_filename(filename)

    {
      account_code:      "IDG",
      account_name:      ACCOUNT_NAMES["IDG"],
      report_type:       report_type,
      template_version:  "idg_reguler_v1",
      period_year_from:  year_from,
      period_month_from: month_from,
      period_year_to:    year_to,
      period_month_to:   month_to,
    }
  end
  private_class_method :detect_idg

  def self.detect_idm_reguler(filename)
    period = filename_single_period(filename)
    {
      account_code:      "IDM",
      account_name:      ACCOUNT_NAMES["IDM"],
      report_type:       "reguler",
      template_version:  "idm_reguler_v1",
      period_year_from:  period[:year],
      period_month_from: period[:month],
      period_year_to:    period[:year],
      period_month_to:   period[:month],
    }
  end
  private_class_method :detect_idm_reguler

  def self.detect_idm_skincare(filename)
    period = filename_single_period(filename)
    {
      account_code:      "IDM",
      account_name:      ACCOUNT_NAMES["IDM"],
      report_type:       "skincare",
      template_version:  "idm_skincare_v1",
      period_year_from:  period[:year],
      period_month_from: period[:month],
      period_year_to:    period[:year],
      period_month_to:   period[:month],
    }
  end
  private_class_method :detect_idm_skincare

  def self.detect_worksheet(zip, _sheet_names, filename)
    shared_strings = load_shared_strings(zip)
    ws_path        = resolve_sheet_path(zip, "Worksheet")
    ws_xml         = zip.find_entry(ws_path).get_input_stream.read.force_encoding("UTF-8")
    rows           = ws_xml.split("<row ")

    a1 = cell_value_for_column(rows[1], "A", shared_strings).to_s
    a3 = rows.size > 3 ? cell_value_for_column(rows[3], "A", shared_strings).to_s : ""

    period       = filename_single_period(filename)
    report_type  = filename_report_type(filename) || "reguler"

    if a1.start_with?("PT SUMBER ALFARIA TRIJAYA")
      {
        account_code:      "SAT",
        account_name:      a1.strip,
        report_type:       report_type,
        template_version:  "sat_v1",
        period_year_from:  period[:year],
        period_month_from: period[:month],
        period_year_to:    period[:year],
        period_month_to:   period[:month],
      }
    elsif a3.start_with?("PT MIDI UTAMA INDONESIA")
      {
        account_code:      "MIDI",
        account_name:      a3.strip,
        report_type:       report_type,
        template_version:  "midi_v1",
        period_year_from:  period[:year],
        period_month_from: period[:month],
        period_year_to:    period[:year],
        period_month_to:   period[:month],
      }
    else
      raise ArgumentError,
        "Sheet \"Worksheet\" ditemukan tapi tidak cocok dengan template SAT atau MIDI " \
        "dalam file \"#{filename}\"."
    end
  end
  private_class_method :detect_worksheet

  # -------------------------------------------------------------------------
  # Batch parsers — IDG (wide format)
  # -------------------------------------------------------------------------

  def self.each_batch_idg(zip, sheet_names, shared_strings, base,
                          period_year_from, _period_year_to, batch_size)
    ws_path = resolve_sheet_path(zip, "MarketShareMOCY")
    ws_xml  = zip.find_entry(ws_path).get_input_stream.read.force_encoding("UTF-8")
    rows    = ws_xml.split("<row ")

    # Row 4 (index 4): year/month column headers ("JAN-26", "FEB-26", ...)
    # Row 5 (index 5): sub-headers ("CATEGORY", "No.", "BRAND", "Ttl", "Market", ...)
    # Data rows: index 6+

    month_col_map = build_idg_month_col_map(rows[4], shared_strings)
    return if month_col_map.empty?

    current_category = nil
    batch = []

    rows.drop(6).each do |row_part|
      end_idx  = row_part.index("</row>") || row_part.length
      row_xml  = row_part[0, end_idx]
      next unless row_xml.include?("<v>") || row_xml.include?("<is>")

      # Column A: category label when non-empty; Column C: brand
      col_a = cell_value_for_column(row_xml, "A", shared_strings).to_s.strip
      col_c = cell_value_for_column(row_xml, "C", shared_strings).to_s.strip

      if col_a.present? && col_a != "0"
        current_category = col_a
        next
      end

      next if col_c.blank?

      month_col_map.each do |month_info, (ttl_col, market_col)|
        market_raw = numeric_cell_value(row_xml, market_col)
        next if market_raw.nil?

        ttl_raw = numeric_cell_value(row_xml, ttl_col)

        batch << base.merge(
          period_year:         month_info[:year],
          period_month:        month_info[:month],
          category:            current_category,
          brand:               col_c,
          product_name:        nil,
          dc_name:             nil,
          total_plu:           ttl_raw&.to_i,
          ranking:             nil,
          market_share_pct:    (market_raw * 100).round(4),
          market_share_ly_pct: nil,
          growth_pct:          nil,
        )

        if batch.size >= batch_size
          yield batch
          batch = []
        end
      end
    end

    yield batch unless batch.empty?
  end
  private_class_method :each_batch_idg

  # Returns { {year:, month:} => [ttl_col_letter, market_col_letter], ... }
  # Only includes columns with MMM-YY header format (e.g. "JAN-26").
  def self.build_idg_month_col_map(row4_part, shared_strings)
    return {} if row4_part.nil?

    end_idx = row4_part.index("</row>") || row4_part.length
    row_xml = row4_part[0, end_idx]
    map     = {}

    row_xml.split("<c ").drop(1).each do |cell_xml|
      col_letter = cell_xml[/r="([A-Z]+)\d+"/, 1]
      next unless col_letter

      val = xlsx_cell_string(cell_xml, shared_strings).to_s.strip
      next unless val.match?(/\A[A-Z]{3}-\d{2}\z/)

      month_num = MONTH_ABBR.index(val[0, 3]) + 1
      year      = 2000 + val[4, 2].to_i
      ttl_col   = col_letter
      # Market% column is the next letter after Ttl column
      market_col = next_column_letter(col_letter)
      map[{ year: year, month: month_num }] = [ttl_col, market_col]
    end

    map
  end
  private_class_method :build_idg_month_col_map

  # -------------------------------------------------------------------------
  # Batch parsers — IDM (product-level, multi-sheet)
  # -------------------------------------------------------------------------

  # Column layout (IDM format, 0-based on headers in row 3):
  #   A: Product (product_name)
  #   B: Brand (brand) — hidden in Excel but has data
  #   C: Principal — skip
  #   D: Rank National (ranking; "-" stored as nil)
  #   E: Total Product National (total_plu)
  #   F: Market Share TY → ×100 → market_share_pct
  #   G: Market Share LY → ×100 → market_share_ly_pct
  #   H: % of Share Change — skip
  #   I: Growth Value (growth_pct, stored raw)

  def self.each_batch_idm(zip, active_sheets, shared_strings, base,
                          period_year, period_month, batch_size)
    batch = []

    active_sheets.each do |sheet_name|
      ws_path = resolve_sheet_path(zip, sheet_name)
      ws_xml  = zip.find_entry(ws_path).get_input_stream.read.force_encoding("UTF-8")
      rows    = ws_xml.split("<row ")

      # Row 1 (index 1): "Applied filters..." → extract cat_nm
      category = extract_idm_category(rows[1], shared_strings)

      # Row 3 (index 3): column headers — validated but not needed for fixed column layout
      # Data rows: index 4+

      rows.drop(4).each do |row_part|
        end_idx = row_part.index("</row>") || row_part.length
        row_xml = row_part[0, end_idx]
        next unless row_xml.include?("<v>") || row_xml.include?("<is>")

        product_name = xlsx_cell_string(
          find_cell_xml(row_xml, "A"), shared_strings
        )&.strip
        brand = xlsx_cell_string(
          find_cell_xml(row_xml, "B"), shared_strings
        )&.strip
        next if brand.blank? && product_name.blank?

        rank_str = xlsx_cell_string(find_cell_xml(row_xml, "D"), shared_strings)&.strip
        rank_num = numeric_cell_value(row_xml, "D")
        ranking  = if rank_num
                     rank_num.to_i
                   elsif rank_str && rank_str != "-"
                     rank_str.to_i
                   end

        total_plu   = numeric_cell_value(row_xml, "E")&.round
        ms_ty_raw   = numeric_cell_value(row_xml, "F")
        ms_ly_raw   = numeric_cell_value(row_xml, "G")
        growth_raw  = numeric_cell_value(row_xml, "I")

        batch << base.merge(
          period_year:         period_year,
          period_month:        period_month,
          category:            category,
          brand:               brand.presence,
          product_name:        product_name.presence,
          dc_name:             nil,
          total_plu:           total_plu,
          ranking:             ranking,
          market_share_pct:    ms_ty_raw  ? (ms_ty_raw  * 100).round(4) : nil,
          market_share_ly_pct: ms_ly_raw  ? (ms_ly_raw  * 100).round(4) : nil,
          growth_pct:          growth_raw&.round(6),
        )

        if batch.size >= batch_size
          yield batch
          batch = []
        end
      end
    end

    yield batch unless batch.empty?
  end
  private_class_method :each_batch_idm

  def self.extract_idm_category(row1_part, shared_strings)
    return nil if row1_part.nil?

    end_idx  = row1_part.index("</row>") || row1_part.length
    row_xml  = row1_part[0, end_idx]
    cell_xml = find_cell_xml(row_xml, "A")
    val      = xlsx_cell_string(cell_xml, shared_strings).to_s
    match    = val.match(/cat_nm\s+is\s+(.+?)(?:\s*\n|\z)/i)
    match ? match[1].strip : nil
  end
  private_class_method :extract_idm_category

  # -------------------------------------------------------------------------
  # Batch parsers — MIDI / SAT (tall format, 9-row header)
  # -------------------------------------------------------------------------

  # Column layout (MIDI/SAT, rows 1-9 are header):
  #   A: row No. (integer) for data rows; "Category: XXX" for section headers
  #   B: Brand
  #   C: Total PLU LY (2025)
  #   D: Total PLU CY → total_plu
  #   E: Ranking LY
  #   F: Ranking CY → ranking
  #   G: Market Share % LY → market_share_ly_pct (already in % notation, e.g. 34.15)
  #   H: Market Share % CY → market_share_pct
  #   I: Growth (string with % suffix, e.g. "31.57%") → growth_pct

  def self.each_batch_tall(zip, sheet_name, shared_strings, base,
                           period_year, period_month, batch_size)
    ws_path = resolve_sheet_path(zip, sheet_name)
    ws_xml  = zip.find_entry(ws_path).get_input_stream.read.force_encoding("UTF-8")
    rows    = ws_xml.split("<row ")

    current_category = nil
    batch = []

    rows.each_with_index do |row_part, row_idx|
      next if row_idx == 0 # XML preamble before first <row

      # Determine the actual row number from the XML attribute r="N"
      row_num = row_part[/\br="(\d+)"/, 1]&.to_i || 0

      end_idx = row_part.index("</row>") || row_part.length
      row_xml = row_part[0, end_idx]

      # Column A: shared string cells are category headers;
      #           numeric cells are row numbers in data rows.
      a_str = xlsx_cell_string(find_cell_xml(row_xml, "A"), shared_strings).to_s.strip
      a_num = numeric_cell_value(row_xml, "A")

      # Track category headers (can appear in any row including row 5)
      if a_str.start_with?("Category:")
        current_category = a_str.sub(/\ACategory:\s*/i, "").strip
        next
      end

      # Data rows start at row 10
      next if row_num < 10
      next unless row_xml.include?("<v>") || row_xml.include?("<is>")

      # Data rows have A as a positive integer (the sequential row number)
      next unless a_num && a_num > 0

      brand = xlsx_cell_string(find_cell_xml(row_xml, "B"), shared_strings)&.strip
      next if brand.blank?

      total_plu_raw  = numeric_cell_value(row_xml, "D")
      ranking_raw    = numeric_cell_value(row_xml, "F")
      ms_ly_raw      = numeric_cell_value(row_xml, "G")
      ms_ty_raw      = numeric_cell_value(row_xml, "H")
      growth_str     = xlsx_cell_string(find_cell_xml(row_xml, "I"), shared_strings).to_s
      growth_raw     = growth_str.gsub(/[%\s]/, "").presence&.to_f

      batch << base.merge(
        period_year:         period_year,
        period_month:        period_month,
        category:            current_category,
        brand:               brand,
        product_name:        nil,
        dc_name:             nil,
        total_plu:           total_plu_raw&.to_i,
        ranking:             ranking_raw&.to_i,
        market_share_pct:    ms_ty_raw&.round(4),
        market_share_ly_pct: ms_ly_raw&.round(4),
        growth_pct:          growth_raw&.round(4),
      )

      if batch.size >= batch_size
        yield batch
        batch = []
      end
    end

    yield batch unless batch.empty?
  end
  private_class_method :each_batch_tall

  # -------------------------------------------------------------------------
  # Filename parsing helpers
  # -------------------------------------------------------------------------

  def self.filename_report_type(filename)
    base = File.basename(filename.to_s, ".*")
    if base.include?("Skincare") || base.include?("skincare")
      "skincare"
    elsif base.include?("Reguler") || base.include?("reguler")
      "reguler"
    end
  end
  private_class_method :filename_report_type

  # Extracts single month/year from filenames like:
  #   "01. Januari 2026 IDM (Market Share Reguler)"
  #   "04. April 2026 (Market Share Skincare)"
  def self.filename_single_period(filename)
    base  = File.basename(filename.to_s, ".*")
    match = base.match(/(#{MONTH_ID.keys.join('|')})\s+(\d{4})/i)
    unless match
      raise ArgumentError,
        "Tidak bisa mengekstrak periode dari nama file \"#{filename}\". " \
        "Format yang diharapkan mengandung nama bulan dan tahun, " \
        "misal \"Januari 2026\"."
    end

    month_name = MONTH_ID.keys.find { |k| k.casecmp(match[1]) == 0 }
    { year: match[2].to_i, month: MONTH_ID[month_name] }
  end
  private_class_method :filename_single_period

  # Extracts month range from IDG filenames like:
  #   "01. Januari - Maret 2026 IDG (Market Share Reguler)"
  # Returns [year_from, month_from, year_to, month_to].
  def self.idg_period_from_filename(filename)
    base       = File.basename(filename.to_s, ".*")
    month_pat  = MONTH_ID.keys.join("|")
    range_re   = /(?i)(#{month_pat})\s*-\s*(#{month_pat})\s+(\d{4})/
    single_re  = /(?i)(#{month_pat})\s+(\d{4})/

    if (m = base.match(range_re))
      m1 = MONTH_ID.keys.find { |k| k.casecmp(m[1]) == 0 }
      m2 = MONTH_ID.keys.find { |k| k.casecmp(m[2]) == 0 }
      y  = m[3].to_i
      return [y, MONTH_ID[m1], y, MONTH_ID[m2]]
    elsif (m = base.match(single_re))
      m1 = MONTH_ID.keys.find { |k| k.casecmp(m[1]) == 0 }
      y  = m[2].to_i
      return [y, MONTH_ID[m1], y, MONTH_ID[m1]]
    else
      raise ArgumentError,
        "Tidak bisa mengekstrak periode dari nama file IDG \"#{filename}\"."
    end
  end
  private_class_method :idg_period_from_filename

  # -------------------------------------------------------------------------
  # XLSX / ZIP helpers (shared across all parsers)
  # -------------------------------------------------------------------------

  def self.workbook_sheet_names(zip)
    wb_entry = zip.find_entry("xl/workbook.xml")
    raise ArgumentError, "workbook.xml tidak ditemukan." unless wb_entry

    wb_xml = wb_entry.get_input_stream.read.force_encoding("UTF-8")
    wb_xml.scan(/<sheet\s[^>]*name="([^"]*)"/).flatten
  end
  private_class_method :workbook_sheet_names

  def self.resolve_sheet_path(zip, sheet_name)
    wb_entry = zip.find_entry("xl/workbook.xml")
    raise ArgumentError, "workbook.xml tidak ditemukan." unless wb_entry

    wb_xml    = wb_entry.get_input_stream.read.force_encoding("UTF-8")
    escaped   = Regexp.escape(sheet_name)
    sheet_tag = wb_xml.match(/<sheet\s[^>]*name="#{escaped}"[^>]*>/)
    raise ArgumentError, "Sheet '#{sheet_name}' tidak ditemukan." unless sheet_tag

    r_id = sheet_tag[0].match(/r:id="([^"]+)"/)&.captures&.first
    raise ArgumentError, "r:id missing for sheet '#{sheet_name}'." unless r_id

    rels_entry = zip.find_entry("xl/_rels/workbook.xml.rels")
    raise ArgumentError, "workbook.xml.rels tidak ditemukan." unless rels_entry

    rels_xml = rels_entry.get_input_stream.read.force_encoding("UTF-8")
    rel_tag  = rels_xml.match(/<Relationship[^>]*Id="#{Regexp.escape(r_id)}"[^>]*>/)
    raise ArgumentError, "Relationship #{r_id} tidak ditemukan." unless rel_tag

    target = rel_tag[0].match(/Target="([^"]+)"/)&.captures&.first
    raise ArgumentError, "Target missing for relationship #{r_id}." unless target

    target.start_with?("../") ? target[3..] : "xl/#{target}"
  end
  private_class_method :resolve_sheet_path

  def self.load_shared_strings(zip)
    ss_entry = zip.find_entry("xl/sharedStrings.xml")
    return [] unless ss_entry

    ss_xml = ss_entry.get_input_stream.read.force_encoding("UTF-8")
    ss_xml.split("<si>").drop(1).map do |part|
      part.scan(/<t(?:[^>]*)>(.*?)<\/t>/m).map(&:first).join
    end
  end
  private_class_method :load_shared_strings

  # Returns the string value of cell at col_letter in the row XML snippet.
  def self.cell_value_for_column(row_part, col_letter, shared_strings)
    return nil if row_part.nil?

    end_idx = row_part.index("</row>") || row_part.length
    row_xml = row_part[0, end_idx]
    cell_xml = find_cell_xml(row_xml, col_letter)
    xlsx_cell_string(cell_xml, shared_strings)
  end
  private_class_method :cell_value_for_column

  # Returns the raw XML snippet for a specific column letter in a row's XML.
  def self.find_cell_xml(row_xml, col_letter)
    # Match <c r="A1"... through </c> or next <c
    pattern = /(<c\s+[^>]*r="#{Regexp.escape(col_letter)}\d+"[^>]*>.*?<\/c>)/m
    row_xml.match(pattern)&.captures&.first ||
      row_xml.split("<c ").drop(1).find { |c|
        c.match?(/r="#{Regexp.escape(col_letter)}\d+"/)
      }&.then { |c| "<c #{c}" }
  end
  private_class_method :find_cell_xml

  def self.xlsx_cell_string(cell_xml, shared_strings)
    return nil if cell_xml.nil?

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

  # Returns the numeric value of a cell, or nil for blank / string cells.
  def self.numeric_cell_value(row_xml, col_letter)
    cell_xml = find_cell_xml(row_xml, col_letter)
    return nil if cell_xml.nil?
    return nil if cell_xml.include?('t="s"') || cell_xml.include?('t="str"') ||
                  cell_xml.include?('t="inlineStr"')

    raw = cell_xml[/<v>([^<]*)<\/v>/, 1]
    return nil if raw.nil? || raw.strip.empty?

    raw.to_f
  end
  private_class_method :numeric_cell_value

  # Advances a column letter to the next one: "A" → "B", "Z" → "AA", "AE" → "AF".
  def self.next_column_letter(col)
    letters = col.chars
    i = letters.size - 1
    loop do
      if letters[i] < "Z"
        letters[i] = (letters[i].ord + 1).chr
        break
      else
        letters[i] = "A"
        i -= 1
        if i < 0
          letters.unshift("A")
          break
        end
      end
    end
    letters.join
  end
  private_class_method :next_column_letter
end
