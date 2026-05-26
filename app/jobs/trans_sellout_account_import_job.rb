# frozen_string_literal: true

class TransSelloutAccountImportJob < ApplicationJob
  queue_as :default

  # Separate advisory lock key — does not block Timeseries, MasterOutletDist,
  # or MasterProductDist import queues.
  ADVISORY_LOCK_KEY = 0x7473614163636F75 # "tsaAccou" in hex

  def perform(upload_id)
    upload = TransSelloutAccountUpload.find(upload_id)

    if upload.cancelled?
      broadcast(upload)
      return
    end

    upload.update!(status: "processing")
    broadcast(upload)

    tmp = Tempfile.new([ "tsa_import", ".xlsx" ])
    tmp.binmode
    upload.file.download { |chunk| tmp.write(chunk) }
    tmp.flush

    cancelled_during_import = false
    replaced  = 0
    row_count = 0
    netto_sum = BigDecimal("0")

    ActiveRecord::Base.logger.silence do
      ActiveRecord::Base.transaction do
        ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(#{ADVISORY_LOCK_KEY})")

        replaced = TransSelloutAccountTransaction
          .for_period(upload.distributor_code, upload.period_year, upload.period_month)
          .where.not(trans_sellout_account_upload_id: upload.id)
          .count
        TransSelloutAccountTransaction
          .for_period(upload.distributor_code, upload.period_year, upload.period_month)
          .where.not(trans_sellout_account_upload_id: upload.id)
          .delete_all

        TransSelloutAccountFileParser.each_batch(
          tmp.path, upload.filename, upload_id: upload.id
        ) do |batch|
          TransSelloutAccountTransaction.insert_all(batch)
          batch.each do |row|
            row_count += 1
            netto_sum += BigDecimal(row[:netto_wise].to_s) if row[:netto_wise]
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
          netto_wise_sum:     netto_sum,
          replaced_row_count: replaced,
          imported_at:        Time.current
        )

        TransSelloutAccountUpload
          .where(distributor_code: upload.distributor_code,
                 period_year:      upload.period_year,
                 period_month:     upload.period_month)
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
      TransSelloutAccountUploadChannel.broadcast_to(upload, {
        type:          "status_update",
        upload_id:     upload.id,
        status:        upload.status,
        row_count:     upload.row_count,
        error_message: upload.error_message
      })
    end

    def broadcast_progress(upload, rows_processed)
      TransSelloutAccountUploadChannel.broadcast_to(upload, {
        type:          "progress_update",
        upload_id:     upload.id,
        progress_rows: rows_processed
      })
    end
end
