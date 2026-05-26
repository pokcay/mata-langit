# frozen_string_literal: true

class MarketShareB2bImportJob < ApplicationJob
  queue_as :default

  ADVISORY_LOCK_KEY = MarketShareB2bFileParser::ADVISORY_LOCK_KEY

  def perform(upload_id)
    upload = MarketShareB2bUpload.find(upload_id)

    if upload.cancelled?
      broadcast(upload)
      return
    end

    upload.update!(status: "processing")
    broadcast(upload)

    tmp = Tempfile.new(["ms_b2b_import", ".xlsx"])
    tmp.binmode
    upload.file.download { |chunk| tmp.write(chunk) }
    tmp.flush

    cancelled_during_import = false
    row_count = 0
    replaced  = 0

    ActiveRecord::Base.logger.silence do
      ActiveRecord::Base.transaction do
        ActiveRecord::Base.connection.execute(
          "SELECT pg_advisory_xact_lock(#{ADVISORY_LOCK_KEY})"
        )

        replaced = delete_covered_records(upload)

        MarketShareB2bFileParser.each_batch(
          tmp.path,
          upload.filename,
          upload_id:         upload.id,
          account_code:      upload.account_code,
          account_name:      upload.account_name,
          report_type:       upload.report_type,
          period_year_from:  upload.period_year_from,
          period_month_from: upload.period_month_from,
          period_year_to:    upload.period_year_to,
          period_month_to:   upload.period_month_to
        ) do |batch|
          MarketShareB2bRecord.insert_all(batch)
          row_count += batch.size

          broadcast_progress(upload, row_count)

          upload.reload
          if upload.cancelled?
            cancelled_during_import = true
            raise ActiveRecord::Rollback
          end
        end

        unless cancelled_during_import
          upload.update!(
            status:             "completed",
            row_count:          row_count,
            replaced_row_count: replaced,
            imported_at:        Time.current
          )
        end
      end
    end

    upload.file.purge_later if upload.reload.completed?
    broadcast(upload)
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
      MarketShareB2bUploadChannel.broadcast_to(upload, {
        type:          "status_update",
        upload_id:     upload.id,
        status:        upload.status,
        row_count:     upload.row_count,
        error_message: upload.error_message
      })
    end

    def broadcast_progress(upload, rows_processed)
      MarketShareB2bUploadChannel.broadcast_to(upload, {
        type:          "progress_update",
        upload_id:     upload.id,
        progress_rows: rows_processed
      })
    end

    def delete_covered_records(upload)
      total = 0
      each_covered_month(upload) do |year, month|
        count = MarketShareB2bRecord
          .for_period(upload.account_code, upload.report_type, year, month)
          .where.not(market_share_b2b_upload_id: upload.id)
          .count
        MarketShareB2bRecord
          .for_period(upload.account_code, upload.report_type, year, month)
          .where.not(market_share_b2b_upload_id: upload.id)
          .delete_all
        total += count
      end
      total
    end

    def each_covered_month(upload)
      year  = upload.period_year_from
      month = upload.period_month_from
      loop do
        yield year, month
        break if year == upload.period_year_to && month == upload.period_month_to

        month += 1
        if month > 12
          month = 1
          year  += 1
        end
      end
    end
end
