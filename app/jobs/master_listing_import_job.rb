# frozen_string_literal: true

class MasterListingImportJob < ApplicationJob
  queue_as :default

  # Separate advisory lock key ("mListing") — does not block other import queues.
  ADVISORY_LOCK_KEY = 0x6D4C697374696E67

  def perform(upload_id)
    upload = MasterListingUpload.find(upload_id)

    if upload.cancelled?
      broadcast(upload)
      return
    end

    upload.update!(status: "processing")
    broadcast(upload)

    tmp = Tempfile.new([ "master_listing_import", ".xlsx" ])
    tmp.binmode
    upload.file.download { |chunk| tmp.write(chunk) }
    tmp.flush

    cancelled_during_import = false
    replaced   = 0
    row_count  = 0
    total_cost = 0

    ActiveRecord::Base.logger.silence do
      ActiveRecord::Base.transaction do
        ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(#{ADVISORY_LOCK_KEY})")

        # Replace any existing rows for the same period (from other uploads).
        scope = MasterListingCost
          .for_period(upload.period_year, upload.period_month)
          .where.not(master_listing_upload_id: upload.id)
        replaced = scope.count
        scope.delete_all

        MasterListingFileParser.each_batch(
          tmp.path,
          upload_id:    upload.id,
          period_year:  upload.period_year,
          period_month: upload.period_month
        ) do |batch|
          MasterListingCost.insert_all(batch)
          batch.each do |row|
            row_count += 1
            total_cost += row[:cost].to_i if row[:cost]
          end

          broadcast_progress(upload, row_count)

          upload.reload
          if upload.cancelled?
            cancelled_during_import = true
            raise ActiveRecord::Rollback
          end
        end

        upload.update!(
          status:             "completed",
          row_count:          row_count,
          total_cost:         total_cost,
          replaced_row_count: replaced,
          imported_at:        Time.current
        )

        # Drop superseded upload records for the same period.
        MasterListingUpload
          .where(period_year: upload.period_year, period_month: upload.period_month)
          .where.not(id: upload.id)
          .where.not(status: %w[pending processing])
          .destroy_all
      end
    end

    upload.file.purge_later if upload.completed?

    broadcast(upload.reload)
  rescue => e
    upload&.reload
    unless upload&.cancelled?
      upload&.update!(status: "failed", error_message: e.message)
    end
    broadcast(upload) if upload
    raise
  ensure
    tmp&.close
    tmp&.unlink rescue nil
  end

  private
    def broadcast(upload)
      MasterListingUploadChannel.broadcast_to(upload, {
        type:          "status_update",
        upload_id:     upload.id,
        status:        upload.status,
        row_count:     upload.row_count,
        error_message: upload.error_message
      })
    end

    def broadcast_progress(upload, rows_processed)
      MasterListingUploadChannel.broadcast_to(upload, {
        type:          "progress_update",
        upload_id:     upload.id,
        progress_rows: rows_processed
      })
    end
end
