# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

class Admin::PivotControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin    = users(:admin)
    @user     = users(:one)
    @password = "password"
  end

  def log_in_as(user)
    post login_path, params: { email: user.email, password: @password }
  end

  def json_post(path, body)
    post path, params: body.to_json, headers: { "Content-Type" => "application/json" }
  end

  # ── Authorization ───────────────────────────────────────────────────────────

  test "unauthenticated users are redirected to login" do
    get "/admin/pivot"
    assert_redirected_to login_path
  end

  test "non-admin users are redirected to root" do
    log_in_as(@user)
    get "/admin/pivot"
    assert_redirected_to root_path
  end

  # ── show ────────────────────────────────────────────────────────────────────

  test "admin can visit pivot page" do
    log_in_as(@admin)
    get "/admin/pivot"
    assert_response :success
  end

  # ── generate (raw fetch endpoint) ──────────────────────────────────────────

  test "generate rejects missing row fields" do
    log_in_as(@admin)
    json_post "/admin/pivot/generate",
              row_fields: [], col_fields: [], measurement: "netto_wise", agg_func: "sum"
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert body["error"].present?
  end

  test "generate rejects invalid field names" do
    log_in_as(@admin)
    json_post "/admin/pivot/generate",
              row_fields: [ "evil; DROP TABLE--" ], col_fields: [], measurement: "netto_wise", agg_func: "sum"
    assert_response :unprocessable_entity
  end

  test "generate rejects invalid measurement" do
    log_in_as(@admin)
    json_post "/admin/pivot/generate",
              row_fields: [ "region" ], col_fields: [], measurement: "bad_column", agg_func: "sum"
    assert_response :unprocessable_entity
  end

  test "generate returns valid JSON structure for flat summary" do
    log_in_as(@admin)
    json_post "/admin/pivot/generate",
              row_fields: [ "region" ], col_fields: [], measurement: "netto_wise", agg_func: "sum"
    assert_response :success
    body = JSON.parse(response.body)
    assert body.key?("column_levels")
    assert body.key?("column_combos")
    assert body.key?("rows")
    assert body.key?("col_totals")
    assert body.key?("grand_total")
    assert_equal [], body["column_levels"]
    assert_equal [], body["column_combos"]
  end

  test "generate with period_filter scopes result to specified FY and months" do
    log_in_as(@admin)
    json_post "/admin/pivot/generate", {
      row_fields:    [ "region" ],
      col_fields:    [],
      measurement:   "netto_wise",
      agg_func:      "sum",
      period_filter: { fys: [ "FY9900" ], months: [ 4 ], start_day: 1, end_day: "eom" }
    }
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal [], body["rows"]
    assert_equal 0.0, body["grand_total"]
  end

  test "generate with invalid filter field returns error" do
    log_in_as(@admin)
    json_post "/admin/pivot/generate", {
      row_fields:    [ "region" ],
      col_fields:    [],
      measurement:   "netto_wise",
      agg_func:      "sum",
      period_filter: { fys: [ "FY2526" ], months: [ 4 ], start_day: 1, end_day: "eom" },
      filters:       { "evil; DROP TABLE--" => [ "x" ] }
    }
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert body["error"].present?
  end

  test "generate with multiple col_fields returns column_levels array of arrays" do
    log_in_as(@admin)
    json_post "/admin/pivot/generate", {
      row_fields:    [ "region" ],
      col_fields:    [ "FY", "period_month" ],
      measurement:   "netto_wise",
      agg_func:      "sum",
      period_filter: { fys: [ "FY9900" ], months: [ 4 ], start_day: 1, end_day: "eom" }
    }
    assert_response :success
    body = JSON.parse(response.body)
    assert body.key?("column_levels")
    assert body.key?("column_combos")
    assert_kind_of Array, body["column_levels"]
    # With FY9900 (no data), both level arrays should be empty but structure is correct
    assert_equal 2, body["column_levels"].size
    body["column_levels"].each { |level| assert_kind_of Array, level }
  end

  # ── filter_values ────────────────────────────────────────────────────────────

  test "filter_values requires authentication" do
    get "/admin/pivot/filter_values", params: { field: "region" }
    assert_redirected_to login_path
  end

  test "filter_values returns array of values for a valid field" do
    log_in_as(@admin)
    get "/admin/pivot/filter_values", params: { field: "region" }
    assert_response :success
    body = JSON.parse(response.body)
    assert body.key?("values")
    assert_kind_of Array, body["values"]
  end

  test "filter_values returns values for FY computed field" do
    log_in_as(@admin)
    get "/admin/pivot/filter_values", params: { field: "FY" }
    assert_response :success
    body = JSON.parse(response.body)
    assert body.key?("values")
    assert_kind_of Array, body["values"]
  end

  test "filter_values returns values for filter-only field flag_program" do
    log_in_as(@admin)
    get "/admin/pivot/filter_values", params: { field: "flag_program" }
    assert_response :success
    body = JSON.parse(response.body)
    assert body.key?("values")
  end

  test "filter_values rejects invalid field" do
    log_in_as(@admin)
    get "/admin/pivot/filter_values", params: { field: "evil; DROP TABLE--" }
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert body["error"].present?
  end

  test "filter_values with period_filter narrows results" do
    log_in_as(@admin)
    get "/admin/pivot/filter_values", params: {
      field:         "region",
      period_filter: { fys: [ "FY9900" ], months: [ 4 ], start_day: 1, end_day: "eom" }
    }
    assert_response :success
    body = JSON.parse(response.body)
    assert body.key?("values")
    assert_equal [], body["values"]
  end

  # ── export ────────────────────────────────────────────────────────────────────

  test "export requires authentication" do
    json_post "/admin/pivot/export",
              row_fields: [ "region" ], col_fields: [], measurement: "netto_wise", agg_func: "sum"
    assert_redirected_to login_path
  end

  test "export returns xlsx for a valid config" do
    log_in_as(@admin)
    json_post "/admin/pivot/export", {
      row_fields:    [ "region" ],
      col_fields:    [],
      measurement:   "netto_wise",
      agg_func:      "sum",
      period_filter: { fys: [ "FY9900" ], months: [ 4 ], start_day: 1, end_day: "eom" }
    }
    assert_response :success
    assert_equal "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                 response.content_type
    assert response.headers["Content-Disposition"].include?("pivot-netto-wise-")
    assert response.headers["Content-Disposition"].include?(".xlsx")
  end

  test "export rejects invalid config" do
    log_in_as(@admin)
    json_post "/admin/pivot/export",
              row_fields: [], col_fields: [], measurement: "netto_wise", agg_func: "sum"
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert body["error"].present?
  end

  # ── dimension_catalog ─────────────────────────────────────────────────────────

  # ── catalog (DB-backed) ───────────────────────────────────────────────────────

  test "catalog requires authentication" do
    get "/admin/pivot/catalog"
    assert_redirected_to login_path
  end

  test "catalog returns catalog hash and status" do
    log_in_as(@admin)
    get "/admin/pivot/catalog"
    assert_response :success
    body = JSON.parse(response.body)
    assert body.key?("catalog")
    assert body.key?("status")
    assert_kind_of Hash, body["catalog"]
    assert body["status"].key?("total")
    assert body["status"].key?("ready")
    assert body["status"].key?("building")
  end

  test "refresh_catalog requires authentication" do
    post "/admin/pivot/refresh_catalog"
    assert_redirected_to login_path
  end

  test "refresh_catalog enqueues job and returns status" do
    log_in_as(@admin)
    assert_enqueued_with(job: PivotCatalogRefreshJob) do
      post "/admin/pivot/refresh_catalog"
    end
    assert_response :success
    body = JSON.parse(response.body)
    assert body.key?("message")
    assert body.key?("status")
  end

  test "refresh_catalog does not double-enqueue when already building" do
    log_in_as(@admin)
    PivotDimensionCache.create!(field_name: "region", status: "building")
    assert_no_enqueued_jobs(only: PivotCatalogRefreshJob) do
      post "/admin/pivot/refresh_catalog"
    end
    assert_response :success
    body = JSON.parse(response.body)
    assert_match(/sedang dibangun/i, body["message"])
  end

  test "generate returns col_warning when column field has too many distinct values" do
    log_in_as(@admin)
    fake_builder = Object.new
    fake_builder.define_singleton_method(:call) do
      raise PivotQueryBuilder::TooManyColumnsError, "Terlalu banyak nilai kolom (150)."
    end
    stub_new = ->(**) { fake_builder }
    PivotQueryBuilder.stub(:new, stub_new) do
      json_post "/admin/pivot/generate", {
        row_fields:    [ "region" ],
        col_fields:    [ "product_name" ],
        measurement:   "netto_wise",
        agg_func:      "sum",
        period_filter: { fys: [ "FY2526" ], months: [ 4 ], start_day: 1, end_day: "eom" }
      }
    end
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert body["col_warning"].present?
    assert_nil body["error"]
  end

  # ── result_cache_key (private) ────────────────────────────────────────────────
  # Row/col field ORDER is semantically significant — it determines the row
  # dimension nesting and column header nesting in the response. The cache key
  # must distinguish between different orderings so structurally different
  # pivots don't collide on the same cache entry.

  test "result_cache_key differs for different row_fields ORDER" do
    controller = Admin::PivotController.new
    key_a = controller.send(:result_cache_key,
      row_fields: %w[region brand_name], col_fields: [], measurement: "netto_wise", agg_func: "sum")
    key_b = controller.send(:result_cache_key,
      row_fields: %w[brand_name region], col_fields: [], measurement: "netto_wise", agg_func: "sum")
    refute_equal key_a, key_b, "Row field order must produce different cache keys"
  end

  test "result_cache_key differs for different col_fields ORDER" do
    controller = Admin::PivotController.new
    key_a = controller.send(:result_cache_key,
      row_fields: [ "region" ], col_fields: %w[FY period_month], measurement: "netto_wise", agg_func: "sum")
    key_b = controller.send(:result_cache_key,
      row_fields: [ "region" ], col_fields: %w[period_month FY], measurement: "netto_wise", agg_func: "sum")
    refute_equal key_a, key_b, "Col field order must produce different cache keys"
  end

  test "result_cache_key is stable for same parameters" do
    controller = Admin::PivotController.new
    key_a = controller.send(:result_cache_key,
      row_fields: %w[region brand_name], col_fields: %w[FY], measurement: "netto_wise", agg_func: "sum",
      filters: { "region" => %w[JAVA SUMATRA] })
    key_b = controller.send(:result_cache_key,
      row_fields: %w[region brand_name], col_fields: %w[FY], measurement: "netto_wise", agg_func: "sum",
      filters: { "region" => %w[SUMATRA JAVA] })   # filter values may be re-ordered safely
    assert_equal key_a, key_b, "Same row/col field order + equivalent filters must produce same cache key"
  end
end
