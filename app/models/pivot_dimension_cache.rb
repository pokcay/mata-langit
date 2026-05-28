# frozen_string_literal: true

# Persistent, DB-backed catalog of distinct values for pivot dimension fields.
# Populated by PivotCatalogRefreshJob. No TTL — persists until a manual refresh.
#
# One row per field_name.  `values` is a JSONB array of up to 500 distinct strings.
# `status`: "empty" | "building" | "ready" | "error"
class PivotDimensionCache < ApplicationRecord
  # All fields that appear in the Pivot field picker.
  FIELD_NAMES = (PivotQueryBuilder::ALLOWED_DIMENSION_FIELDS.to_a +
                 PivotQueryBuilder::FILTER_ONLY_FIELDS.to_a).sort.freeze

  # Only these fields are built during Refresh — the ones most useful as filters
  # and with low enough cardinality to pre-load quickly.
  REFRESH_FIELDS = %w[FY region channel_code period_month].freeze

  validates :field_name, presence: true, uniqueness: true
  validates :status, inclusion: { in: %w[empty building ready error] }

  # Returns a Hash of { field_name => [value, …] } for all ready fields.
  def self.catalog_hash
    where(status: "ready").pluck(:field_name, :values).to_h
  end

  # Summary status scoped to REFRESH_FIELDS.
  def self.refresh_status
    records     = where(field_name: REFRESH_FIELDS).index_by(&:field_name)
    total       = REFRESH_FIELDS.size
    ready       = records.values.count { |r| r.status == "ready" }
    building    = records.values.any?  { |r| r.status == "building" }
    refreshed_at = records.values.filter_map(&:refreshed_at).min

    {
      total:        total,
      ready:        ready,
      building:     building,
      refreshed_at: refreshed_at&.iso8601,
      pct:          total > 0 ? (ready * 100 / total) : 0
    }
  end
end
