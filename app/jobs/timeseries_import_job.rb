# frozen_string_literal: true

class TimeseriesImportJob < ApplicationJob
  queue_as :default

  # Serialize imports via a Postgres advisory lock taken inside the transaction
  # (see #perform). Each XLSX load pulls ~1 GB of decompressed worksheet XML
  # into Ruby strings, so running 3 in parallel exhausted memory.
  #
  # We previously used GoodJob's `good_job_control_concurrency_with
  # perform_limit: 1`, but it reschedules excess jobs with exponential backoff
  # rather than queuing them FIFO — after a busy burst, the next jobs got
  # pushed 15+ minutes into the future and the queue effectively stalled.
  # `pg_advisory_xact_lock` blocks instead, so threads picked up in parallel
  # cheaply wait for their turn and process in arrival order.
  ADVISORY_LOCK_KEY = 0x7473696D70727401 # ASCII for "ts-impr" + version byte

  def perform(upload_id)
    upload = TimeseriesUpload.find(upload_id)

    # Job may have been queued after a cancel request arrived.
    if upload.cancelled?
      broadcast(upload)
      return
    end

    upload.update!(status: "processing")
    broadcast(upload)

    # Creek requires a .xlsx extension to detect format — ActiveStorage blobs have no extension.
    # Download to a named tempfile so Creek can open it.
    tmp = Tempfile.new([ "ts_import", ".xlsx" ])
    tmp.binmode
    upload.file.download { |chunk| tmp.write(chunk) }
    tmp.flush
    file_path = tmp.path

    cancelled_during_import = false
    replaced   = 0
    row_count  = 0
    netto_sum  = BigDecimal("0")

    # Silence ActiveRecord SQL logging for the hot import loop: each batch is
    # an INSERT of ~1000 rows × 90 columns, which serializes to megabytes of
    # log output per batch. Streaming that to STDOUT was the dominant cost in
    # the worker — far slower than the actual parse + insert.
    ActiveRecord::Base.logger.silence do
      ActiveRecord::Base.transaction do
        # Block until no other import is in flight. Auto-released at COMMIT or
        # ROLLBACK, so a crashed worker doesn't leak the lock.
        ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(#{ADVISORY_LOCK_KEY})")

        # Count and delete existing rows for this region+period inside the transaction
        # so a rollback (on cancel) fully restores the original records.
        replaced = TimeseriesTransaction
                     .for_period(upload.region, upload.period_year, upload.period_month)
                     .where.not(timeseries_upload_id: upload.id)
                     .count
        TimeseriesTransaction
          .for_period(upload.region, upload.period_year, upload.period_month)
          .where.not(timeseries_upload_id: upload.id)
          .delete_all

        TimeseriesFileParser.each_batch(file_path, upload.filename, upload_id: upload.id) do |batch|
          TimeseriesTransaction.insert_all(batch)
          batch.each do |row|
            row_count += 1
            netto_sum += BigDecimal(row[:netto_wise].to_s) if row[:netto_wise]
          end

          broadcast_progress(upload, row_count)

          # Check for a cancellation signal committed by the cancel endpoint.
          upload.reload
          if upload.cancelled?
            cancelled_during_import = true
            raise ActiveRecord::Rollback
          end
        end

        # Only reached (and committed) when import completes without cancellation.
        upload.update!(
          status:            "completed",
          row_count:         row_count,
          netto_wise_sum:    netto_sum,
          replaced_row_count: replaced,
          imported_at:       Time.current
        )

        # Remove stale upload records for the same region+period (their transactions
        # were already deleted above). Skip pending/processing records — those are
        # newer jobs that should run after us; they self-cancel if they find their
        # status was flipped by the create action.
        TimeseriesUpload
          .where(region: upload.region, period_year: upload.period_year, period_month: upload.period_month)
          .where.not(id: upload.id)
          .where.not(status: %w[pending processing])
          .destroy_all
      end
    end

    # Data is now in timeseries_transactions; the source XLSX is redundant.
    # Purge after the transaction commits so a rollback (cancel) keeps the file
    # available for retry. Failed/cancelled uploads keep the file for debugging
    # or manual re-import.
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
      TimeseriesUploadChannel.broadcast_to(upload, {
        type:           "status_update",
        upload_id:      upload.id,
        status:         upload.status,
        row_count:      upload.row_count,
        netto_wise_sum: upload.netto_wise_sum&.to_f,
        error_message:  upload.error_message
      })
    end

    def broadcast_progress(upload, rows_processed)
      TimeseriesUploadChannel.broadcast_to(upload, {
        type:           "progress_update",
        upload_id:      upload.id,
        progress_rows:  rows_processed
      })
    end
end
