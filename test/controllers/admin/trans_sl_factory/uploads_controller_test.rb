# frozen_string_literal: true

require "test_helper"
require_relative "../../../support/sl_factory_fixture"

class Admin::TransSlFactory::UploadsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin    = users(:admin)
    @password = "password"
  end

  # --- index ----------------------------------------------------------------

  test "unauthenticated users cannot access the uploads index" do
    get admin_trans_sl_factory_uploads_path
    assert_redirected_to login_path
  end

  test "non-admin users are redirected" do
    log_in_as(users(:one))
    get admin_trans_sl_factory_uploads_path
    assert_redirected_to root_path
  end

  test "admin sees the uploads index with serialized rows" do
    log_in_as(@admin)
    get admin_trans_sl_factory_uploads_path
    assert_response :success
    props = inertia_props
    assert props["uploads"].is_a?(Array)
    completed = props["uploads"].find { |u| u["status"] == "completed" }
    assert_equal "Feb 2026", completed["period_label"]
    assert_equal @admin.email, completed["uploaded_by"]
  end

  test "index filters by status" do
    log_in_as(@admin)
    get admin_trans_sl_factory_uploads_path, params: { status: "completed" }
    assert_response :success
    props = inertia_props
    assert props["uploads"].any?
    assert props["uploads"].all? { |u| u["status"] == "completed" }
  end

  test "index filters by year" do
    log_in_as(@admin)
    get admin_trans_sl_factory_uploads_path, params: { year: 2026 }
    assert_response :success
    props = inertia_props
    assert props["uploads"].all? { |u| u["period_year"] == 2026 }
  end

  test "index filters by month" do
    log_in_as(@admin)
    get admin_trans_sl_factory_uploads_path, params: { month: 2 }
    assert_response :success
    props = inertia_props
    assert props["uploads"].any?
    assert props["uploads"].all? { |u| u["period_month"] == 2 }
  end

  test "index searches by filename substring" do
    log_in_as(@admin)
    get admin_trans_sl_factory_uploads_path, params: { search: "February" }
    assert_response :success
    props = inertia_props
    assert props["uploads"].any?
    assert props["uploads"].all? { |u| u["filename"].include?("February") }
  end

  test "index sorts ascending by period" do
    log_in_as(@admin)
    get admin_trans_sl_factory_uploads_path, params: { sort: "period", direction: "asc" }
    assert_response :success
    props = inertia_props
    keys = props["uploads"].map { |u| [ u["period_year"], u["period_month"] ] }
    assert_equal keys.sort, keys
  end

  test "index returns pagination metadata" do
    log_in_as(@admin)
    get admin_trans_sl_factory_uploads_path
    assert_response :success
    props = inertia_props
    assert props.key?("total")
    assert props.key?("page")
    assert props.key?("per_page")
    assert_equal 25, props["per_page"]
    assert props["available_years"].include?(2026)
  end

  test "index rejects an invalid sort column and falls back to created_at" do
    log_in_as(@admin)
    get admin_trans_sl_factory_uploads_path, params: { sort: "injected; DROP TABLE", direction: "asc" }
    assert_response :success
    props = inertia_props
    assert_equal "created_at", props["sort"]
  end

  # --- preview --------------------------------------------------------------

  test "preview flags a new period as not replacing" do
    log_in_as(@admin)
    post preview_admin_trans_sl_factory_uploads_path, params: {
      files_metadata: [ { filename: "Detail SL July 2026.xlsx", period_year: 2026, period_month: 7, row_count: 5, value_net_sum: 999.0 } ]
    }, as: :json
    assert_response :success
    result = response.parsed_body.first
    refute result["will_replace"]
    assert_equal 0, result["existing_row_count"]
    assert_equal "Jul 2026", result["period_label"]
  end

  test "preview flags an existing period as a replacement with old totals" do
    log_in_as(@admin)
    post preview_admin_trans_sl_factory_uploads_path, params: {
      files_metadata: [ { filename: "Detail SL February 2026.xlsx", period_year: 2026, period_month: 2, row_count: 9, value_net_sum: 5.0 } ]
    }, as: :json
    assert_response :success
    result = response.parsed_body.first
    assert result["will_replace"]
    assert_equal 2, result["existing_row_count"]
    assert_in_delta 2500.0, result["existing_value_net_sum"], 0.0001
    refute result["is_unchanged"]
  end

  test "preview marks an identical re-upload as unchanged" do
    log_in_as(@admin)
    post preview_admin_trans_sl_factory_uploads_path, params: {
      files_metadata: [ { filename: "Detail SL February 2026.xlsx", period_year: 2026, period_month: 2, row_count: 2, value_net_sum: 2500.0 } ]
    }, as: :json
    assert_response :success
    assert response.parsed_body.first["is_unchanged"]
  end

  # --- create ---------------------------------------------------------------

  test "create stamps the in-file period and enqueues an import job" do
    log_in_as(@admin)
    path = SlFactoryFixture.build(period: "01.06.2026 TO 30.06.2026")
    file = Rack::Test::UploadedFile.new(
      path, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      true, original_filename: "Detail SL Renamed.xlsx"
    )

    assert_enqueued_with(job: TransSlFactoryImportJob) do
      assert_difference "TransSlFactoryUpload.count", 1 do
        post admin_trans_sl_factory_uploads_path, params: { files: [ file ] }
      end
    end

    assert_response :created
    upload = TransSlFactoryUpload.order(:created_at).last
    assert_equal 2026, upload.period_year
    assert_equal 6, upload.period_month
    assert_equal "pending", upload.status
  end

  test "create rejects a non-xlsx file" do
    log_in_as(@admin)
    file = Rack::Test::UploadedFile.new(StringIO.new("nope"), "text/plain", original_filename: "data.txt")
    post admin_trans_sl_factory_uploads_path, params: { files: [ file ] }
    assert_response :unprocessable_entity
  end

  # --- cancel ---------------------------------------------------------------

  test "cancel marks an in-flight upload as cancelled" do
    log_in_as(@admin)
    upload = trans_sl_factory_uploads(:pending)
    patch cancel_admin_trans_sl_factory_upload_path(upload)
    assert_response :ok
    assert_equal "cancelled", upload.reload.status
  end

  test "cancel leaves a completed upload untouched" do
    log_in_as(@admin)
    upload = trans_sl_factory_uploads(:completed)
    patch cancel_admin_trans_sl_factory_upload_path(upload)
    assert_response :ok
    assert_equal "completed", upload.reload.status
  end

  private
    def log_in_as(user)
      post login_path, params: { email: user.email, password: @password }
    end

    def inertia_props
      node = Nokogiri::HTML(response.body).at_css("[data-page]")
      node ? JSON.parse(node["data-page"])["props"] : {}
    end
end
