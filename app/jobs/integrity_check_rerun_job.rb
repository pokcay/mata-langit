# frozen_string_literal: true

class IntegrityCheckRerunJob < ApplicationJob
  queue_as :default

  PROGRESS_INTERVAL = 25
  INSERT_BATCH_SIZE = 1000

  def perform(check_id)
    check = IntegrityCheck.find(check_id)

    if check.cancelled?
      broadcast(check)
      return
    end

    check.update!(status: "processing")
    broadcast(check)

    tmp = Tempfile.new([ "integrity_sot", ".xlsx" ])
    tmp.binmode
    check.file.download { |chunk| tmp.write(chunk) }
    tmp.flush

    parse_result = IntegritySotParser.parse(tmp.path)

    if parse_result.malformed_rows.any?
      raise ArgumentError,
        "SoT file has #{parse_result.malformed_rows.size} malformed row(s). " \
        "First: row #{parse_result.malformed_rows.first.row_number} — " \
        "#{parse_result.malformed_rows.first.reason}"
    end

    sot_rows = parse_result.rows
    total    = sot_rows.size
    sot_set  = sot_rows.map { |r| [ r[:region], r[:year], r[:month] ] }.to_set

    # Re-runs read the snapshot, never the live user preference — guarantees the
    # check is reproducible even if the admin toggles their global setting.
    base_scope = check.include_program ? TimeseriesTransaction.all : TimeseriesTransaction.non_program

    cancelled_during_job = false
    rerun_at = Time.current

    ActiveRecord::Base.transaction do
      previous = check.integrity_check_results
                      .pluck(:region, :period_year, :period_month, :outcome, :resolved_at)
                      .each_with_object({}) do |(region, year, month, outcome, resolved_at), h|
                        h[[ region, year, month ]] = { outcome: outcome, resolved_at: resolved_at }
                      end

      check.integrity_check_results.delete_all

      check.reload
      if check.cancelled?
        cancelled_during_job = true
        raise ActiveRecord::Rollback
      end

      db_sums = aggregate_db(base_scope, parse_result)

      counts = { "matched" => 0, "mismatched" => 0, "missing_in_db" => 0, "extra_in_db" => 0 }
      records = []

      sot_rows.each_with_index do |sot_row, idx|
        if idx % PROGRESS_INTERVAL == 0
          check.reload
          if check.cancelled?
            cancelled_during_job = true
            raise ActiveRecord::Rollback
          end
          broadcast_progress(check, idx, total) if idx > 0
        end

        key     = [ sot_row[:region], sot_row[:year], sot_row[:month] ]
        db_sum  = db_sums[key]
        sot_val = sot_row[:netto_wise]

        if db_sum.nil?
          outcome  = "missing_in_db"
          db_netto = nil
          delta    = nil
        else
          db_netto = BigDecimal(db_sum.to_s)
          outcome  = sot_val.round(2) == db_netto.round(2) ? "matched" : "mismatched"
          delta    = sot_val - db_netto
        end

        resolved_at = compute_resolved_at(previous[key], outcome, rerun_at)
        counts[outcome] += 1
        records << build_record(check.id, sot_row[:region], sot_row[:year], sot_row[:month],
                                sot_val, db_netto, delta, outcome, resolved_at, rerun_at)
      end

      check.reload
      if check.cancelled?
        cancelled_during_job = true
        raise ActiveRecord::Rollback
      end

      db_sums.each do |(region, year, month), db_sum|
        next if sot_set.include?([ region, year, month ])
        counts["extra_in_db"] += 1
        records << build_record(check.id, region, year, month,
                                nil, BigDecimal(db_sum.to_s), nil, "extra_in_db", nil, rerun_at)
      end

      records.each_slice(INSERT_BATCH_SIZE) do |batch|
        IntegrityCheckResult.insert_all!(batch)
      end

      check.update!(
        status:              "completed",
        total_rows_in_sot:   total,
        matched_count:       counts["matched"],
        mismatched_count:    counts["mismatched"],
        missing_in_db_count: counts["missing_in_db"],
        extra_in_db_count:   counts["extra_in_db"],
        period_min_year:     parse_result.period_min_year,
        period_min_month:    parse_result.period_min_month,
        period_max_year:     parse_result.period_max_year,
        period_max_month:    parse_result.period_max_month,
        last_rerun_at:       rerun_at
      )
    end

    broadcast(check.reload) unless cancelled_during_job
  rescue => e
    check&.reload
    unless check&.cancelled?
      check&.update!(status: "failed", error_message: e.message)
    end
    broadcast(check) if check
    raise
  ensure
    tmp&.close
    tmp&.unlink rescue nil
  end

  private
    def aggregate_db(base_scope, parse_result)
      scope = base_scope
      if parse_result.period_min_year && parse_result.period_max_year
        min_y = parse_result.period_min_year
        min_m = parse_result.period_min_month
        max_y = parse_result.period_max_year
        max_m = parse_result.period_max_month
        scope = scope.where(
          "(period_year > :min_y OR (period_year = :min_y AND period_month >= :min_m)) AND " \
          "(period_year < :max_y OR (period_year = :max_y AND period_month <= :max_m))",
          min_y: min_y, min_m: min_m, max_y: max_y, max_m: max_m
        )
      end
      scope.group(:region, :period_year, :period_month).sum(:netto_wise)
    end

    def build_record(check_id, region, year, month, sot_val, db_netto, delta, outcome, resolved_at, now)
      {
        integrity_check_id: check_id,
        region:             region,
        period_year:        year,
        period_month:       month,
        sot_netto_wise:     sot_val,
        db_netto_wise:      db_netto,
        delta:              delta,
        outcome:            outcome,
        resolved_at:        resolved_at,
        created_at:         now,
        updated_at:         now
      }
    end

    # Sets resolved_at based on outcome transitions:
    # - mismatched → matched: mark resolved now
    # - was resolved, now mismatched again: clear resolved_at
    # - everything else: carry forward existing resolved_at
    def compute_resolved_at(prev, new_outcome, rerun_at)
      return nil if prev.nil?
      if prev[:outcome] == "mismatched" && new_outcome == "matched"
        rerun_at
      elsif new_outcome == "mismatched" && prev[:resolved_at].present?
        nil
      else
        prev[:resolved_at]
      end
    end

    def broadcast(check)
      IntegrityCheckChannel.broadcast_to(check, {
        type:                "status_update",
        check_id:            check.id,
        status:              check.status,
        matched_count:       check.matched_count,
        mismatched_count:    check.mismatched_count,
        missing_in_db_count: check.missing_in_db_count,
        extra_in_db_count:   check.extra_in_db_count,
        error_message:       check.error_message
      })
    end

    def broadcast_progress(check, compared, total)
      IntegrityCheckChannel.broadcast_to(check, {
        type:     "progress_update",
        check_id: check.id,
        compared: compared,
        total:    total
      })
    end
end
