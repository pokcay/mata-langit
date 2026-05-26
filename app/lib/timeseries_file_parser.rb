# frozen_string_literal: true

# Parses Excel (.xlsx) timeseries files into DB-ready hashes.
#
# Actual filename format from the source system:
#   Report Time Series (Regular) - Region ({RegionName}) - {YYYY}-{MM}_{timestamp}.xlsx
#
# Examples:
#   Report Time Series (Regular) - Region (Jakarta 1) - 2018-04_2025-07-25 09_41_51.xlsx
#   Report Time Series (Regular) - Region (Wipro Unza Indonesia ECOM) - 2025-03_...xlsx
#
# Supports 4 schema variants:
#   standard_pre2025  – non-Ecom, year ≤ 2024 (84 columns)
#   standard_2025     – non-Ecom, year ≥ 2025  (88 columns)
#   ecom_pre2025      – Ecom,     year ≤ 2024  (91 columns)
#   ecom_2025         – Ecom,     year ≥ 2025  (93 columns)
class TimeseriesFileParser
  KNOWN_REGIONS = %w[Jkt1 RegBar RegCen RegTim Ecom].freeze

  # Maps the region label inside "Region (...)" to the internal region code.
  REGION_NAME_MAP = {
    "Jakarta 1"                 => "Jkt1",
    "RegBar"                    => "RegBar",
    "RegCen"                    => "RegCen",
    "RegTim"                    => "RegTim",
    "Wipro Unza Indonesia ECOM" => "Ecom",
    "E-Com"                     => "Ecom"
  }.freeze

  # Maps Excel header → DB column symbol for each schema.
  # Only columns present in that schema are listed; absent columns → nil automatically.

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
    "Flag Program"            => :flag_program
  }.freeze

  NEW_2025_MAP = {
    "BP Position"      => :bp_position,
    "BP Type"          => :bp_type
  }.freeze

  STANDARD_2025_EXTRA_MAP = {
    "Report SO Date"   => :report_so_date,
    "Report SO Number" => :report_so_number
  }.freeze

  ECOM_MAP = {
    "Delivery No"             => :delivery_no,
    "SAP Customer Code"       => :sap_customer_code,
    "SAP Customer Name"       => :sap_customer_name,
    "SAP Customer Group"      => :sap_customer_group,
    "SAP Customer Sub Group"  => :sap_customer_sub_group,
    "SAP Customer Sub Group 2" => :sap_customer_sub_group_2,
    "Shipping Point"          => :shipping_point
  }.freeze

  COLUMN_MAPS = {
    standard_pre2025: CORE_MAP,
    standard_2025:    CORE_MAP.merge(NEW_2025_MAP).merge(STANDARD_2025_EXTRA_MAP),
    ecom_pre2025:     CORE_MAP.merge(ECOM_MAP),
    ecom_2025:        CORE_MAP.merge(ECOM_MAP).merge(NEW_2025_MAP)
  }.freeze

  # -------------------------------------------------------------------------
  # Public API
  # -------------------------------------------------------------------------

  # Returns { region:, period_year:, period_month:, schema_version: } or raises.
  #
  # Supports the actual source-system filename format:
  #   Report Time Series (Regular) - Region (Jakarta 1) - 2018-04_<timestamp>.xlsx
  def self.parse_filename(filename)
    base = File.basename(filename.to_s, ".*")

    # Primary format: "... - Region ({name}) - {YYYY}-{MM}_..."
    match = base.match(/Region \((.+?)\)\s*-\s*(\d{4})-(\d{2})/)
    if match
      region_label = match[1].strip
      year         = match[2].to_i
      month        = match[3].to_i

      region = REGION_NAME_MAP[region_label]
      unless region
        known = REGION_NAME_MAP.keys.map { |k| "\"#{k}\"" }.join(", ")
        raise ArgumentError,
          "Region \"#{region_label}\" tidak dikenal di filename \"#{filename}\". " \
          "Region yang dikenal: #{known}."
      end

      unless (1..12).cover?(month)
        raise ArgumentError, "Bulan tidak valid (#{month}) di filename \"#{filename}\"."
      end

      return {
        region: region,
        period_year: year,
        period_month: month,
        schema_version: detect_schema(region, year).to_s
      }
    end

    raise ArgumentError,
      "Filename \"#{filename}\" tidak bisa diparse. " \
      "Format yang diharapkan: " \
      "\"Report Time Series (Regular) - Region ({NamaRegion}) - {YYYY}-{MM}_....xlsx\". " \
      "Region yang dikenal: #{REGION_NAME_MAP.keys.join(', ')}."
  end

  # Yields batches of hashes ready for insert_all.
  # Uses ZIP + string scanning instead of Creek — 10–100× faster for large files.
  # batch_size: number of rows per batch.
  def self.each_batch(file_path, filename, upload_id:, batch_size: 1000)
    require "zip"

    meta = parse_filename(filename)
    col_map = build_column_map(meta[:schema_version].to_sym)
    base_attrs = {
      timeseries_upload_id: upload_id,
      region:               meta[:region],
      period_year:          meta[:period_year],
      period_month:         meta[:period_month]
    }

    Zip::File.open(file_path) do |zip|
      # ── 1. Build shared strings table ──────────────────────────────────────
      shared_strings = []
      ss_entry = zip.find_entry("xl/sharedStrings.xml")
      if ss_entry
        ss_xml = ss_entry.get_input_stream.read.force_encoding("UTF-8")
        shared_strings = ss_xml.split("<si>").drop(1).map do |part|
          part.scan(/<t(?:[^>]*)>(.*?)<\/t>/m).map(&:first).join
        end
      end

      # ── 2. Read worksheet XML ───────────────────────────────────────────────
      ws_entry = zip.find_entry("xl/worksheets/sheet1.xml") ||
                 zip.select { |e| e.name.match?(%r{xl/worksheets/sheet\d+\.xml}) }.min_by(&:name)
      raise ArgumentError, "No worksheet found in #{filename}" unless ws_entry

      ws_xml    = ws_entry.get_input_stream.read.force_encoding("UTF-8")
      row_parts = ws_xml.split("<row ")

      # ── 3. Build column letter → DB column map from header row ─────────────
      letter_map = {}
      if row_parts.size > 1
        end_idx        = row_parts[1].index("</row>") || row_parts[1].length
        header_content = row_parts[1][0, end_idx]
        header_content.split("<c ").drop(1).each do |cell_xml|
          col_letter = cell_xml[/r="([A-Z]+)\d+"/, 1]
          next unless col_letter
          col_name = xlsx_cell_string(cell_xml, shared_strings)
          next unless col_name
          db_col = col_map[col_name.strip]
          letter_map[col_letter] = db_col if db_col
        end
      end

      # Build a template row containing every DB column found in the header,
      # initialized to nil. insert_all requires all hashes in a batch to share
      # exactly the same keys, so each row must start from this same template.
      row_template = base_attrs.dup
      letter_map.each_value { |db_col| row_template[db_col] = nil }

      # ── 4. Stream data rows ─────────────────────────────────────────────────
      batch = []

      row_parts.drop(2).each do |row_part|
        end_idx     = row_part.index("</row>") || row_part.length
        row_content = row_part[0, end_idx]
        # Skip blank rows: no <v> and no inline string value
        next unless row_content.include?("<v>") || row_content.include?("<is>")

        row_attrs = row_template.dup

        row_content.split("<c ").drop(1).each do |cell_xml|
          col_letter = cell_xml[/r="([A-Z]+)\d+"/, 1]
          next unless col_letter
          db_col = letter_map[col_letter]
          next unless db_col

          raw = xlsx_cell_value(cell_xml, shared_strings)
          next if raw.nil?
          row_attrs[db_col] = cast_import_value(db_col, raw)
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

  def self.detect_schema(region, year)
    if region == "Ecom"
      year >= 2025 ? :ecom_2025 : :ecom_pre2025
    else
      year >= 2025 ? :standard_2025 : :standard_pre2025
    end
  end
  private_class_method :detect_schema

  def self.build_column_map(schema_version)
    COLUMN_MAPS.fetch(schema_version) do
      raise ArgumentError, "Unknown schema_version: #{schema_version}"
    end
  end
  private_class_method :build_column_map

  DATE_COLUMNS = %i[date_transaction report_so_date].freeze

  # Extract a string value from a cell XML fragment, supporting all XLSX string formats:
  #   t="s"          → shared string (look up in shared_strings array)
  #   t="inlineStr"  → inline string (<is><t>text</t></is>)
  #   t="str"        → formula result string (<v>text</v>)
  # Returns nil for numeric/blank cells.
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

  # Extract a cell value for any type (string or numeric).
  # Returns the raw string for shared/inline/formula strings, or the <v> content for numerics.
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

  # Cast a raw string value from XLSX XML to the appropriate Ruby type.
  # Shared-string cells arrive as Ruby strings; numeric cells arrive as numeric strings.
  def self.cast_import_value(db_col, raw)
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
  private_class_method :cast_import_value
end
