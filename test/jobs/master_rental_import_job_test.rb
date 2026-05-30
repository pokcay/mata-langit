# frozen_string_literal: true

require "test_helper"
require "minitest/mock"
require_relative "../support/master_rental_fixture"

class MasterRentalImportJobTest < ActiveSupport::TestCase
  test "returns early without touching the DB when the upload is cancelled" do
    upload = build_upload(status: "cancelled")
    before = MasterRentalCost.count
    MasterRentalImportJob.perform_now(upload.id)
    assert_equal before, MasterRentalCost.count
    assert_equal "cancelled", upload.reload.status
  end

  test "imports rows and aggregates row_count + total_cost" do
    upload = build_upload

    MasterRentalImportJob.perform_now(upload.id)
    upload.reload

    assert_equal "completed", upload.status
    assert_equal MasterRentalFixture::DEFAULT_ROWS.length, upload.row_count
    assert_equal MasterRentalFixture.expected_total_cost, upload.total_cost
    assert_equal upload.row_count,
                 MasterRentalCost.where(master_rental_upload_id: upload.id).count
    assert_not_nil upload.imported_at
  end

  test "replacing the same period deletes prior rows and sets replaced_row_count" do
    first = build_upload
    MasterRentalImportJob.perform_now(first.id)
    first_rows = MasterRentalCost.for_period(2026, 5).count
    assert first_rows > 0

    second = build_upload
    MasterRentalImportJob.perform_now(second.id)
    second.reload

    assert_equal "completed", second.status
    assert_equal first_rows, second.replaced_row_count
    # Only the second upload's rows remain for the period.
    assert_equal second.row_count, MasterRentalCost.for_period(2026, 5).count
    assert_equal 0,
                 MasterRentalCost.where(master_rental_upload_id: first.id).count
    # The superseded upload record is destroyed.
    refute MasterRentalUpload.exists?(first.id)
  end

  test "an error mid-import rolls back the session and preserves prior-period data" do
    first = build_upload
    MasterRentalImportJob.perform_now(first.id)
    baseline = MasterRentalCost.for_period(2026, 5).count
    assert baseline > 0

    second = build_upload
    MasterRentalCost.stub(:insert_all, ->(*) { raise "boom" }) do
      assert_raises(RuntimeError) { MasterRentalImportJob.perform_now(second.id) }
    end
    second.reload

    assert_equal "failed", second.status
    assert_equal "boom", second.error_message
    # The prior upload's rows are intact: the delete + insert rolled back atomically.
    assert_equal baseline, MasterRentalCost.for_period(2026, 5).count
    assert_equal baseline, MasterRentalCost.where(master_rental_upload_id: first.id).count
    assert_equal 0, MasterRentalCost.where(master_rental_upload_id: second.id).count
  end

  private
    def build_upload(status: "pending", year: 2026, month: 5)
      path = MasterRentalFixture.build(title: "MAY - #{year}")
      upload = MasterRentalUpload.create!(
        user:         users(:admin),
        filename:     "Rental Cost #{year} - MAY.xlsx",
        period_year:  year,
        period_month: month,
        status:       status
      )
      upload.file.attach(
        io:           File.open(path, "rb"),
        filename:     upload.filename,
        content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      upload
    end
end
