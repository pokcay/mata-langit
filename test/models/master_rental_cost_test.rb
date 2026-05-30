# frozen_string_literal: true

require "test_helper"

class MasterRentalCostTest < ActiveSupport::TestCase
  test "valid fixture is valid" do
    assert master_rental_costs(:feb_row1).valid?
  end

  test "belongs to an upload" do
    assert_equal master_rental_uploads(:completed), master_rental_costs(:feb_row1).master_rental_upload
  end

  test "for_period scopes by year + month" do
    rows = MasterRentalCost.for_period(2026, 2)
    assert_equal 2, rows.count
    assert rows.all? { |r| r.period_year == 2026 && r.period_month == 2 }
  end

  test "for_period returns nothing for an empty period" do
    assert_equal 0, MasterRentalCost.for_period(2099, 12).count
  end
end
