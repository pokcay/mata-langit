# frozen_string_literal: true

require "test_helper"

class TransSlFactoryTransactionTest < ActiveSupport::TestCase
  test "for_period scopes by year + month" do
    rows = TransSlFactoryTransaction.for_period(2026, 2)
    assert_equal 2, rows.count
    assert rows.all? { |r| r.period_year == 2026 && r.period_month == 2 }
  end

  test "for_period returns nothing for an empty period" do
    assert_equal 0, TransSlFactoryTransaction.for_period(2026, 12).count
  end
end
