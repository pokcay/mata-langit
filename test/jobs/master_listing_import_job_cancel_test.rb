# frozen_string_literal: true

require "test_helper"
require "minitest/mock"
require_relative "../support/master_listing_fixture"

# Proves the cancel-during-import rollback guarantee: once a cancel signal lands
# mid-import, every row written in that session is rolled back and a prior
# upload's data for the same period is preserved exactly.
#
# This class runs WITHOUT transactional fixtures because the cancel must be
# committed on a separate connection — mirroring the real PATCH /cancel request
# — so that the job's in-transaction `upload.reload` can observe it. (A cancel
# committed inside the job's own transaction would be rolled back along with it.)
class MasterListingImportJobCancelTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  FILENAMES = %w[cancel-baseline.xlsx cancel-replacement.xlsx].freeze

  setup { @admin = users(:admin) }

  teardown do
    ids = MasterListingUpload.where(filename: FILENAMES).pluck(:id)
    MasterListingCost.where(master_listing_upload_id: ids).delete_all
    MasterListingUpload.where(id: ids).find_each do |u|
      u.file.purge
      u.destroy
    end
  end

  test "cancelling mid-import rolls back the session and preserves prior-period data" do
    baseline = make_upload("cancel-baseline.xlsx")
    MasterListingImportJob.perform_now(baseline.id)
    baseline_count = MasterListingCost.for_period(2026, 5).count
    assert baseline_count > 0
    assert_equal "completed", baseline.reload.status

    replacement = make_upload("cancel-replacement.xlsx")

    # On the first inserted batch, commit a cancel from a separate connection,
    # exactly as the PATCH /cancel endpoint would in production.
    flipped = false
    stub = lambda do |_batch|
      unless flipped
        flipped = true
        Thread.new do
          MasterListingUpload.where(id: replacement.id).update_all(status: "cancelled")
        ensure
          ActiveRecord::Base.connection_pool.release_connection
        end.join
      end
      0
    end

    MasterListingCost.stub(:insert_all, stub) do
      MasterListingImportJob.perform_now(replacement.id)
    end

    assert_equal "cancelled", replacement.reload.status
    # Prior upload's rows fully preserved; the cancelled session wrote nothing.
    assert_equal baseline_count, MasterListingCost.for_period(2026, 5).count
    assert_equal baseline_count,
                 MasterListingCost.where(master_listing_upload_id: baseline.id).count
    assert_equal 0,
                 MasterListingCost.where(master_listing_upload_id: replacement.id).count
  end

  private
    def make_upload(filename, year: 2026, month: 5)
      path = MasterListingFixture.build(title: "MAY - #{year}")
      upload = MasterListingUpload.create!(
        user: @admin, filename: filename,
        period_year: year, period_month: month, status: "pending"
      )
      upload.file.attach(
        io: File.open(path, "rb"), filename: filename,
        content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      upload
    end
end
