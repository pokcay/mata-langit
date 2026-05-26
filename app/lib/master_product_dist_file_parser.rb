# frozen_string_literal: true

# Parses Excel (.xlsx) Master Product Dist files into DB-ready hashes.
#
# Each file covers one distributor. The "PRODUCT DIST" sheet contains one
# header row followed by one row per product mapping. Distributor identity
# (distributor_sap_code, distributor_name, distributor_parent_name, region)
# is read from the first data row.
#
# Column headers confirmed from real files (54 columns total):
#   Region Name | Area Name | Distributor SAP Code | Distributor Parent Name
#   Distributor ID | Distributor Child Name | ... (48 more) ...
class MasterProductDistFileParser
  TARGET_SHEET = "PRODUCT DIST"

  COLUMN_MAP = {
    "Region Name"                  => :region_name,
    "Area Name"                    => :area_name,
    "Distributor SAP Code"         => :distributor_sap_code,
    "Distributor Parent Name"      => :distributor_parent_name,
    "Distributor ID"               => :distributor_id,
    "Distributor Child Name"       => :distributor_child_name,
    "Product Distributor Code"     => :product_distributor_code,
    "Product Distributor Name"     => :product_distributor_name,
    "Product Distributor Status"   => :product_distributor_status,
    "Product Code"                 => :product_code,
    "Product SAP Code"             => :product_sap_code,
    "Barcode Product"              => :barcode_product,
    "Barcode Inner Box"            => :barcode_inner_box,
    "Barcode Carton"               => :barcode_carton,
    "Product Name"                 => :product_name,
    "Brand Name"                   => :brand_name,
    "Category CEO Name"            => :category_ceo_name,
    "Category Marketing Name"      => :category_marketing_name,
    "Range Name"                   => :range_name,
    "Range Variant Name"           => :range_variant_name,
    "Range Marketing Name"         => :range_marketing_name,
    "Category Name"                => :category_name,
    "Category Sub Name"            => :category_sub_name,
    "Variant Name"                 => :variant_name,
    "Size"                         => :size,
    "Content Carton / PCS"         => :content_carton_pcs,
    "Dimension Product"            => :dimension_product,
    "Dimension Inner Box"          => :dimension_inner_box,
    "Dimension Carton"             => :dimension_carton,
    "Weight Product"               => :weight_product,
    "Weight Inner Box"             => :weight_inner_box,
    "Weight Carton"                => :weight_carton,
    "Status"                       => :status,
    "OPSC Status"                  => :opsc_status,
    "TO Status"                    => :to_status,
    "Price Start Date (YYYY-MM-DD)" => :price_start_date,
    "Price RBP"                    => :price_rbp,
    "Price CBP"                    => :price_cbp,
    "Price GT"                     => :price_gt,
    "Price MT"                     => :price_mt,
    "Price MBS"                    => :price_mbs,
    "Price 5.5%"                   => :price_5_5_pct,
    "Price GT-11%"                 => :price_gt_11_pct,
    "Price Skincare"               => :price_skincare,
    "Price Koperasi"               => :price_koperasi,
    "Price Lazada"                 => :price_lazada,
    "Price Farmaku"                => :price_farmaku,
    "Price Shopee"                 => :price_shopee,
    "Price Sirclo"                 => :price_sirclo,
    "Price Sociolla"               => :price_sociolla,
    "Product Image 1"              => :product_image_1,
    "Product Image 2"              => :product_image_2,
    "Product Image 3"              => :product_image_3,
    "Product Image 4"              => :product_image_4
  }.freeze

  FLOAT_COLUMNS = %i[
    content_carton_pcs weight_product weight_inner_box weight_carton
    price_rbp price_cbp price_gt price_mt price_mbs price_5_5_pct
    price_gt_11_pct price_skincare price_koperasi price_lazada
    price_farmaku price_shopee price_sirclo price_sociolla
  ].freeze

  # Returns { distributor_sap_code:, distributor_name:, distributor_parent_name:, region: }
  # by reading only the header + first data row.
  def self.peek(file_path)
    require "zip"

    Zip::File.open(file_path) do |zip|
      shared_strings = load_shared_strings(zip)
      ws_path = resolve_sheet_path(zip)
      ws_xml  = zip.find_entry(ws_path).get_input_stream.read.force_encoding("UTF-8")
      rows    = ws_xml.split("<row ")

      raise ArgumentError, "Sheet '#{TARGET_SHEET}' is empty." if rows.size < 3

      letter_map = build_letter_map(rows[1], shared_strings)

      sap_col        = letter_map.key(:distributor_sap_code)
      child_name_col = letter_map.key(:distributor_child_name)
      parent_col     = letter_map.key(:distributor_parent_name)
      region_col     = letter_map.key(:region_name)

      raise ArgumentError, "'Distributor SAP Code' column not found."   unless sap_col
      raise ArgumentError, "'Distributor Child Name' column not found." unless child_name_col

      sap_code       = nil
      dist_name      = nil
      parent_name    = nil
      region         = nil

      end_idx = rows[2].index("</row>") || rows[2].length
      rows[2][0, end_idx].split("<c ").drop(1).each do |cell_xml|
        col = cell_xml[/r="([A-Z]+)\d+"/, 1]
        next unless col
        val = xlsx_cell_value(cell_xml, shared_strings)&.to_s&.strip
        sap_code    = val if col == sap_col
        dist_name   = val if col == child_name_col
        parent_name = val if parent_col && col == parent_col
        region      = val if region_col && col == region_col
      end

      raise ArgumentError, "distributor_sap_code is blank in the first data row." if sap_code.blank?
      raise ArgumentError, "distributor_name is blank in the first data row."      if dist_name.blank?

      { distributor_sap_code: sap_code, distributor_name: dist_name,
        distributor_parent_name: parent_name, region: region }
    end
  end

  # Yields batches of hashes ready for insert_all.
  def self.each_batch(file_path, upload_id:, batch_size: 1000)
    require "zip"

    Zip::File.open(file_path) do |zip|
      shared_strings = load_shared_strings(zip)
      ws_path = resolve_sheet_path(zip)
      ws_xml  = zip.find_entry(ws_path).get_input_stream.read.force_encoding("UTF-8")
      rows    = ws_xml.split("<row ")

      raise ArgumentError, "Sheet '#{TARGET_SHEET}' has no data rows." if rows.size < 3

      letter_map   = build_letter_map(rows[1], shared_strings)
      row_template = { master_product_dist_upload_id: upload_id }
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

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

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
        "Pastikan file yang diupload adalah file PRODUCT_DIST_*.xlsx yang benar."
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

    if db_col == :distributor_id
      int_val = val.to_f.to_i
      int_val.zero? && val != "0" ? nil : int_val
    elsif db_col == :price_start_date
      if val.match?(/\A[\d.]+\z/)
        Date.new(1899, 12, 30) + val.to_f.to_i
      else
        begin Date.parse(val) rescue nil end
      end
    elsif FLOAT_COLUMNS.include?(db_col)
      val.match?(/\A[+-]?[\d]+(?:\.[\d]+)?(?:[Ee][+-]?[\d]+)?\z/) ? val.to_f : nil
    else
      val.presence
    end
  end
  private_class_method :cast_value
end
