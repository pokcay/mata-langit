# frozen_string_literal: true

require "test_helper"

class MasterListingCostTest < ActiveSupport::TestCase
  test "valid fixture is valid" do
    assert master_listing_costs(:feb_row1).valid?
  end

  test "belongs to an upload" do
    assert_equal master_listing_uploads(:completed), master_listing_costs(:feb_row1).master_listing_upload
  end

  test "for_period scopes by year + month" do
    rows = MasterListingCost.for_period(2026, 2)
    assert_equal 2, rows.count
    assert rows.all? { |r| r.period_year == 2026 && r.period_month == 2 }
  end

  test "for_period returns nothing for an empty period" do
    assert_equal 0, MasterListingCost.for_period(2099, 12).count
  end
end
