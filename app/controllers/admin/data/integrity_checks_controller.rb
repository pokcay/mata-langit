# frozen_string_literal: true

class Admin::Data::IntegrityChecksController < Admin::BaseController
  PER_PAGE = 25

  # ── Detail page constants ─────────────────────────────────────────────────────

  ALLOWED_TABS = %w[all mismatched missing_in_db extra_in_db matched].freeze

  INDONESIAN_MONTHS = {
    1 => "Jan", 2 => "Feb", 3 => "Mar", 4 => "Apr",  5 => "Mei",  6 => "Jun",
    7 => "Jul", 8 => "Agu", 9 => "Sep", 10 => "Okt", 11 => "Nov", 12 => "Des"
  }.freeze

  SORT_COLUMNS = {
    "region"    => "region",
    "period"    => nil,  # handled specially — two-column sort
    "sot"       => "sot_netto_wise",
    "db"        => "db_netto_wise",
    "delta_abs" => "ABS(COALESCE(delta, 0))"
  }.freeze

  # ── History table constants ───────────────────────────────────────────────────

  HISTORY_SORT_COLUMNS = {
    "checked_at"       => "COALESCE(checked_at, created_at)",
    "period"           => nil,   # two-column sort on period_min_year, period_min_month
    "status"           => "status",
    "mismatched_count" => "mismatched_count"
  }.freeze

  HISTORY_STATUSES = IntegrityCheck::STATUSES

  # GET /admin/data/integrity
  def index
    latest_check = IntegrityCheck.where(status: "completed")
                                 .order(checked_at: :desc)
                                 .first

    scope = IntegrityCheck.includes(:user)

    # --- Filters ---
    if params[:search].present?
      scope = scope.where(
        "filename ILIKE ?",
        "%#{ActiveRecord::Base.sanitize_sql_like(params[:search])}%"
      )
    end
    if params[:status_filter].present? && HISTORY_STATUSES.include?(params[:status_filter])
      scope = scope.where(status: params[:status_filter])
    end
    scope = scope.where(period_min_year:  params[:year])  if params[:year].present?
    scope = scope.where(period_min_month: params[:month]) if params[:month].present?

    # --- Sort ---
    sort_key = HISTORY_SORT_COLUMNS.key?(params[:sort]) ? params[:sort] : "checked_at"
    dir      = params[:direction] == "asc" ? "ASC" : "DESC"
    scope    = if sort_key == "period"
                 scope.order(Arel.sql("period_min_year #{dir} NULLS LAST, period_min_month #{dir} NULLS LAST"))
    else
                 scope.order(Arel.sql("#{HISTORY_SORT_COLUMNS[sort_key]} #{dir} NULLS LAST"))
    end

    # --- Pagination ---
    total  = scope.count
    page   = (params[:page] || 1).to_i.clamp(1, Float::INFINITY)
    offset = (page - 1) * PER_PAGE
    checks = scope.limit(PER_PAGE).offset(offset)

    # --- Available filter options (from all checks, ignoring current filters) ---
    all_checks    = IntegrityCheck.all
    avail_years   = all_checks.where.not(period_min_year:  nil).distinct.pluck(:period_min_year).sort.reverse
    avail_months  = all_checks.where.not(period_min_month: nil).distinct.pluck(:period_min_month).sort
    avail_statuses = all_checks.distinct.pluck(:status).sort

    render inertia: "admin/data/IntegrityChecks", props: {
      latest_check:      latest_check ? serialize_check_summary(latest_check) : nil,
      checks:            checks.map { |c| serialize_check_summary(c) },
      total:             total,
      page:              page,
      per_page:          PER_PAGE,
      sort:              sort_key,
      direction:         dir.downcase,
      filters:           {
        search:        params[:search].presence,
        status_filter: params[:status_filter].presence,
        year:          params[:year].presence,
        month:         params[:month].presence
      },
      available_years:   avail_years,
      available_months:  avail_months,
      available_statuses: avail_statuses
    }
  end

  # POST /admin/data/integrity  (raw fetch, not Inertia router)
  def create
    file = params[:file]
    unless file.respond_to?(:original_filename)
      return render json: { error: "No file provided." }, status: :unprocessable_entity
    end

    ext = File.extname(file.original_filename).downcase
    unless ext == ".xlsx"
      return render json: { error: "\"#{file.original_filename}\" bukan file .xlsx." },
                    status: :unprocessable_entity
    end

    check = IntegrityCheck.new(
      user:            Current.user,
      filename:        file.original_filename,
      status:          "pending",
      include_program: Current.user.include_program_in_integrity_checks
    )
    check.file.attach(
      io:           file.tempfile,
      filename:     file.original_filename,
      content_type: file.content_type
    )

    if check.save
      IntegrityCheckJob.perform_later(check.id)
      render json: { check_id: check.id }, status: :created
    else
      render json: { error: check.errors.full_messages.join(", ") },
             status: :unprocessable_entity
    end
  end

  # GET /admin/data/integrity/:id
  def show
    check = IntegrityCheck.find(params[:id])

    scope = check.integrity_check_results

    # --- Tab filter ---
    tab = ALLOWED_TABS.include?(params[:tab]) ? params[:tab] : "mismatched"
    scope = scope.where(outcome: tab) unless tab == "all"

    # --- Search / column filters ---
    if params[:search].present?
      scope = scope.where("region ILIKE ?", "%#{ActiveRecord::Base.sanitize_sql_like(params[:search])}%")
    end
    scope = scope.where(period_year:  params[:year])  if params[:year].present?
    scope = scope.where(period_month: params[:month]) if params[:month].present?

    # --- Sort ---
    sort_key = SORT_COLUMNS.key?(params[:sort]) ? params[:sort] : "delta_abs"
    dir      = params[:direction] == "asc" ? "ASC" : "DESC"
    scope    = if sort_key == "period"
                 scope.order(Arel.sql("period_year #{dir}, period_month #{dir}"))
    else
                 scope.order(Arel.sql("#{SORT_COLUMNS[sort_key]} #{dir} NULLS LAST"))
    end

    # --- Pagination ---
    total  = scope.count
    page   = (params[:page] || 1).to_i.clamp(1, Float::INFINITY)
    offset = (page - 1) * PER_PAGE
    rows   = scope.limit(PER_PAGE).offset(offset)

    # --- Available filter options (from this check's results, ignoring current tab/search) ---
    base         = check.integrity_check_results
    avail_years  = base.distinct.pluck(:period_year).sort.reverse
    avail_months = base.distinct.pluck(:period_month).sort

    # --- Aggregates for summary cards ---
    total_abs_delta  = base.where(outcome: "mismatched")
                           .sum(Arel.sql("ABS(COALESCE(delta, 0))"))
    total_matched_sot  = base.where(outcome: "matched").sum(:sot_netto_wise)
    total_missing_sot  = base.where(outcome: "missing_in_db").sum(:sot_netto_wise)
    total_extra_db     = base.where(outcome: "extra_in_db").sum(:db_netto_wise)

    render inertia: "admin/data/IntegrityCheckDetail", props: {
      check:            serialize_check(check, total_abs_delta, total_matched_sot, total_missing_sot, total_extra_db),
      results:          rows.map { |r| serialize_result(r) },
      total:            total,
      page:             page,
      per_page:         PER_PAGE,
      tab:              tab,
      sort:             sort_key,
      direction:        dir.downcase,
      filters:          {
        search: params[:search].presence,
        year:   params[:year].presence,
        month:  params[:month].presence
      },
      available_years:  avail_years,
      available_months: avail_months
    }
  end

  # GET /admin/data/integrity/:id/download
  def download
    check = IntegrityCheck.find(params[:id])

    unless check.completed?
      redirect_back(fallback_location: admin_data_integrity_check_path(check),
                    notice: "Ekspor hanya tersedia untuk check yang sudah selesai.")
      return
    end

    results = check.integrity_check_results
                   .order(:region, :period_year, :period_month)
                   .to_a

    mismatched    = results.select { |r| r.outcome == "mismatched"    }
    missing_in_db = results.select { |r| r.outcome == "missing_in_db" }
    extra_in_db   = results.select { |r| r.outcome == "extra_in_db"   }
    matched       = results.select { |r| r.outcome == "matched"       }

    base_name = File.basename(check.filename.to_s, ".*")
                    .downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-+|-+\z/, "")
    date_str  = (check.checked_at || check.created_at).to_date.iso8601
    filename  = "integrity-#{base_name}-#{date_str}.xlsx"

    package = Axlsx::Package.new
    wb      = package.workbook

    xlsx_sheet(wb, "Mismatched",    mismatched,    [ "Region", "Period", "SoT Netto Wise", "DB Netto Wise", "Delta" ]) { |r| [ r.sot_netto_wise&.to_f, r.db_netto_wise&.to_f, r.delta&.to_f ] }
    xlsx_sheet(wb, "Missing in DB", missing_in_db, [ "Region", "Period", "SoT Netto Wise" ])                          { |r| [ r.sot_netto_wise&.to_f ] }
    xlsx_sheet(wb, "Extra in DB",   extra_in_db,   [ "Region", "Period", "DB Netto Wise" ])                           { |r| [ r.db_netto_wise&.to_f ] }
    xlsx_sheet(wb, "Matched",       matched,       [ "Region", "Period", "SoT Netto Wise", "DB Netto Wise" ])         { |r| [ r.sot_netto_wise&.to_f, r.db_netto_wise&.to_f ] }

    send_data package.to_stream.read,
              filename:    filename,
              type:        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              disposition: "attachment"
  end

  # PATCH /admin/data/integrity/:id/cancel  (raw fetch)
  def cancel
    check = IntegrityCheck.find(params[:id])
    if check.in_flight?
      check.update!(status: "cancelled")
      IntegrityCheckChannel.broadcast_to(check, {
        type:                "status_update",
        check_id:            check.id,
        status:              "cancelled",
        matched_count:       check.matched_count,
        mismatched_count:    check.mismatched_count,
        missing_in_db_count: check.missing_in_db_count,
        extra_in_db_count:   check.extra_in_db_count,
        error_message:       nil
      })
    end
    head :ok
  end

  # PATCH /admin/data/integrity/:id/rerun  (raw fetch)
  def rerun
    check = IntegrityCheck.find(params[:id])

    unless check.completed?
      return render json: { error: "Check is not completed." }, status: :unprocessable_entity
    end

    if IntegrityCheck.where(status: %w[pending processing]).exists?
      return render json: { error: "Ada check lain yang sedang berjalan. Tunggu hingga selesai sebelum menjalankan ulang." },
                    status: :conflict
    end

    unless check.file.attached?
      return render json: { error: "File SoT tidak ditemukan. Tidak bisa menjalankan ulang check ini." },
                    status: :unprocessable_entity
    end

    check.update!(status: "pending")
    IntegrityCheckChannel.broadcast_to(check, {
      type:                "status_update",
      check_id:            check.id,
      status:              "pending",
      matched_count:       check.matched_count,
      mismatched_count:    check.mismatched_count,
      missing_in_db_count: check.missing_in_db_count,
      extra_in_db_count:   check.extra_in_db_count,
      error_message:       nil
    })
    IntegrityCheckRerunJob.perform_later(check.id)
    render json: { ok: true }, status: :ok
  end

  private
    def serialize_check_summary(check)
      {
        id:                  check.id,
        filename:            check.filename,
        status:              check.status,
        period_min_year:     check.period_min_year,
        period_min_month:    check.period_min_month,
        period_max_year:     check.period_max_year,
        period_max_month:    check.period_max_month,
        period_range_label:  check.period_range_label,
        total_rows_in_sot:   check.total_rows_in_sot,
        matched_count:       check.matched_count,
        mismatched_count:    check.mismatched_count,
        missing_in_db_count: check.missing_in_db_count,
        extra_in_db_count:   check.extra_in_db_count,
        include_program:     check.include_program,
        uploaded_by:         check.user&.email,
        checked_at:          check.checked_at&.iso8601,
        last_rerun_at:       check.last_rerun_at&.iso8601,
        created_at:          check.created_at.iso8601
      }
    end

    def serialize_check(check, total_abs_delta = nil, total_matched_sot = nil, total_missing_sot = nil, total_extra_db = nil)
      {
        id:                  check.id,
        filename:            check.filename,
        status:              check.status,
        period_min_year:     check.period_min_year,
        period_min_month:    check.period_min_month,
        period_max_year:     check.period_max_year,
        period_max_month:    check.period_max_month,
        total_rows_in_sot:   check.total_rows_in_sot,
        matched_count:       check.matched_count,
        mismatched_count:    check.mismatched_count,
        missing_in_db_count: check.missing_in_db_count,
        extra_in_db_count:   check.extra_in_db_count,
        include_program:     check.include_program,
        total_abs_delta:     total_abs_delta&.to_f,
        total_matched_sot:   total_matched_sot&.to_f,
        total_missing_sot:   total_missing_sot&.to_f,
        total_extra_db:      total_extra_db&.to_f,
        error_message:       check.error_message,
        checked_at:          check.checked_at&.iso8601,
        last_rerun_at:       check.last_rerun_at&.iso8601,
        uploaded_by:         check.user&.email,
        created_at:          check.created_at.iso8601
      }
    end

    def serialize_result(result)
      {
        id:             result.id,
        region:         result.region,
        period_year:    result.period_year,
        period_month:   result.period_month,
        sot_netto_wise: result.sot_netto_wise&.to_f,
        db_netto_wise:  result.db_netto_wise&.to_f,
        delta:          result.delta&.to_f,
        outcome:        result.outcome,
        resolved_at:    result.resolved_at&.iso8601
      }
    end

    def xlsx_sheet(workbook, name, rows, headers, &block)
      workbook.add_worksheet(name: name) do |sheet|
        sheet.add_row headers
        rows.each do |r|
          period = "#{INDONESIAN_MONTHS[r.period_month]} #{r.period_year}"
          sheet.add_row([ r.region, period ] + block.call(r))
        end
      end
    end
end
