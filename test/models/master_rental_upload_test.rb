# frozen_string_literal: true

require "test_helper"

class MasterRentalUploadTest < ActiveSupport::TestCase
  test "valid fixture is valid" do
    assert master_rental_uploads(:completed).valid?
  end

  test "requires filename and period" do
    upload = MasterRentalUpload.new(user: users(:admin), status: "pending")
    refute upload.valid?
    assert upload.errors[:filename].any?
    assert upload.errors[:period_year].any?
    assert upload.errors[:period_month].any?
  end

  test "rejects an invalid status" do
    upload = master_rental_uploads(:completed)
    upload.status = "bogus"
    refute upload.valid?
  end

  test "period_label formats month + year" do
    assert_equal "Feb 2026", master_rental_uploads(:completed).period_label
  end

  test "status predicate helpers" do
    assert master_rental_uploads(:completed).completed?
    assert master_rental_uploads(:pending).pending?
    assert master_rental_uploads(:pending).in_flight?
    refute master_rental_uploads(:completed).in_flight?
  end

  test "deleting an upload deletes its rental costs" do
    upload = master_rental_uploads(:completed)
    assert_difference "MasterRentalCost.count", -2 do
      upload.destroy
    end
  end
end
