# frozen_string_literal: true

# Adds B-tree indexes on frequently-used pivot filter and row/column dimension columns
# in timeseries_transactions.  All use algorithm: :concurrently so the 45M-row table
# is not locked during creation.
#
# Impact: queries that combine the FY period-expansion WHERE clause with extra dimension
# filters (channel_code, flag_program, brand_name, etc.) go from 100+ seconds → 1-3 s
# because PostgreSQL can do Bitmap AND of multiple index scans instead of reading every
# matched heap row to evaluate the unindexed filter conditions.
class AddPivotFilterIndexesToTimeseriesTransactions < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    # Most critical — channel_code is a common filter AND a row/col dimension (8 values).
    # flag_program is the only "filter-only" field and is almost always used as a filter.
    add_index :timeseries_transactions, :channel_code,
              algorithm: :concurrently,
              if_not_exists: true

    add_index :timeseries_transactions, :flag_program,
              algorithm: :concurrently,
              if_not_exists: true

    # Commonly used as row/col dimensions and filters
    add_index :timeseries_transactions, :brand_group_name,
              algorithm: :concurrently,
              if_not_exists: true

    add_index :timeseries_transactions, :brand_name,
              algorithm: :concurrently,
              if_not_exists: true

    add_index :timeseries_transactions, :area_name,
              algorithm: :concurrently,
              if_not_exists: true

    add_index :timeseries_transactions, :region_name,
              algorithm: :concurrently,
              if_not_exists: true

    add_index :timeseries_transactions, :channel_sub_code,
              algorithm: :concurrently,
              if_not_exists: true
  end
end
