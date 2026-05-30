# frozen_string_literal: true

require "test_helper"
require "minitest/mock"
require_relative "../support/sl_factory_fixture"

class TransSlFactoryImportJobTest < ActiveSupport::TestCase
  test "returns early without touching the DB when the upload is cancelled" do
    upload = build_upload(status: "cancelled")
    before = TransSlFactoryTransaction.count
    TransSlFactoryImportJob.perform_now(upload.id)
    assert_equal before, TransSlFactoryTransaction.count
    assert_equal "cancelled", upload.reload.status
  end

  test "imports rows and aggregates row_count + value_net_sum" do
    upload = build_upload

    TransSlFactoryImportJob.perform_now(upload.id)
    upload.reload

    assert_equal "completed", upload.status
    assert_equal SlFactoryFixture::DEFAULT_ROWS.length, upload.row_count
    assert_in_delta SlFactoryFixture.expected_value_net_sum, upload.value_net_sum.to_f, 0.0001
    assert_equal upload.row_count,
                 TransSlFactoryTransaction.where(trans_sl_factory_upload_id: upload.id).count
    assert_not_nil upload.imported_at
  end

  test "replacing the same period deletes prior rows and sets replaced_row_count" do
    first = build_upload
    TransSlFactoryImportJob.perform_now(first.id)
    first_rows = TransSlFactoryTransaction.for_period(2026, 4).count
    assert first_rows > 0

    second = build_upload
    TransSlFactoryImportJob.perform_now(second.id)
    second.reload

    assert_equal "completed", second.status
    assert_equal first_rows, second.replaced_row_count
    # Only the second upload's rows remain for the period.
    assert_equal second.row_count, TransSlFactoryTransaction.for_period(2026, 4).count
    assert_equal 0,
                 TransSlFactoryTransaction.where(trans_sl_factory_upload_id: first.id).count
  end

  test "an error mid-import rolls back the session and preserves prior-period data" do
    first = build_upload
    TransSlFactoryImportJob.perform_now(first.id)
    baseline = TransSlFactoryTransaction.for_period(2026, 4).count
    assert baseline > 0

    second = build_upload
    TransSlFactoryTransaction.stub(:insert_all, ->(*) { raise "boom" }) do
      assert_raises(RuntimeError) { TransSlFactoryImportJob.perform_now(second.id) }
    end
    second.reload

    assert_equal "failed", second.status
    assert_equal "boom", second.error_message
    # The prior upload's rows are intact: the delete + insert rolled back atomically.
    assert_equal baseline, TransSlFactoryTransaction.for_period(2026, 4).count
    assert_equal baseline, TransSlFactoryTransaction.where(trans_sl_factory_upload_id: first.id).count
    assert_equal 0, TransSlFactoryTransaction.where(trans_sl_factory_upload_id: second.id).count
  end

  private
    def build_upload(status: "pending", year: 2026, month: 4)
      path = SlFactoryFixture.build
      upload = TransSlFactoryUpload.create!(
        user:         users(:admin),
        filename:     "Detail SL Test #{month} #{year}.xlsx",
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
