# frozen_string_literal: true

class MasterOutletDistImportJob < ApplicationJob
  queue_as :default

  # Separate advisory lock key from TimeseriesImportJob so the two queues
  # don't block each other.
  ADVISORY_LOCK_KEY = 0x6D6F647570723401 # "modupр" + version byte

  def perform(upload_id)
    upload = MasterOutletDistUpload.find(upload_id)

    if upload.cancelled?
      broadcast(upload)
      return
    end

    upload.update!(status: "processing")
    broadcast(upload)

    tmp = Tempfile.new([ "mod_import", ".xlsx" ])
    tmp.binmode
    upload.file.download { |chunk| tmp.write(chunk) }
    tmp.flush

    cancelled_during_import = false
    replaced   = 0
    row_count  = 0

    ActiveRecord::Base.logger.silence do
      ActiveRecord::Base.transaction do
        ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(#{ADVISORY_LOCK_KEY})")

        # Delete existing records belonging to *other* uploads for the same distributor.
        other_upload_ids = MasterOutletDistUpload
          .where(dist_sap_code: upload.dist_sap_code)
          .where.not(id: upload.id)
          .pluck(:id)

        if other_upload_ids.any?
          replaced = MasterOutletDistRecord
            .where(master_outlet_dist_upload_id: other_upload_ids)
            .count
          MasterOutletDistRecord
            .where(master_outlet_dist_upload_id: other_upload_ids)
            .delete_all
        end

        MasterOutletDistFileParser.each_batch(tmp.path, upload_id: upload.id) do |batch|
          MasterOutletDistRecord.insert_all(batch)
          row_count += batch.size

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
          replaced_row_count: replaced,
          imported_at:        Time.current
        )

        # Purge stale upload records (whose records were just deleted) so the
        # history table stays clean. Leave pending/processing ones — those are
        # in-flight jobs that self-cancel when they find their dist_sap_code
        # records already replaced.
        MasterOutletDistUpload
          .where(dist_sap_code: upload.dist_sap_code)
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
      MasterOutletDistUploadChannel.broadcast_to(upload, {
        type:          "status_update",
        upload_id:     upload.id,
        status:        upload.status,
        row_count:     upload.row_count,
        error_message: upload.error_message
      })
    end

    def broadcast_progress(upload, rows_processed)
      MasterOutletDistUploadChannel.broadcast_to(upload, {
        type:         "progress_update",
        upload_id:    upload.id,
        progress_rows: rows_processed
      })
    end
end
