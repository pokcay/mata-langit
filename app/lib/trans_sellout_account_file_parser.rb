# frozen_string_literal: true

# Parses Excel (.xlsx) Trans Sell Out Account (Distributor) files into DB-ready hashes.
#
# Filename format (actual source-system naming):
#   Report Time Series (Regular) - Distributor ({Name}, Indonesia) - {YYYY}-{MM}_{timestamp}.xlsx
#
# Examples:
#   Report Time Series (Regular) - Distributor (Indomaret DC, Indonesia) - 2025-01_2025-07-25 09_41_51.xlsx
#   Report Time Series (Regular) - Distributor (Sumber Alfaria Trijaya DC, Indonesia) - 2024-12_....xlsx
#
# Reads the "Report Time Series" sheet by name. Applies CORE_MAP + NEW_2025_MAP
# (86 columns), identical to the standard Timeseries schema for non-Ecom 2025+ files.
class TransSelloutAccountFileParser
  TARGET_SHEET = "Report Time Series"

  DISTRIBUTOR_NAME_MAP = {
    "Indomaret DC, Indonesia"              => "IDM",
    "Indogrosir DC, Indonesia"             => "IDG",
    "Midi Utama DC, Indonesia"             => "MIDI",
    "Sumber Alfaria Trijaya DC, Indonesia" => "SAT",
    "Sumber Indah Lestari DC, Indonesia"   => "SIL",
  }.freeze

  CORE_MAP = {
    "Region Name"             => :region_name,
    "Area Name"               => :area_name,
    "Area Sub Name"           => :area_sub_name,
    "Dist Parent Name"        => :dist_parent_name,
    "Dist SAP Code"           => :dist_sap_code,
    "Dist Child Name"         => :dist_child_name,
    "Type Transaction"        => :type_transaction,
    "Date Transaction"        => :date_transaction,
    "Invoice No"              => :invoice_no,
    "Outlet Dist Code"        => :outlet_dist_code,
    "Outlet Dist Name"        => :outlet_dist_name,
    "Product Dist Code"       => :product_dist_code,
    "Product Dist Name"       => :product_dist_name,
    "Qty Carton"              => :qty_carton,
    "Qty Pieces"              => :qty_pieces,
    "Qty Total(Pcs)"          => :qty_total_pcs,
    "Brutto Dist"             => :brutto_dist,
    "Disc % 1"                => :disc_pct_1,
    "Disc % 2"                => :disc_pct_2,
    "Disc % 3"                => :disc_pct_3,
    "Disc % 4"                => :disc_pct_4,
    "Disc % 5"                => :disc_pct_5,
    "Disc % 6"                => :disc_pct_6,
    "Disc % 7"                => :disc_pct_7,
    "Disc % 8"                => :disc_pct_8,
    "Disc % 9"                => :disc_pct_9,
    "Disc % 10"               => :disc_pct_10,
    "Disc Value 1"            => :disc_value_1,
    "Disc Value 2"            => :disc_value_2,
    "Disc Value 3"            => :disc_value_3,
    "Disc Value 4"            => :disc_value_4,
    "Disc Value 5"            => :disc_value_5,
    "Disc Value 6"            => :disc_value_6,
    "Disc Value 7"            => :disc_value_7,
    "Disc Value 8"            => :disc_value_8,
    "Disc Value 9"            => :disc_value_9,
    "Disc Value 10"           => :disc_value_10,
    "Disc Value Total"        => :disc_value_total,
    "Netto Dist"              => :netto_dist,
    "Netto Wise"              => :netto_wise,
    "Outlet National Group"   => :outlet_national_group,
    "Outlet National Code"    => :outlet_national_code,
    "Outlet National Name"    => :outlet_national_name,
    "Outlet National Address" => :outlet_national_address,
    "Channel Code"            => :channel_code,
    "Channel Sub Code"        => :channel_sub_code,
    "SPV Salesman Name"       => :spv_salesman_name,
    "Salesman Name"           => :salesman_name,
    "Salesman Day"            => :salesman_day,
    "Salesman Frequency"      => :salesman_frequency,
    "Salesman Week 1"         => :salesman_week_1,
    "Salesman Week 2"         => :salesman_week_2,
    "Salesman Week 3"         => :salesman_week_3,
    "Salesman Week 4"         => :salesman_week_4,
    "TL SPV Name"             => :tl_spv_name,
    "TL Name"                 => :tl_name,
    "BP Name"                 => :bp_name,
    "MD Name"                 => :md_name,
    "MD Day"                  => :md_day,
    "MD Frequency"            => :md_frequency,
    "MD Week 1"               => :md_week_1,
    "MD Week 2"               => :md_week_2,
    "MD Week 3"               => :md_week_3,
    "MD Week 4"               => :md_week_4,
    "Brand Group Name"        => :brand_group_name,
    "Brand Name"              => :brand_name,
    "Category Sub Name"       => :category_sub_name,
    "Variant Name"            => :variant_name,
    "Range Name"              => :range_name,
    "Range Variant Name"      => :range_variant_name,
    "Product Code"            => :product_code,
    "SAP Parent Code"         => :sap_parent_code,
    "Product Name"            => :product_name,
    "Content Carton / PCS"    => :content_carton_pcs,
    "Price Category"          => :price_category,
    "Price RBP"               => :price_rbp,
    "Price GT"                => :price_gt,
    "Price MT"                => :price_mt,
    "Price MBS"               => :price_mbs,
    "Price 5.5%"              => :price_5_5_pct,
    "Price GT-11%"            => :price_gt_11_pct,
    "Price Skincare"          => :price_skincare,
    "Balance Summary"         => :balance_summary,
    "Flag Program"            => :flag_program,
  }.freeze

  NEW_2025_MAP = {
    "BP Position" => :bp_position,
    "BP Type"     => :bp_type,
  }.freeze

  COLUMN_MAP = CORE_MAP.merge(NEW_2025_MAP).freeze

  # -------------------------------------------------------------------------
  # Public API
  # -------------------------------------------------------------------------

  # Returns { distributor_code:, distributor_name:, period_year:, period_month: } or raises.
  def self.parse_filename(filename)
    base  = File.basename(filename.to_s, ".*")
    match = base.match(/Distributor \((.+?)\)\s*-\s*(\d{4})-(\d{2})/)

    unless match
      raise ArgumentError,
        "Filename \"#{filename}\" tidak bisa diparse. " \
        "Format yang diharapkan: " \
        "\"Report Time Series (Regular) - Distributor ({Nama}, Indonesia) - {YYYY}-{MM}_....xlsx\"."
    end

    dist_name = match[1].strip
    year      = match[2].to_i
    month     = match[3].to_i

    code = DISTRIBUTOR_NAME_MAP[dist_name]
    unless code
      known = DISTRIBUTOR_NAME_MAP.keys.map { |k| "\"#{k}\"" }.join(", ")
      raise ArgumentError,
        "Distributor \"#{dist_name}\" tidak dikenal di filename \"#{filename}\". " \
        "Distributor yang dikenal: #{known}."
    end

    unless (1..12).cover?(month)
      raise ArgumentError, "Bulan tidak valid (#{month}) di filename \"#{filename}\"."
    end

    { distributor_code: code, distributor_name: dist_name, period_year: year, period_month: month }
  end

  # Yields batches of hashes ready for insert_all.
  # Finds the TARGET_SHEET by name via workbook.xml rels.
  def self.each_batch(file_path, filename, upload_id:, batch_size: 1000)
    require "zip"

    meta = parse_filename(filename)
    base_attrs = {
      trans_sellout_account_upload_id: upload_id,
      distributor_code: meta[:distributor_code],
      period_year:      meta[:period_year],
      period_month:     meta[:period_month],
    }

    Zip::File.open(file_path) do |zip|
      shared_strings = load_shared_strings(zip)
      ws_path = resolve_sheet_path(zip)
      ws_xml  = zip.find_entry(ws_path).get_input_stream.read.force_encoding("UTF-8")
      rows    = ws_xml.split("<row ")

      raise ArgumentError, "Sheet '#{TARGET_SHEET}' has no data rows in #{filename}." if rows.size < 3

      letter_map   = build_letter_map(rows[1], shared_strings)
      row_template = base_attrs.dup
      letter_map.each_value { |col| row_template[col] = nil }

      batch = []

      rows.drop(2).each do |row_part|
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

  def self.load_shared_strings(zip)
    ss_entry = zip.find_entry("xl/sharedStrings.xml")
    return [] unless ss_entry
    ss_xml = ss_entry.get_input_stream.read.force_encoding("UTF-8")
    ss_xml.split("<si>").drop(1).map do |part|
      part.scan(/<t(?:[^>]*)>(.*?)<\/t>/m).map(&:first).join
    end
  end
  private_class_method :load_shared_strings

  def self.resolve_sheet_path(zip)
    wb_entry = zip.find_entry("xl/workbook.xml")
    raise ArgumentError, "workbook.xml not found in file." unless wb_entry
    wb_xml = wb_entry.get_input_stream.read.force_encoding("UTF-8")

    sheet_tag = wb_xml.match(/<sheet\s[^>]*name="#{Regexp.escape(TARGET_SHEET)}"[^>]*>/)
    unless sheet_tag
      raise ArgumentError,
        "Sheet '#{TARGET_SHEET}' tidak ditemukan. " \
        "Pastikan file yang diupload adalah file Distributor Time Series yang benar."
    end

    r_id = sheet_tag[0].match(/r:id="([^"]+)"/)&.captures&.first
    raise ArgumentError, "r:id missing for sheet '#{TARGET_SHEET}'." unless r_id

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

  def self.build_letter_map(header_row_part, shared_strings)
    end_idx = header_row_part.index("</row>") || header_row_part.length
    header_content = header_row_part[0, end_idx]
    letter_map = {}
    header_content.split("<c ").drop(1).each do |cell_xml|
      col_letter = cell_xml[/r="([A-Z]+)\d+"/, 1]
      next unless col_letter
      col_name = xlsx_cell_string(cell_xml, shared_strings)
      next unless col_name
      db_col = COLUMN_MAP[col_name.strip]
      letter_map[col_letter] = db_col if db_col
    end
    letter_map
  end
  private_class_method :build_letter_map

  DATE_COLUMNS = %i[date_transaction].freeze

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

  def self.cast_value(db_col, raw)
    return nil if raw.nil? || raw.to_s.strip.empty?
    val = raw.to_s.strip

    if DATE_COLUMNS.include?(db_col)
      if val.match?(/\A[\d.]+\z/)
        Date.new(1899, 12, 30) + val.to_f.to_i
      else
        begin Date.parse(val) rescue nil end
      end
    elsif val.match?(/\A[+-]?[\d]+(?:\.[\d]+)?(?:[Ee][+-]?[\d]+)?\z/)
      val.to_f
    else
      val.presence
    end
  end
  private_class_method :cast_value
end
