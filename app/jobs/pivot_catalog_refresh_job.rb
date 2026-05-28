# frozen_string_literal: true

# Rebuilds the pivot dimension catalog stored in pivot_dimension_caches.
#
# Runs all DISTINCT queries (one per dimension field) in parallel batches of 5,
# writing results to the DB as each field completes.  Broadcasts status updates
# over ActionCable so the Pivot page can show live progress.
#
# Triggered exclusively by POST /admin/pivot/refresh_catalog (the Refresh button
# on the Pivot page).  The catalog has no TTL — it persists until re-triggered.
class PivotCatalogRefreshJob < ApplicationJob
  queue_as :default

  BATCH_SIZE = 5

  def perform
    fields = PivotDimensionCache::REFRESH_FIELDS

    # Guard: bail if another instance is already running
    return if PivotDimensionCache.where(field_name: fields, status: "building").exists?

    # Mark every field as "building" up front so the UI shows full progress bar
    PivotDimensionCache.transaction do
      fields.each do |field|
        cache = PivotDimensionCache.find_or_initialize_by(field_name: field)
        cache.status        = "building"
        cache.error_message = nil
        cache.save!
      end
    end
    broadcast_status

    mutex = Mutex.new

    fields.each_slice(BATCH_SIZE) do |batch|
      threads = batch.map do |field|
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            values = PivotQueryBuilder.distinct_values(field: field, filters: {}, period_filter: nil)
            PivotDimensionCache.find_or_initialize_by(field_name: field).tap do |cache|
              cache.values        = values
              cache.status        = "ready"
              cache.refreshed_at  = Time.current
              cache.error_message = nil
              cache.save!
            end
          rescue => e
            Rails.logger.error "[PivotCatalogRefreshJob] #{field}: #{e.class} #{e.message}"
            PivotDimensionCache.find_or_initialize_by(field_name: field).tap do |cache|
              cache.status        = "error"
              cache.error_message = e.message
              cache.save!
            end
          ensure
            mutex.synchronize { broadcast_status }
          end
        end
      end
      threads.each(&:join)
    end

    # Remove stale rows for fields outside REFRESH_FIELDS
    removed = PivotDimensionCache.where.not(field_name: fields).delete_all
    Rails.logger.info "[PivotCatalogRefreshJob] Removed #{removed} stale cache row(s)" if removed > 0
  end

  private

    def broadcast_status
      status = PivotDimensionCache.refresh_status
      ActionCable.server.broadcast("pivot_catalog", { type: "status_update", **status })
    rescue => e
      Rails.logger.warn "[PivotCatalogRefreshJob] broadcast failed: #{e.message}"
    end
end
