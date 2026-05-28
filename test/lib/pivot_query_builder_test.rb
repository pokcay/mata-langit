# frozen_string_literal: true

require "test_helper"

# Unit tests for PivotQueryBuilder correctness.
#
# The fixture in test/fixtures/timeseries_transactions.yml is designed so that
# the OLD (buggy) "sum per-row totals in Ruby" approach gives demonstrably
# wrong answers for AVG / MIN / MAX / active_outlet — and the new behavior
# (separate SQL aggregate over the full filtered set) gives the right ones.
class PivotQueryBuilderTest < ActiveSupport::TestCase
  # Period filter that scopes the fixture to FY2526, April 2025.
  PERIOD = { "fys" => [ "FY2526" ], "months" => [ 4 ], "start_day" => 1, "end_day" => "eom" }.freeze

  # ── grand_total: separate SQL aggregate, NOT sum of per-row totals ──────────

  test "grand_total for SUM is the actual sum across all rows" do
    result = PivotQueryBuilder.new(
      row_fields: [ "region" ], col_fields: [],
      measurement: "netto_wise", agg_func: "sum",
      period_filter: PERIOD
    ).call

    # 100 + 300 + 200 + 400 + 500 + 600 = 2100
    assert_in_delta 2100.0, result[:grand_total], 0.01
  end

  test "grand_total for AVG is the overall mean, NOT sum of per-group means" do
    result = PivotQueryBuilder.new(
      row_fields: [ "region" ], col_fields: [],
      measurement: "netto_wise", agg_func: "avg",
      period_filter: PERIOD
    ).call

    # Correct: AVG of (100,300,200,400,500,600) = 2100/6 = 350.0
    # Buggy:   AVG(JAVA)=200 + AVG(SUMA)=500 = 700
    assert_in_delta 350.0, result[:grand_total], 0.01
    refute_in_delta 700.0, result[:grand_total], 1.0,
      "grand_total must not be the sum of per-group averages"
  end

  test "grand_total for MIN is the overall minimum, NOT sum of per-group mins" do
    result = PivotQueryBuilder.new(
      row_fields: [ "region" ], col_fields: [],
      measurement: "netto_wise", agg_func: "min",
      period_filter: PERIOD
    ).call

    # Correct: MIN across all 6 rows = 100.0
    # Buggy:   MIN(JAVA)=100 + MIN(SUMA)=400 = 500
    assert_in_delta 100.0, result[:grand_total], 0.01
  end

  test "grand_total for MAX is the overall maximum, NOT sum of per-group maxes" do
    result = PivotQueryBuilder.new(
      row_fields: [ "region" ], col_fields: [],
      measurement: "netto_wise", agg_func: "max",
      period_filter: PERIOD
    ).call

    # Correct: MAX across all 6 rows = 600.0
    # Buggy:   MAX(JAVA)=300 + MAX(SUMA)=600 = 900
    assert_in_delta 600.0, result[:grand_total], 0.01
  end

  test "grand_total for active_outlet is COUNT(DISTINCT) overall, NOT sum of per-group distinct counts" do
    result = PivotQueryBuilder.new(
      row_fields: [ "region" ], col_fields: [],
      measurement: "active_outlet", agg_func: "sum",
      period_filter: PERIOD
    ).call

    # Correct: DISTINCT outlets across all rows = {O1, O2, O3} = 3
    # Buggy:   distinct(JAVA)=2 + distinct(SUMA)=2 = 4 (O1 double-counted)
    assert_in_delta 3.0, result[:grand_total], 0.01,
      "active_outlet must NOT double-count outlets that appear in multiple row groups"
  end

  # ── col_totals: separate SQL aggregate per col_combo ──────────────────────────

  test "col_totals for SUM match per-column sums across all rows" do
    result = PivotQueryBuilder.new(
      row_fields: [ "region" ], col_fields: [ "brand_name" ],
      measurement: "netto_wise", agg_func: "sum",
      period_filter: PERIOD
    ).call

    # AAA: 100 + 300 + 400 = 800;  BBB: 200 + 500 + 600 = 1300
    levels   = result[:column_levels].first  # ["AAA", "BBB"]
    totals   = result[:col_totals]
    aaa_idx  = levels.index("AAA")
    bbb_idx  = levels.index("BBB")
    assert_in_delta  800.0, totals[aaa_idx], 0.01
    assert_in_delta 1300.0, totals[bbb_idx], 0.01
  end

  test "col_totals for AVG are per-column means, NOT sum of per-row column values" do
    result = PivotQueryBuilder.new(
      row_fields: [ "region" ], col_fields: [ "brand_name" ],
      measurement: "netto_wise", agg_func: "avg",
      period_filter: PERIOD
    ).call

    levels   = result[:column_levels].first
    totals   = result[:col_totals]
    aaa_idx  = levels.index("AAA")
    bbb_idx  = levels.index("BBB")

    # Correct: AVG(AAA rows: 100,300,400) = 266.666…
    #          AVG(BBB rows: 200,500,600) = 433.333…
    # Buggy:   AVG_JAVA_AAA(200) + AVG_SUMA_AAA(400) = 600 for AAA  (sum of per-row avgs)
    #          AVG_JAVA_BBB(200) + AVG_SUMA_BBB(550) = 750 for BBB
    assert_in_delta 266.6667, totals[aaa_idx], 0.01
    assert_in_delta 433.3333, totals[bbb_idx], 0.01
    refute_in_delta 600.0,    totals[aaa_idx], 1.0,
      "col_totals must not be the sum of per-row column averages"
  end

  test "col_totals for MIN are per-column minima, NOT sum of per-row column minima" do
    result = PivotQueryBuilder.new(
      row_fields: [ "region" ], col_fields: [ "brand_name" ],
      measurement: "netto_wise", agg_func: "min",
      period_filter: PERIOD
    ).call

    levels   = result[:column_levels].first
    totals   = result[:col_totals]
    aaa_idx  = levels.index("AAA")
    bbb_idx  = levels.index("BBB")

    # Correct: MIN(AAA rows) = 100;  MIN(BBB rows) = 200
    # Buggy:   MIN_JAVA_AAA(100) + MIN_SUMA_AAA(400) = 500 for AAA
    assert_in_delta 100.0, totals[aaa_idx], 0.01
    assert_in_delta 200.0, totals[bbb_idx], 0.01
  end

  test "col_totals for active_outlet are per-column distinct counts, NOT sum of per-row distinct counts" do
    result = PivotQueryBuilder.new(
      row_fields: [ "region" ], col_fields: [ "brand_name" ],
      measurement: "active_outlet", agg_func: "sum",
      period_filter: PERIOD
    ).call

    levels   = result[:column_levels].first
    totals   = result[:col_totals]
    aaa_idx  = levels.index("AAA")
    bbb_idx  = levels.index("BBB")

    # Correct: distinct outlets for AAA = {O1} = 1
    #          distinct outlets for BBB = {O2, O3} = 2
    # Buggy:   1(JAVA_AAA: {O1}) + 1(SUMA_AAA: {O1}) = 2 for AAA (O1 double-counted)
    assert_in_delta 1.0, totals[aaa_idx], 0.01,
      "active_outlet col_total must not double-count outlets across row groups"
    assert_in_delta 2.0, totals[bbb_idx], 0.01
  end
end
