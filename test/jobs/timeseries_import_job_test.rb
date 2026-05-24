# frozen_string_literal: true

require "test_helper"

class TimeseriesImportJobTest < ActiveJob::TestCase
  test "job returns early without touching DB when upload is already cancelled" do
    upload = timeseries_uploads(:pending)
    upload.update!(status: "cancelled")

    count_before = TimeseriesTransaction.count

    # perform_now should return early before touching any file or transactions
    TimeseriesImportJob.perform_now(upload.id)

    assert_equal count_before, TimeseriesTransaction.count
    assert_equal "cancelled", upload.reload.status
  end
end
