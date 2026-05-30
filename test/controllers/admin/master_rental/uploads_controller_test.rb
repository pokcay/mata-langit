# frozen_string_literal: true

require "test_helper"
require_relative "../../../support/master_rental_fixture"

class Admin::MasterRental::UploadsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin    = users(:admin)
    @password = "password"
  end

  # --- index ----------------------------------------------------------------

  test "unauthenticated users cannot access the uploads index" do
    get admin_master_rental_uploads_path
    assert_redirected_to login_path
  end

  test "non-admin users are redirected" do
    log_in_as(users(:one))
    get admin_master_rental_uploads_path
    assert_redirected_to root_path
  end

  test "admin sees the uploads index with serialized rows" do
    log_in_as(@admin)
    get admin_master_rental_uploads_path
    assert_response :success
    props = inertia_props
    assert props["uploads"].is_a?(Array)
    completed = props["uploads"].find { |u| u["status"] == "completed" }
    assert_equal "Feb 2026", completed["period_label"]
    assert_equal 6_500_000, completed["total_cost"]
    assert_equal @admin.email, completed["uploaded_by"]
    assert props["available_years"].include?(2026)
    assert_equal 25, props["per_page"]
    assert_equal 1, props["page"]
    assert_equal "created_at", props["sort"]
    assert_equal "desc", props["direction"]
  end

  test "index paginates at 25 rows per page" do
    log_in_as(@admin)
    baseline = MasterRentalUpload.count
    30.times do |i|
      MasterRentalUpload.create!(
        user: @admin, filename: "Bulk #{i}.xlsx",
        period_year: 2025, period_month: (i % 12) + 1,
        status: "completed", row_count: i, total_cost: i * 1000
      )
    end
    total = baseline + 30

    get admin_master_rental_uploads_path
    props = inertia_props
    assert_equal total, props["total"]
    assert_equal 25, props["uploads"].length

    get admin_master_rental_uploads_path(page: 2)
    props = inertia_props
    assert_equal 2, props["page"]
    assert_equal total - 25, props["uploads"].length
  end

  test "index filters by year, month and status" do
    log_in_as(@admin)
    get admin_master_rental_uploads_path(month: 2, status: "completed")
    props = inertia_props
    assert_equal 1, props["total"]
    assert_equal "Feb 2026", props["uploads"].first["period_label"]
    assert_equal "completed", props["filters"]["status"]
    assert_equal "2", props["filters"]["month"].to_s
  end

  test "index searches filename case-insensitively" do
    log_in_as(@admin)
    get admin_master_rental_uploads_path(search: "mar")
    props = inertia_props
    assert_equal 1, props["total"]
    assert_equal "Rental Cost 2026 - MAR.xlsx", props["uploads"].first["filename"]
  end

  test "index sorts by total_cost descending" do
    log_in_as(@admin)
    get admin_master_rental_uploads_path(sort: "total_cost", direction: "desc")
    props = inertia_props
    costs = props["uploads"].map { |u| u["total_cost"].to_i }
    assert_equal costs.sort.reverse, costs
    assert_equal "total_cost", props["sort"]
    assert_equal "desc", props["direction"]
  end

  test "index sorts by composite period ascending" do
    log_in_as(@admin)
    get admin_master_rental_uploads_path(sort: "period", direction: "asc")
    props = inertia_props
    pairs = props["uploads"].map { |u| [ u["period_year"], u["period_month"] ] }
    assert_equal pairs.sort, pairs
  end

  # --- preview --------------------------------------------------------------

  test "preview flags a new period as not replacing" do
    log_in_as(@admin)
    post preview_admin_master_rental_uploads_path, params: {
      files_metadata: [ { filename: "Rental Cost 2026 - JUL.xlsx", period_year: 2026, period_month: 7, row_count: 5, total_cost: 999_000 } ]
    }, as: :json
    assert_response :success
    result = response.parsed_body.first
    refute result["will_replace"]
    assert_equal 0, result["existing_row_count"]
    assert_equal "Jul 2026", result["period_label"]
  end

  test "preview flags an existing period as a replacement with old totals" do
    log_in_as(@admin)
    post preview_admin_master_rental_uploads_path, params: {
      files_metadata: [ { filename: "Rental Cost 2026 - FEB.xlsx", period_year: 2026, period_month: 2, row_count: 9, total_cost: 5 } ]
    }, as: :json
    assert_response :success
    result = response.parsed_body.first
    assert result["will_replace"]
    assert_equal 2, result["existing_row_count"]
    assert_equal 6_500_000, result["existing_total_cost"]
    refute result["is_unchanged"]
  end

  test "preview marks an identical re-upload as unchanged" do
    log_in_as(@admin)
    post preview_admin_master_rental_uploads_path, params: {
      files_metadata: [ { filename: "Rental Cost 2026 - FEB.xlsx", period_year: 2026, period_month: 2, row_count: 2, total_cost: 6_500_000 } ]
    }, as: :json
    assert_response :success
    assert response.parsed_body.first["is_unchanged"]
  end

  test "preview rejects an invalid period" do
    log_in_as(@admin)
    post preview_admin_master_rental_uploads_path, params: {
      files_metadata: [ { filename: "bad.xlsx", period_year: 2026, period_month: 13, row_count: 1, total_cost: 1 } ]
    }, as: :json
    assert_response :success
    assert response.parsed_body.first["error"].present?
  end

  # --- create ---------------------------------------------------------------

  test "create stamps the in-file period and enqueues an import job" do
    log_in_as(@admin)
    path = MasterRentalFixture.build(title: "JUNE - 2026")
    file = Rack::Test::UploadedFile.new(
      path, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      true, original_filename: "Rental Cost Renamed.xlsx"
    )

    assert_enqueued_with(job: MasterRentalImportJob) do
      assert_difference "MasterRentalUpload.count", 1 do
        post admin_master_rental_uploads_path, params: { files: [ file ] }
      end
    end

    assert_response :created
    upload = MasterRentalUpload.order(:created_at).last
    assert_equal 2026, upload.period_year
    assert_equal 6, upload.period_month
    assert_equal "pending", upload.status
  end

  test "create rejects a non-xlsx file" do
    log_in_as(@admin)
    file = Rack::Test::UploadedFile.new(StringIO.new("nope"), "text/plain", original_filename: "data.txt")
    post admin_master_rental_uploads_path, params: { files: [ file ] }
    assert_response :unprocessable_entity
  end

  # --- cancel ---------------------------------------------------------------

  test "cancel marks an in-flight upload as cancelled" do
    log_in_as(@admin)
    upload = master_rental_uploads(:pending)
    patch cancel_admin_master_rental_upload_path(upload)
    assert_response :ok
    assert_equal "cancelled", upload.reload.status
  end

  test "cancel leaves a completed upload untouched" do
    log_in_as(@admin)
    upload = master_rental_uploads(:completed)
    patch cancel_admin_master_rental_upload_path(upload)
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
