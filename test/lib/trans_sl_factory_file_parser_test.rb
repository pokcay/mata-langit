# frozen_string_literal: true

require "test_helper"
require_relative "../support/sl_factory_fixture"

class TransSlFactoryFileParserTest < ActiveSupport::TestCase
  test "read_period extracts year + month from the PERIOD row start date" do
    path = SlFactoryFixture.build(period: "01.04.2026 TO 30.04.2026")
    assert_equal({ period_year: 2026, period_month: 4 },
                 TransSlFactoryFileParser.read_period(path))
  end

  test "read_period handles a different month" do
    path = SlFactoryFixture.build(period: "01.11.2025 TO 30.11.2025")
    assert_equal({ period_year: 2025, period_month: 11 },
                 TransSlFactoryFileParser.read_period(path))
  end

  test "read_period raises when the PERIOD row is missing" do
    path = SlFactoryFixture.build(include_period: false)
    assert_raises(ArgumentError) { TransSlFactoryFileParser.read_period(path) }
  end

  test "read_period raises when no detail sheet is present" do
    path = SlFactoryFixture.build(include_detail_sheet: false)
    assert_raises(ArgumentError) { TransSlFactoryFileParser.read_period(path) }
  end

  test "each_batch parses only real data rows, skipping totals and repeated headers" do
    path = SlFactoryFixture.build
    rows = collect(path)

    assert_equal SlFactoryFixture::DEFAULT_ROWS.length, rows.length
    assert_equal %w[SLT JKT2 Other], rows.map { |r| r[:shipping_point] }
  end

  test "each_batch preserves leading-zero identifiers as strings" do
    path = SlFactoryFixture.build
    rows = collect(path)
    assert_equal "0030000041", rows.first[:sold_to_party]
  end

  test "each_batch parses DD.MM.YYYY dates into Date objects" do
    path = SlFactoryFixture.build
    rows = collect(path)
    assert_equal Date.new(2026, 4, 7), rows.first[:date_so]
    assert_equal Date.new(2026, 4, 7), rows.first[:date_invoice]
  end

  test "each_batch casts numeric measures (including negatives) to floats" do
    path = SlFactoryFixture.build
    rows = collect(path)
    assert_in_delta 1000.5, rows.first[:value_net], 0.0001
    assert_in_delta(-500.75, rows.last[:value_net], 0.0001)
    assert_equal 100.0, rows.first[:pct_qty]
  end

  test "each_batch stamps upload id + period on every row" do
    path = SlFactoryFixture.build
    rows = collect(path, upload_id: 42, year: 2026, month: 4)
    assert rows.all? { |r| r[:trans_sl_factory_upload_id] == 42 }
    assert rows.all? { |r| r[:period_year] == 2026 && r[:period_month] == 4 }
  end

  test "value_net across the batch sums correctly (ignores totals row)" do
    path = SlFactoryFixture.build
    sum = collect(path).sum { |r| r[:value_net] }
    assert_in_delta SlFactoryFixture.expected_value_net_sum, sum, 0.0001
  end

  test "the detail sheet is selected over the (2) brand-code variant" do
    path = SlFactoryFixture.build
    rows = collect(path)
    refute rows.any? { |r| r[:shipping_point] == "DECOY" }
    refute rows.any? { |r| r[:brand] == "WRONG" }
  end

  private
    def collect(path, upload_id: 1, year: 2026, month: 4)
      out = []
      TransSlFactoryFileParser.each_batch(
        path, upload_id: upload_id, period_year: year, period_month: month
      ) { |batch| out.concat(batch) }
      out
    end
end
