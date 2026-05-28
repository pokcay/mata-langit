# frozen_string_literal: true

# Adds a composite index on (period_year, period_month) so the FY expansion in
# PivotQueryBuilder#expand_fy_to_year_month can use an index scan even when no
# region filter is supplied.
#
# The existing index `(region, period_year, period_month)` leads on `region`,
# so the planner cannot use it for FY-only filters. This migration closes that
# gap.
#
# Built with algorithm: :concurrently so the 45M-row timeseries_transactions
# table is not locked during creation.
class AddPeriodYearMonthIndexToTimeseriesTransactions < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    add_index :timeseries_transactions, [ :period_year, :period_month ],
              algorithm: :concurrently,
              if_not_exists: true
  end
end
