# frozen_string_literal: true

require "test_helper"

class TimeseriesUploadChannelTest < ActionCable::Channel::TestCase
  test "subscribes and immediately transmits current status" do
    upload = timeseries_uploads(:pending)
    stub_connection current_user: users(:admin)

    subscribe upload_id: upload.id

    assert subscription.confirmed?
    assert_has_stream_for upload
    assert_equal 1, transmissions.length
    assert_equal "status_update", transmissions.last["type"]
    assert_equal upload.id, transmissions.last["upload_id"]
    assert_equal "pending", transmissions.last["status"]
  end

  test "subscription reflects cancelled status" do
    upload = timeseries_uploads(:cancelled)
    stub_connection current_user: users(:admin)

    subscribe upload_id: upload.id

    assert subscription.confirmed?
    assert_equal "cancelled", transmissions.last["status"]
  end

  test "rejects subscription for upload owned by a different user" do
    upload = timeseries_uploads(:pending)
    # upload is owned by users(:admin); connecting as users(:one) should be rejected
    stub_connection current_user: users(:one)

    subscribe upload_id: upload.id

    assert subscription.rejected?
  end

  test "rejects subscription for non-existent upload" do
    stub_connection current_user: users(:admin)

    subscribe upload_id: 0

    assert subscription.rejected?
  end
end
