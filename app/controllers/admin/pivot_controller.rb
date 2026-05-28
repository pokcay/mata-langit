# frozen_string_literal: true

class Admin::PivotController < Admin::BaseController
  # GET /admin/pivot
  def show
    render inertia: "admin/Pivot"
  end

  # POST /admin/pivot/generate  (raw fetch — not Inertia router)
  def generate
    builder_params = {
      row_fields:    Array(params[:row_fields]),
      col_fields:    Array(params[:col_fields]).map(&:to_s).select(&:present?),
      measurement:   params[:measurement].to_s,
      agg_func:      params[:agg_func].to_s,
      period_filter: period_filter_params,
      filters:       filter_params
    }

    cache_key = result_cache_key(builder_params)
    result = Rails.cache.fetch(cache_key, expires_in: PivotQueryBuilder::RESULT_TTL) do
      PivotQueryBuilder.new(**builder_params).call
    end

    render json: result
  rescue PivotQueryBuilder::TooManyColumnsError => e
    render json: { col_warning: e.message }, status: :unprocessable_entity
  rescue PivotQueryBuilder::InvalidConfigError => e
    render json: { error: e.message }, status: :unprocessable_entity
  rescue => e
    Rails.logger.error "[Admin::PivotController#generate] #{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}"
    render json: { error: "Query failed: #{e.message}" }, status: :internal_server_error
  end

  # POST /admin/pivot/export  (raw fetch — not Inertia router)
  def export
    result = PivotQueryBuilder.new(
      row_fields:    Array(params[:row_fields]),
      col_fields:    Array(params[:col_fields]).map(&:to_s).select(&:present?),
      measurement:   params[:measurement].to_s,
      agg_func:      params[:agg_func].to_s,
      period_filter: period_filter_params,
      filters:       filter_params
    ).call

    measurement_slug = {
      "netto_wise"    => "netto-wise",
      "netto_dist"    => "netto-dist",
      "active_outlet" => "active-outlet"
    }.fetch(params[:measurement].to_s, params[:measurement].to_s)
    filename = "pivot-#{measurement_slug}-#{Date.today.iso8601}.xlsx"

    xlsx = build_pivot_xlsx(result, Array(params[:row_fields]))
    send_data xlsx,
              filename:    filename,
              type:        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              disposition: "attachment"
  rescue PivotQueryBuilder::InvalidConfigError => e
    render json: { error: e.message }, status: :unprocessable_entity
  rescue => e
    Rails.logger.error "[Admin::PivotController#export] #{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}"
    render json: { error: "Export failed: #{e.message}" }, status: :internal_server_error
  end

  # GET /admin/pivot/filter_values  (raw fetch — not Inertia router)
  # Returns distinct values for a filterable field, respecting active period filter and other filters.
  def filter_values
    field  = params[:field].to_s
    pf     = period_filter_params
    flt    = filter_params

    cache_key = "pivot_filter_values/v1/#{Digest::SHA256.hexdigest({ field: field, pf: pf, f: flt }.to_json)}"
    values = Rails.cache.fetch(cache_key, expires_in: PivotQueryBuilder::RESULT_TTL) do
      PivotQueryBuilder.distinct_values(field: field, period_filter: pf, filters: flt)
    end

    render json: { values: values }
  rescue PivotQueryBuilder::InvalidConfigError => e
    render json: { error: e.message }, status: :unprocessable_entity
  rescue => e
    Rails.logger.error "[Admin::PivotController#filter_values] #{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}"
    render json: { error: "Query failed: #{e.message}" }, status: :internal_server_error
  end

  # GET /admin/pivot/catalog  (raw fetch — not Inertia router)
  # Returns the full DB-backed dimension catalog plus its build status.
  # The catalog is populated by PivotCatalogRefreshJob and never auto-expires.
  def catalog
    render json: {
      catalog: PivotDimensionCache.catalog_hash,
      status:  PivotDimensionCache.refresh_status
    }
  rescue => e
    Rails.logger.error "[Admin::PivotController#catalog] #{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}"
    render json: { error: "Catalog read failed: #{e.message}" }, status: :internal_server_error
  end

  # POST /admin/pivot/refresh_catalog  (raw fetch — not Inertia router)
  # Enqueues PivotCatalogRefreshJob unless a build is already in progress.
  def refresh_catalog
    if PivotDimensionCache.where(field_name: PivotDimensionCache::REFRESH_FIELDS, status: "building").exists?
      render json: { message: "Katalog sedang dibangun", status: PivotDimensionCache.refresh_status }
      return
    end

    PivotCatalogRefreshJob.perform_later
    render json: { message: "Refresh katalog dimulai", status: PivotDimensionCache.refresh_status }
  rescue => e
    Rails.logger.error "[Admin::PivotController#refresh_catalog] #{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}"
    render json: { error: "Refresh failed: #{e.message}" }, status: :internal_server_error
  end

  private

    FIELD_LABELS = {
      "region" => "Region", "region_name" => "Region Name", "area_name" => "Area",
      "area_sub_name" => "Sub-area",
      "channel_code" => "Channel", "channel_sub_code" => "Channel Sub",
      "outlet_national_group" => "Outlet Nat. Group",
      "category_sub_name" => "Category", "brand_group_name" => "Brand Group",
      "brand_name" => "Brand", "range_name" => "Range",
      "FY" => "Fiscal Year", "period_year" => "Year", "period_month" => "Month",
      "type_transaction" => "Transaction Type",
    }.freeze

    # Stable cache key for a pivot result based on the builder parameters.
    #
    # row_fields and col_fields are NOT sorted — their order is semantically
    # significant (it determines row-dimension nesting and column-header
    # nesting in the output), so cache keys must distinguish between
    # ["region", "brand"] and ["brand", "region"].
    def result_cache_key(builder_params)
      normalized = {
        row_fields:    Array(builder_params[:row_fields]),
        col_fields:    Array(builder_params[:col_fields]),
        measurement:   builder_params[:measurement].to_s,
        agg_func:      builder_params[:agg_func].to_s,
        period_filter: (builder_params[:period_filter] || {}).transform_keys(&:to_s).sort.to_h,
        filters:       (builder_params[:filters] || {}).transform_keys(&:to_s).sort.to_h
                         .transform_values { |v| Array(v).map(&:to_s).sort }
      }
      "pivot_result/v1/#{Digest::SHA256.hexdigest(normalized.to_json)}"
    end

    # Builds an Axlsx xlsx binary for the given pivot result.
    # Supports multi-level column headers via merge_cells when col_levels.size > 1.
    def build_pivot_xlsx(result, row_field_keys)
      col_levels  = result[:column_levels]   # [[fy1,fy2], [mo1,mo2,...]]
      col_combos  = result[:column_combos]   # [[fy1,mo1],[fy1,mo2],...]
      rows        = result[:rows]
      col_totals  = result[:col_totals]
      grand_total = result[:grand_total]
      is_flat     = col_combos.empty?
      num_levels  = col_levels.size          # 0 = flat, 1 = single, 2+ = nested

      row_labels = row_field_keys.map { |k| FIELD_LABELS.fetch(k, k) }

      package = Axlsx::Package.new
      wb      = package.workbook

      wb.add_worksheet(name: "Pivot") do |sheet|
        bold     = wb.styles.add_style(b: true)
        num_fmt  = wb.styles.add_style(format_code: "#,##0.00")
        bold_num = wb.styles.add_style(b: true, format_code: "#,##0.00")

        if is_flat
          # Single header row: row dim labels + "Nilai"
          sheet.add_row(row_labels + [ "Nilai" ], style: [ bold ] * (row_labels.size + 1))
        elsif num_levels == 1
          # Single col level: one bold header row (original behavior)
          col_values = col_levels[0]
          sheet.add_row(row_labels + col_values + [ "Total" ], style: [ bold ] * (row_labels.size + col_values.size + 1))
        else
          # Multi-level: write one header row per level, then merge cells
          # Compute span sizes: span[i] = product of all lower level sizes
          level_sizes = col_levels.map(&:size)
          spans = level_sizes.size.times.map do |i|
            level_sizes[(i + 1)..].reduce(1, :*)
          end

          num_levels.times do |level_i|
            if level_i == 0
              # Row 0: row_dim labels + level-0 col values (padded with nils for spans) + Total
              level_values = col_levels[0]
              span = spans[0]
              cells = row_labels.dup
              level_values.each do |v|
                cells << v
                (span - 1).times { cells << nil }
              end
              cells << "Total"
              styles = ([ bold ] * row_labels.size) +
                       ([ bold ] * level_values.size + [ nil ] * ((span - 1) * level_values.size)) +
                       [ bold ]
              # Interleave correctly: bold for value cells, nil for padding
              value_styles = level_values.flat_map { [ bold ] + ([ nil ] * (span - 1)) }
              sheet.add_row(row_labels + level_values.flat_map { |v| [ v ] + ([ nil ] * (span - 1)) } + [ "Total" ],
                            style: ([ bold ] * row_labels.size) + value_styles + [ bold ])
            else
              # Rows 1+: nil for row dims + repeating sub-level values
              level_values = col_levels[level_i]
              span = spans[level_i]
              # Each parent repeats the sub-level values
              num_parents = level_sizes[0...level_i].reduce(1, :*)
              sub_cells   = level_values.flat_map { |v| [ v ] + ([ nil ] * (span - 1)) } * num_parents
              sub_styles  = level_values.flat_map { [ bold ] + ([ nil ] * (span - 1)) } * num_parents
              sheet.add_row(([ nil ] * row_labels.size) + sub_cells + [ nil ],
                            style: ([ nil ] * row_labels.size) + sub_styles + [ nil ])
            end
          end

          # Apply merge_cells for multi-level header
          num_dim = row_labels.size
          span_top = spans[0]

          # Merge row-dim cells vertically (col A..dim, rows 1..num_levels)
          num_dim.times do |di|
            col_letter = xlsx_col_letter(di)
            sheet.merge_cells("#{col_letter}1:#{col_letter}#{num_levels}") if num_levels > 1
          end

          # Merge level-0 col value cells horizontally (if span > 1)
          if span_top > 1
            col_levels[0].each_with_index do |_v, vi|
              start_col = num_dim + vi * span_top
              end_col   = start_col + span_top - 1
              sheet.merge_cells("#{xlsx_col_letter(start_col)}1:#{xlsx_col_letter(end_col)}1")
            end
          end

          # Merge Total column vertically
          total_col = xlsx_col_letter(num_dim + col_combos.size)
          sheet.merge_cells("#{total_col}1:#{total_col}#{num_levels}") if num_levels > 1
        end

        # Data rows (same structure for flat, single, and multi-level)
        rows.each do |row|
          dim_cells = row[:dims].map { |d| d.nil? ? "" : d }
          if is_flat
            sheet.add_row(dim_cells + [ row[:total].to_f ],
                          style: ([ nil ] * dim_cells.size) + [ bold_num ])
          else
            value_cells  = row[:values].map { |v| v.nil? ? nil : v.to_f }
            sheet.add_row(dim_cells + value_cells + [ row[:total].to_f ],
                          style: ([ nil ] * dim_cells.size) + ([ num_fmt ] * value_cells.size) + [ bold_num ])
          end
        end

        # Totals footer row
        if is_flat
          sheet.add_row(([ "" ] * (row_labels.size - 1)) + [ "Total", grand_total.to_f ],
                        style: ([ bold ] * row_labels.size) + [ bold_num ])
        else
          sheet.add_row(([ "" ] * (row_labels.size - 1)) + [ "Total" ] +
                        col_totals.map(&:to_f) + [ grand_total.to_f ],
                        style: ([ bold ] * row_labels.size) +
                               ([ bold_num ] * col_totals.size) + [ bold_num ])
        end

        # Column widths
        dim_count   = row_labels.size
        value_count = is_flat ? 1 : col_combos.size + 1
        sheet.column_widths(*(([ 15 ] * dim_count) + ([ 14 ] * value_count)))
      end

      package.to_stream.read
    end

    # Converts a 0-based column index to an Excel column letter (A, B, ..., Z, AA, AB, ...).
    def xlsx_col_letter(idx)
      result = ""
      i = idx + 1
      while i > 0
        i -= 1
        result = ("A".ord + (i % 26)).chr + result
        i /= 26
      end
      result
    end

    def period_filter_params
      pf = params[:period_filter]
      return nil unless pf.present?

      {
        "fys"       => Array(pf[:fys]).map(&:to_s),
        "months"    => Array(pf[:months]).map(&:to_i),
        "start_day" => pf[:start_day].presence || 1,
        "end_day"   => pf[:end_day].presence || "eom"
      }
    end

    def filter_params
      raw = params[:filters]
      return {} unless raw.present?

      raw.to_unsafe_h.transform_values { |v| Array(v).map(&:to_s) }
    end
end
