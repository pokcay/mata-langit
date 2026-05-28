# frozen_string_literal: true

# Builds and executes a dynamic cross-tab SQL query against timeseries_transactions.
#
# Usage:
#   result = PivotQueryBuilder.new(
#     row_fields:    ["region", "brand_name"],
#     col_fields:    ["FY", "period_month"],   # one or more; creates nested column headers
#     measurement:   "netto_wise",
#     agg_func:      "sum",
#     period_filter: { fys: ["FY2526"], months: [4, 5], start_day: 1, end_day: "eom" },
#     filters:       { "region" => ["JAVA", "SUMATRA"] }
#   ).call
#
# Returns a hash with: column_levels, column_combos, rows, col_totals, grand_total, row_field_count
class PivotQueryBuilder
  class InvalidConfigError  < StandardError; end
  class TooManyColumnsError < StandardError; end

  ALLOWED_DIMENSION_FIELDS = %w[
    region region_name area_name area_sub_name
    channel_code channel_sub_code outlet_national_group
    category_sub_name brand_group_name brand_name range_name
    FY period_year period_month
    type_transaction
  ].to_set.freeze

  FILTER_ONLY_FIELDS = %w[flag_program].to_set.freeze

  ALLOWED_MEASUREMENTS = %w[netto_wise netto_dist active_outlet].freeze
  ALLOWED_AGG_FUNCS    = %w[sum count avg min max].freeze
  AGG_FUNC_SQL         = { "sum" => "SUM", "count" => "COUNT", "avg" => "AVG", "min" => "MIN", "max" => "MAX" }.freeze

  # Fiscal-year computed expression — used ONLY in SELECT and GROUP BY.
  # In WHERE clauses use expand_fy_to_year_month instead so PostgreSQL can use indexes.
  FY_SQL_EXPR = <<~SQL.squish.freeze
    CASE WHEN period_month >= 4
      THEN 'FY' || LPAD((period_year % 100)::text, 2, '0') || LPAD(((period_year + 1) % 100)::text, 2, '0')
      ELSE 'FY' || LPAD(((period_year - 1) % 100)::text, 2, '0') || LPAD((period_year % 100)::text, 2, '0')
    END
  SQL

  # Last day of the month expression (used when end_day = "eom")
  EOM_SQL_EXPR = "EXTRACT(DAY FROM (DATE_TRUNC('month', date_transaction) + INTERVAL '1 month' - INTERVAL '1 day'))".freeze

  MAX_COL_VALUES   = 500
  MAX_COL_DISPLAY  = 100

  # Cache TTL for dimension catalog and result sets.
  CATALOG_TTL = 4.hours
  RESULT_TTL  = 4.hours

  def initialize(row_fields:, col_fields:, measurement:, agg_func:, filters: {}, period_filter: nil)
    @row_fields    = Array(row_fields).map(&:to_s).uniq
    @col_fields    = Array(col_fields).map(&:to_s).select(&:present?).uniq
    @measurement   = measurement.to_s
    @agg_func      = agg_func.to_s.downcase.presence || "sum"
    @filters       = (filters || {}).transform_keys(&:to_s)
    @period_filter = period_filter
  end

  def call
    validate!
    conn = ActiveRecord::Base.connection

    col_levels = fetch_col_level_values(conn)   # [[fy1, fy2], [mo1, mo2, ...]]
    col_combos = cartesian_product(col_levels)  # [[fy1, mo1], [fy1, mo2], ...]

    if @col_fields.any? && col_combos.size > MAX_COL_DISPLAY
      raise TooManyColumnsError,
            "Terlalu banyak kombinasi kolom (#{col_combos.size}). Tambahkan filter kolom untuk mempersempit hasil."
    end

    raw_rows        = execute_pivot(conn, col_combos)
    serialized_rows = serialize_rows(raw_rows, col_combos)

    # IMPORTANT: grand_total and col_totals MUST come from a separate aggregate
    # query — summing per-row pivoted values in Ruby is only correct for SUM/COUNT.
    # For AVG/MIN/MAX the per-group results don't compose by summing, and for
    # active_outlet (COUNT DISTINCT outlet_national_code) an outlet appearing in
    # multiple row groups would be double-counted. The dedicated aggregate query
    # applies the chosen measurement over the full filtered set without GROUP BY.
    totals      = fetch_totals(conn, col_combos)
    grand_total = totals[:grand_total]
    col_totals  = totals[:col_totals]

    {
      column_levels:   col_levels,
      column_combos:   col_combos,
      rows:            serialized_rows,
      col_totals:      col_levels.empty? ? [ grand_total ] : col_totals,
      grand_total:     grand_total,
      row_field_count: @row_fields.size
    }
  end

  # Returns distinct values for a filterable field, optionally scoped by existing filters and period filter.
  # Used by the filter_values controller action to populate multi-select dropdowns.
  def self.distinct_values(field:, filters: {}, period_filter: nil)
    instance = new(
      row_fields:    [],
      col_fields:    [],
      measurement:   "netto_wise",
      agg_func:      "sum",
      filters:       filters,
      period_filter: period_filter
    )
    instance.send(:fetch_distinct_values, field)
  end

  # Builds a dimension catalog — distinct values for every dimension and filter-only field —
  # scoped by period_filter. Runs field queries in parallel batches of 5.
  #
  # Results are cached in Rails.cache (Solid Cache) keyed on the period_filter config.
  # TTL: CATALOG_TTL (4 hours). Call PivotQueryBuilder.invalidate_catalog_cache! to bust.
  def self.build_dimension_catalog(period_filter: nil)
    pf_key    = (period_filter || {}).transform_keys(&:to_s).sort.to_h
    cache_key = "pivot_dimension_catalog/v2/#{Digest::SHA256.hexdigest(pf_key.to_json)}"

    Rails.cache.fetch(cache_key, expires_in: CATALOG_TTL) do
      all_fields = (ALLOWED_DIMENSION_FIELDS.to_a + FILTER_ONLY_FIELDS.to_a).sort
      result     = {}
      mutex      = Mutex.new

      all_fields.each_slice(5) do |batch|
        threads = batch.map do |field|
          Thread.new do
            ActiveRecord::Base.connection_pool.with_connection do
              inst   = new(row_fields: [], col_fields: [], measurement: "netto_wise",
                           agg_func: "sum", period_filter: period_filter, filters: {})
              values = inst.send(:fetch_distinct_values, field)
              mutex.synchronize { result[field] = values }
            end
          rescue => e
            Rails.logger.warn "[PivotQueryBuilder.build_dimension_catalog] #{field}: #{e.message}"
            mutex.synchronize { result[field] = [] }
          end
        end
        threads.each(&:join)
      end

      result
    end
  end

  # Deletes all pivot dimension catalog cache entries (call after data uploads).
  def self.invalidate_catalog_cache!
    Rails.cache.delete_matched("pivot_dimension_catalog/*")
  rescue NotImplementedError
    # Some cache stores don't support delete_matched; safe to ignore.
    Rails.logger.warn "[PivotQueryBuilder] cache store doesn't support delete_matched; catalog not invalidated"
  end

  private

    # ---------------------------------------------------------------------------
    # Validation
    # ---------------------------------------------------------------------------

    def validate!
      raise InvalidConfigError, "At least one row field is required" if @row_fields.empty?

      @row_fields.each do |f|
        raise InvalidConfigError, "Invalid row field: #{f}" unless ALLOWED_DIMENSION_FIELDS.include?(f)
      end

      @col_fields.each do |f|
        raise InvalidConfigError, "Invalid column field: #{f}" unless ALLOWED_DIMENSION_FIELDS.include?(f)
        raise InvalidConfigError, "Column field cannot be the same as a row field" if @row_fields.include?(f)
      end

      raise InvalidConfigError, "Invalid measurement: #{@measurement}" unless ALLOWED_MEASUREMENTS.include?(@measurement)

      if %w[netto_wise netto_dist].include?(@measurement)
        raise InvalidConfigError, "Invalid aggregation function: #{@agg_func}" unless ALLOWED_AGG_FUNCS.include?(@agg_func)
      end
    end

    # ---------------------------------------------------------------------------
    # SQL expression helpers
    # ---------------------------------------------------------------------------

    def field_sql_expr(field)
      field == "FY" ? FY_SQL_EXPR : field
    end

    # Converts a list of FY strings (e.g. ["FY2526", "FY2425"]) into an explicit
    # (period_year, period_month) SQL condition that can use the existing
    # (region, period_year, period_month) B-tree index via a Bitmap Index Scan —
    # instead of a non-indexable CASE WHEN expression.
    #
    # FY2526: Apr 2025 – Mar 2026
    #   → (period_year = 2025 AND period_month >= 4) OR (period_year = 2026 AND period_month < 4)
    def expand_fy_to_year_month(fys)
      conditions = fys.map do |fy|
        yy         = fy[2..3].to_i       # two-digit start year, e.g. 25
        start_year = 2000 + yy           # e.g. 2025
        end_year   = start_year + 1      # e.g. 2026  (FY always spans exactly 1 year)
        "(period_year = #{start_year} AND period_month >= 4) OR (period_year = #{end_year} AND period_month < 4)"
      end
      "(#{conditions.join(' OR ')})"
    end

    # ---------------------------------------------------------------------------
    # WHERE clause construction
    # ---------------------------------------------------------------------------

    # Returns an array of SQL condition strings derived from period_filter and regular filters.
    # All values are quoted via the connection to prevent injection.
    def where_conditions
      conn       = ActiveRecord::Base.connection
      conditions = []

      if @period_filter
        pf = @period_filter.transform_keys { |k| k.to_s }

        # FY filter — use index-friendly year/month expansion instead of CASE WHEN.
        fys = Array(pf["fys"]).map(&:to_s).select { |v| v.match?(/\AFY\d{4}\z/) }
        conditions << expand_fy_to_year_month(fys) unless fys.empty?

        months = Array(pf["months"]).map(&:to_i).select { |m| (1..12).cover?(m) }
        conditions << "period_month IN (#{months.join(', ')})" unless months.empty?

        start_day = (pf["start_day"].presence || 1).to_i.clamp(1, 31)
        end_day   = pf["end_day"].to_s

        if end_day == "eom"
          conditions << "EXTRACT(DAY FROM date_transaction) BETWEEN #{start_day} AND #{EOM_SQL_EXPR}"
        else
          end_day_int = end_day.to_i.clamp(1, 31)
          conditions << "EXTRACT(DAY FROM date_transaction) BETWEEN #{start_day} AND #{end_day_int}"
        end
      end

      @filters.each do |field, values|
        values = Array(values).map(&:to_s).reject(&:blank?)
        next if values.empty?

        unless ALLOWED_DIMENSION_FIELDS.include?(field) || FILTER_ONLY_FIELDS.include?(field)
          raise InvalidConfigError, "Invalid filter field: #{field}"
        end

        expr   = field_sql_expr(field)
        quoted = values.map { |v| conn.quote(v) }.join(", ")
        conditions << "(#{expr}) IN (#{quoted})"
      end

      conditions
    end

    # Composes a full WHERE clause string from where_conditions plus any extra conditions passed in.
    def build_where_clause(extra_conditions: [])
      all = where_conditions + Array(extra_conditions)
      all.empty? ? "" : "WHERE #{all.join(' AND ')}"
    end

    # ---------------------------------------------------------------------------
    # Measurement / aggregation helpers
    # ---------------------------------------------------------------------------

    def measure_agg_sql(case_when_condition = nil)
      if @measurement == "active_outlet"
        if case_when_condition
          "COUNT(DISTINCT CASE WHEN #{case_when_condition} THEN outlet_national_code END)"
        else
          "COUNT(DISTINCT outlet_national_code)"
        end
      else
        col = @measurement  # "netto_wise" or "netto_dist"
        agg = AGG_FUNC_SQL[@agg_func]
        if case_when_condition
          "#{agg}(CASE WHEN #{case_when_condition} THEN #{col} END)"
        else
          "#{agg}(#{col})"
        end
      end
    end

    # ---------------------------------------------------------------------------
    # Column level / pivot query execution
    # ---------------------------------------------------------------------------

    def fetch_col_level_values(conn)
      @col_fields.map do |field|
        expr  = field_sql_expr(field)
        where = build_where_clause(extra_conditions: [ "(#{expr}) IS NOT NULL" ])
        sql   = "SELECT DISTINCT (#{expr}) AS v FROM timeseries_transactions #{where} ORDER BY v LIMIT #{MAX_COL_VALUES}"
        conn.exec_query(Arel.sql(sql)).rows.flatten.map(&:to_s)
      end
    end

    def cartesian_product(levels)
      return [] if levels.empty?
      levels.reduce([ [] ]) { |acc, level| acc.flat_map { |combo| level.map { |v| combo + [ v ] } } }
    end

    def execute_pivot(conn, col_combos)
      row_selects = @row_fields.each_with_index.map do |f, i|
        "(#{field_sql_expr(f)}) AS \"row_#{i}\""
      end

      col_selects = col_combos.each_with_index.map do |combo, i|
        conditions = @col_fields.each_with_index.map do |field, fi|
          expr   = field_sql_expr(field)
          quoted = conn.quote(combo[fi])
          "(#{expr}) = #{quoted}"
        end
        condition_str = conditions.join(" AND ")
        "#{measure_agg_sql(condition_str)} AS \"col_#{i}\""
      end

      total_select = "#{measure_agg_sql} AS \"_total\""
      all_selects  = (row_selects + col_selects + [ total_select ]).join(", ")
      group_by     = (1..@row_fields.size).to_a.join(", ")
      where        = build_where_clause

      sql = "SELECT #{all_selects} FROM timeseries_transactions #{where} GROUP BY #{group_by} ORDER BY #{group_by}"
      conn.exec_query(Arel.sql(sql)).to_a
    end

    def serialize_rows(raw_rows, col_combos)
      raw_rows.map do |row|
        dims   = @row_fields.size.times.map { |i| row["row_#{i}"]&.to_s }
        values = col_combos.size.times.map  { |i| row["col_#{i}"]&.to_f }
        total  = row["_total"]&.to_f || 0.0
        { dims: dims, values: values, total: total }
      end
    end

    # Runs a single aggregate query (no GROUP BY) to get the true grand_total and
    # per-col_combo totals over the full filtered set. This is the only correct
    # way to compute footers for AVG/MIN/MAX/active_outlet measurements — summing
    # per-row pivoted values in Ruby would mis-aggregate them.
    #
    # For SUM/COUNT, this produces the same numbers as the previous Ruby sum,
    # but at the cost of one extra round trip.
    def fetch_totals(conn, col_combos)
      col_selects = col_combos.each_with_index.map do |combo, i|
        conditions = @col_fields.each_with_index.map do |field, fi|
          expr   = field_sql_expr(field)
          quoted = conn.quote(combo[fi])
          "(#{expr}) = #{quoted}"
        end
        "#{measure_agg_sql(conditions.join(' AND '))} AS \"col_#{i}\""
      end

      total_select = "#{measure_agg_sql} AS \"_total\""
      all_selects  = (col_selects + [ total_select ]).join(", ")
      where        = build_where_clause

      sql = "SELECT #{all_selects} FROM timeseries_transactions #{where}"
      row = conn.exec_query(Arel.sql(sql)).first || {}

      {
        grand_total: row["_total"].to_f,
        col_totals:  col_combos.size.times.map { |i| row["col_#{i}"].to_f }
      }
    end

    # Fetches distinct values for a single filterable field, respecting current where_conditions.
    def fetch_distinct_values(field)
      field = field.to_s
      unless ALLOWED_DIMENSION_FIELDS.include?(field) || FILTER_ONLY_FIELDS.include?(field)
        raise InvalidConfigError, "Invalid filter field: #{field}"
      end

      conn  = ActiveRecord::Base.connection
      expr  = field_sql_expr(field)
      where = build_where_clause
      sql   = "SELECT DISTINCT (#{expr}) AS val FROM timeseries_transactions #{where} ORDER BY val NULLS LAST LIMIT 500"
      conn.exec_query(Arel.sql(sql)).rows.flatten.compact.map(&:to_s)
    end
end
