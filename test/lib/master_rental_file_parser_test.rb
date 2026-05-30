# frozen_string_literal: true

require "test_helper"
require_relative "../support/master_rental_fixture"

class MasterRentalFileParserTest < ActiveSupport::TestCase
  test "read_period extracts year + month from the A1 title cell" do
    path = MasterRentalFixture.build(title: "MAY - 2026")
    assert_equal({ period_year: 2026, period_month: 5 },
                 MasterRentalFileParser.read_period(path))
  end

  test "read_period handles full month names" do
    path = MasterRentalFixture.build(title: "NOVEMBER - 2025")
    assert_equal({ period_year: 2025, period_month: 11 },
                 MasterRentalFileParser.read_period(path))
  end

  test "read_period is case-insensitive" do
    path = MasterRentalFixture.build(title: "jan - 2027")
    assert_equal({ period_year: 2027, period_month: 1 },
                 MasterRentalFileParser.read_period(path))
  end

  test "read_period raises when the title is unparseable" do
    path = MasterRentalFixture.build(title: "not a period")
    assert_raises(ArgumentError) { MasterRentalFileParser.read_period(path) }
  end

  test "read_period raises when the RENTAL sheet is missing" do
    path = MasterRentalFixture.build(sheet_name: "OTHER")
    assert_raises(ArgumentError) { MasterRentalFileParser.read_period(path) }
  end

  test "each_batch parses only real data rows, skipping the blank-region row" do
    path = MasterRentalFixture.build
    rows = collect(path)

    assert_equal MasterRentalFixture::DEFAULT_ROWS.length, rows.length
    assert_equal %w[RegCen RegTim RegBar], rows.map { |r| r[:region] }
    refute rows.any? { |r| r[:outlet_code] == "BLANK0001" }
  end

  test "each_batch maps all data columns and ignores the NO column" do
    path = MasterRentalFixture.build
    first = collect(path).first

    assert_equal "RegCen", first[:region]
    assert_equal "Jawa Barat", first[:area]
    assert_equal "Cahaya Sejahtera Waluya, Bandung", first[:dist_parent]
    assert_equal "Cahaya Sejahtera Waluya, Bandung", first[:dist_child]
    assert_equal "RCJBB000357", first[:outlet_code]
    assert_equal "DAYTI", first[:outlet_name]
    assert_equal "Back Wall 1", first[:rental]
    refute first.key?(:no)
  end

  test "each_batch casts COST to an integer" do
    path = MasterRentalFixture.build
    first = collect(path).first
    assert_equal 2_500_000, first[:cost]
    assert_kind_of Integer, first[:cost]
  end

  test "each_batch stamps upload id + period on every row" do
    path = MasterRentalFixture.build
    rows = collect(path, upload_id: 42, year: 2026, month: 5)
    assert rows.all? { |r| r[:master_rental_upload_id] == 42 }
    assert rows.all? { |r| r[:period_year] == 2026 && r[:period_month] == 5 }
  end

  test "COST across the batch sums correctly (ignores skipped rows)" do
    path = MasterRentalFixture.build
    sum = collect(path).sum { |r| r[:cost] }
    assert_equal MasterRentalFixture.expected_total_cost, sum
  end

  private
    def collect(path, upload_id: 1, year: 2026, month: 5)
      out = []
      MasterRentalFileParser.each_batch(
        path, upload_id: upload_id, period_year: year, period_month: month
      ) { |batch| out.concat(batch) }
      out
    end
end
