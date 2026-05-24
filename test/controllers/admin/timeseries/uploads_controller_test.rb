# frozen_string_literal: true

require "test_helper"

class Admin::Timeseries::UploadsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin    = users(:admin)
    @password = "password"
  end

  # ---------------------------------------------------------------------------
  # index
  # ---------------------------------------------------------------------------

  test "unauthenticated users cannot access uploads index" do
    get admin_timeseries_uploads_path
    assert_redirected_to login_path
  end

  test "admin can access uploads index" do
    log_in_as(@admin)
    get admin_timeseries_uploads_path
    assert_response :success
  end

  test "index filters by status" do
    log_in_as(@admin)
    get admin_timeseries_uploads_path, params: { status: "completed" }
    assert_response :success
    props = inertia_props
    assert props["uploads"].all? { |u| u["status"] == "completed" }
  end

  test "index filters by region" do
    log_in_as(@admin)
    get admin_timeseries_uploads_path, params: { region: "Jkt1" }
    assert_response :success
    props = inertia_props
    assert props["uploads"].all? { |u| u["region"] == "Jkt1" }
  end

  test "index searches by filename substring" do
    log_in_as(@admin)
    get admin_timeseries_uploads_path, params: { search: "RegCen" }
    assert_response :success
    props = inertia_props
    assert props["uploads"].all? { |u| u["filename"].include?("RegCen") }
  end

  test "index sorts ascending by region" do
    log_in_as(@admin)
    get admin_timeseries_uploads_path, params: { sort: "region", direction: "asc" }
    assert_response :success
    props = inertia_props
    regions = props["uploads"].map { |u| u["region"] }
    assert_equal regions.sort, regions
  end

  test "index returns pagination metadata" do
    log_in_as(@admin)
    get admin_timeseries_uploads_path
    assert_response :success
    props = inertia_props
    assert props.key?("total")
    assert props.key?("page")
    assert props.key?("per_page")
    assert_equal 25, props["per_page"]
  end

  test "index rejects invalid sort column and falls back to created_at" do
    log_in_as(@admin)
    get admin_timeseries_uploads_path, params: { sort: "injected; DROP TABLE", direction: "asc" }
    assert_response :success
    props = inertia_props
    assert_equal "created_at", props["sort"]
  end

  # ---------------------------------------------------------------------------
  # cancel
  # ---------------------------------------------------------------------------

  test "cancel marks a pending upload as cancelled" do
    log_in_as(@admin)
    upload = timeseries_uploads(:pending)
    patch cancel_admin_timeseries_upload_path(upload)
    assert_response :ok
    assert_equal "cancelled", upload.reload.status
  end

  test "cancel marks a processing upload as cancelled" do
    log_in_as(@admin)
    upload = timeseries_uploads(:processing)
    patch cancel_admin_timeseries_upload_path(upload)
    assert_response :ok
    assert_equal "cancelled", upload.reload.status
  end

  test "cancel is a no-op for a completed upload" do
    log_in_as(@admin)
    upload = timeseries_uploads(:completed)
    patch cancel_admin_timeseries_upload_path(upload)
    assert_response :ok
    assert_equal "completed", upload.reload.status
  end

  test "cancel is a no-op for an already-cancelled upload" do
    log_in_as(@admin)
    upload = timeseries_uploads(:cancelled)
    patch cancel_admin_timeseries_upload_path(upload)
    assert_response :ok
    assert_equal "cancelled", upload.reload.status
  end

  test "unauthenticated users cannot cancel" do
    upload = timeseries_uploads(:pending)
    patch cancel_admin_timeseries_upload_path(upload)
    assert_redirected_to login_path
    assert_equal "pending", upload.reload.status
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
