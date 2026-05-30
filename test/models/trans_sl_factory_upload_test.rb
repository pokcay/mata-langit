# frozen_string_literal: true

require "test_helper"

class TransSlFactoryUploadTest < ActiveSupport::TestCase
  test "valid fixture is valid" do
    assert trans_sl_factory_uploads(:completed).valid?
  end

  test "requires filename and period" do
    upload = TransSlFactoryUpload.new(user: users(:admin), status: "pending")
    refute upload.valid?
    assert upload.errors[:filename].any?
    assert upload.errors[:period_year].any?
    assert upload.errors[:period_month].any?
  end

  test "rejects an invalid status" do
    upload = trans_sl_factory_uploads(:completed)
    upload.status = "bogus"
    refute upload.valid?
  end

  test "period_label formats month + year" do
    assert_equal "Feb 2026", trans_sl_factory_uploads(:completed).period_label
  end

  test "status predicate helpers" do
    assert trans_sl_factory_uploads(:completed).completed?
    assert trans_sl_factory_uploads(:pending).pending?
    assert trans_sl_factory_uploads(:pending).in_flight?
    refute trans_sl_factory_uploads(:completed).in_flight?
  end

  test "deleting an upload deletes its transactions" do
    upload = trans_sl_factory_uploads(:completed)
    assert_difference "TransSlFactoryTransaction.count", -2 do
      upload.destroy
    end
  end
end
