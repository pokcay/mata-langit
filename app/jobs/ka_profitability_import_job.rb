# frozen_string_literal: true

class KaProfitabilityImportJob < ApplicationJob
  queue_as :default

  ADVISORY_LOCK_KEY = KaProfitabilityFileParser::ADVISORY_LOCK_KEY

  def perform(upload_id)
    upload = KaProfitabilityUpload.find(upload_id)

    if upload.cancelled?
      broadcast(upload)
      return
    end

    upload.update!(status: "processing")
    broadcast(upload)

    tmp = Tempfile.new(["ka_prof_import", ".xlsx"])
    tmp.binmode
    upload.file.download { |chunk| tmp.write(chunk) }
    tmp.flush

    record_count           = 0
    outlet_groups          = Set.new
    cancelled_during_import = false

    ActiveRecord::Base.logger.silence do
      ActiveRecord::Base.transaction do
        ActiveRecord::Base.connection.execute(
          "SELECT pg_advisory_xact_lock(#{ADVISORY_LOCK_KEY})"
        )

        KaProfitabilityFileParser.each_batch(
          tmp.path,
          upload.filename,
          upload_id:   upload.id,
          fiscal_year: upload.fiscal_year
        ) do |batch|
          KaProfitabilityRecord.insert_all!(batch)
          record_count += batch.size
          batch.each { |r| outlet_groups << r[:outlet_group] }

          broadcast_progress(upload, record_count)

          upload.reload
          if upload.cancelled?
            cancelled_during_import = true
            raise ActiveRecord::Rollback
          end
        end

        unless cancelled_during_import
          upload.update!(
            status:       "completed",
            record_count: record_count,
            outlet_count: outlet_groups.size,
            imported_at:  Time.current
          )

          # Mark new upload as latest; supersede previous ones for same fiscal year
          KaProfitabilityUpload
            .where(fiscal_year: upload.fiscal_year)
            .where.not(id: upload.id)
            .update_all(is_latest: false)
          upload.update_column(:is_latest, true)
        end
      end
    end

    upload.file.purge_later if upload.reload.completed?

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
      KaProfitabilityUploadChannel.broadcast_to(upload, {
        type:          "status_update",
        upload_id:     upload.id,
        status:        upload.status,
        record_count:  upload.record_count,
        error_message: upload.error_message
      })
    end

    def broadcast_progress(upload, rows_processed)
      KaProfitabilityUploadChannel.broadcast_to(upload, {
        type:          "progress_update",
        upload_id:     upload.id,
        progress_rows: rows_processed
      })
    end
end
