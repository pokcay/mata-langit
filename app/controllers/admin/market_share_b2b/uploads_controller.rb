# frozen_string_literal: true

class Admin::MarketShareB2b::UploadsController < Admin::BaseController
  PER_PAGE = 25

  SORT_COLUMNS = {
    "created_at"   => "market_share_b2b_uploads.created_at",
    "account_code" => "market_share_b2b_uploads.account_code",
    "period"       => :period,
    "report_type"  => "market_share_b2b_uploads.report_type",
    "row_count"    => "market_share_b2b_uploads.row_count",
    "status"       => "market_share_b2b_uploads.status"
  }.freeze

  # POST /admin/market-share-b2b/uploads/preview
  # Accepts JSON metadata parsed browser-side. No file upload, no DB writes.
  # Body: { files_metadata: [{ filename, account_code, account_name, report_type,
  #           template_version, period_year_from, period_month_from,
  #           period_year_to, period_month_to, row_count }] }
  def preview
    files_metadata = Array(params[:files_metadata])
    return render json: { error: "No files provided" },
                  status: :unprocessable_entity if files_metadata.empty?

    results = files_metadata.map do |meta|
      filename         = meta[:filename].to_s
      account_code     = meta[:account_code].to_s
      report_type      = meta[:report_type].to_s
      year_from        = meta[:period_year_from].to_i
      month_from       = meta[:period_month_from].to_i
      year_to          = meta[:period_year_to].to_i
      month_to         = meta[:period_month_to].to_i
      row_count        = meta[:row_count].to_i

      existing_count = existing_record_count(account_code, report_type,
                                             year_from, month_from, year_to, month_to)
      meta.to_unsafe_h.symbolize_keys.merge(
        row_count:      row_count,
        existing_count: existing_count,
        will_replace:   existing_count > 0,
      )
    rescue => e
      { filename: meta[:filename].to_s, error: e.message }
    end

    render json: results
  end

  # POST /admin/market-share-b2b/uploads
  # Called via raw fetch() — multipart file upload.
  def create
    files = Array(params[:files])
    return render json: { error: "No files provided." },
                  status: :unprocessable_entity if files.empty?

    queued     = 0
    upload_ids = []
    errors     = []

    files.each do |file|
      validate_file!(file)

      meta = MarketShareB2bFileParser.detect(file.tempfile.path, file.original_filename)

      # Cancel any pending uploads for the same account+period range
      cancel_pending_for(meta)

      upload = MarketShareB2bUpload.new(
        user:             Current.user,
        filename:         file.original_filename,
        account_code:     meta[:account_code],
        account_name:     meta[:account_name],
        report_type:      meta[:report_type],
        template_version: meta[:template_version],
        period_year_from:  meta[:period_year_from],
        period_month_from: meta[:period_month_from],
        period_year_to:    meta[:period_year_to],
        period_month_to:   meta[:period_month_to],
        status:           "pending"
      )
      upload.file.attach(
        io:           file.tempfile,
        filename:     file.original_filename,
        content_type: file.content_type
      )

      if upload.save
        MarketShareB2bImportJob.perform_later(upload.id)
        upload_ids << upload.id
        queued += 1
      else
        errors << "#{file.original_filename}: #{upload.errors.full_messages.join(', ')}"
      end
    rescue ArgumentError => e
      errors << e.message
    rescue => e
      errors << "#{file.original_filename}: #{e.message}"
    end

    if errors.any?
      render json: { error: errors.join(" | "), queued: queued, upload_ids: upload_ids },
             status: :unprocessable_entity
    else
      render json: { queued: queued, upload_ids: upload_ids }, status: :created
    end
  end

  # PATCH /admin/market-share-b2b/uploads/:id/cancel
  # Called via raw fetch() — not Inertia router.
  def cancel
    upload = MarketShareB2bUpload.find_by(id: params[:id], user: Current.user)
    return head :not_found unless upload
    return head :no_content if upload.status.in?(%w[completed failed cancelled])

    upload.update!(status: "cancelled")
    MarketShareB2bUploadChannel.broadcast_to(upload, {
      type:          "status_update",
      upload_id:     upload.id,
      status:        upload.status,
      row_count:     upload.row_count,
      error_message: upload.error_message
    })
    head :no_content
  end

  # DELETE /admin/market-share-b2b/uploads/:id
  def destroy
    upload = MarketShareB2bUpload.find_by(id: params[:id])
    return redirect_to admin_market_share_b2b_uploads_path, alert: "Upload tidak ditemukan." unless upload

    if upload.in_flight?
      return redirect_to admin_market_share_b2b_uploads_path,
                         alert: "Upload sedang berjalan dan tidak bisa dihapus. Batalkan terlebih dahulu."
    end

    upload.destroy
    redirect_to admin_market_share_b2b_uploads_path, notice: "Upload \"#{upload.filename}\" berhasil dihapus."
  end

  # GET /admin/market-share-b2b/uploads
  def index
    scope = MarketShareB2bUpload.includes(:user)

    scope = scope.where(account_code: params[:account_code]) if params[:account_code].present?
    scope = scope.where(report_type: params[:report_type])   if params[:report_type].present?
    scope = scope.where(period_year_from: params[:year])     if params[:year].present?
    scope = scope.where(period_month_from: params[:month])   if params[:month].present?
    scope = scope.where(status: params[:status])             if params[:status].present?
    if params[:search].present?
      scope = scope.where("filename ILIKE ?",
        "%#{ActiveRecord::Base.sanitize_sql_like(params[:search])}%")
    end

    sort_key = SORT_COLUMNS.key?(params[:sort]) ? params[:sort] : "created_at"
    dir      = params[:direction] == "asc" ? "ASC" : "DESC"
    col      = SORT_COLUMNS[sort_key]
    if col == :period
      scope = scope.order(Arel.sql(
        "market_share_b2b_uploads.period_year_from #{dir}, market_share_b2b_uploads.period_month_from #{dir}"
      ))
    else
      scope = scope.order(Arel.sql("#{col} #{dir}"))
    end

    total   = scope.count
    page    = (params[:page] || 1).to_i.clamp(1, Float::INFINITY)
    offset  = (page - 1) * PER_PAGE
    uploads = scope.limit(PER_PAGE).offset(offset)

    available_account_codes = MarketShareB2bUpload.distinct.pluck(:account_code).compact.sort
    available_report_types  = MarketShareB2bUpload.distinct.pluck(:report_type).compact.sort
    available_years         = MarketShareB2bUpload.distinct.pluck(:period_year_from).compact.sort.reverse

    render inertia: "admin/market_share_b2b/Uploads", props: {
      uploads:                uploads.map { |u| serialize(u) },
      total:                  total,
      page:                   page,
      per_page:               PER_PAGE,
      sort:                   sort_key,
      direction:              dir.downcase,
      filters:                {
        account_code: params[:account_code].presence,
        report_type:  params[:report_type].presence,
        year:         params[:year].presence,
        month:        params[:month].presence,
        status:       params[:status].presence,
        search:       params[:search].presence
      },
      available_account_codes: available_account_codes,
      available_report_types:  available_report_types,
      available_years:         available_years,
    }
  end

  private
    def serialize(upload)
      {
        id:                 upload.id,
        filename:           upload.filename,
        account_code:       upload.account_code,
        account_name:       upload.account_name,
        report_type:        upload.report_type,
        template_version:   upload.template_version,
        period_year_from:   upload.period_year_from,
        period_month_from:  upload.period_month_from,
        period_year_to:     upload.period_year_to,
        period_month_to:    upload.period_month_to,
        period_label:       upload.period_label,
        status:             upload.status,
        row_count:          upload.row_count,
        replaced_row_count: upload.replaced_row_count,
        error_message:      upload.error_message,
        imported_at:        upload.imported_at&.iso8601,
        created_at:         upload.created_at.iso8601,
        uploaded_by:        upload.user&.email,
      }
    end

    def validate_file!(file)
      raise ArgumentError, "Invalid file object." unless file.respond_to?(:original_filename)

      ext = File.extname(file.original_filename).downcase
      raise ArgumentError, "\"#{file.original_filename}\" bukan file .xlsx." unless ext == ".xlsx"
    end

    def cancel_pending_for(meta)
      MarketShareB2bUpload
        .where(account_code: meta[:account_code], report_type: meta[:report_type])
        .where(status: "pending")
        .each do |u|
          # Cancel if any month in the new upload's range overlaps
          new_months  = months_in_range(meta[:period_year_from], meta[:period_month_from],
                                        meta[:period_year_to],   meta[:period_month_to])
          old_months  = months_in_range(u.period_year_from, u.period_month_from,
                                        u.period_year_to,   u.period_month_to)
          u.update!(status: "cancelled") if (new_months & old_months).any?
        end
    end

    def months_in_range(year_from, month_from, year_to, month_to)
      result = []
      year, month = year_from, month_from
      loop do
        result << [year, month]
        break if year == year_to && month == month_to
        month += 1
        if month > 12; month = 1; year += 1; end
      end
      result
    end

    def existing_record_count(account_code, report_type, year_from, month_from, year_to, month_to)
      total = 0
      year, month = year_from, month_from
      loop do
        total += MarketShareB2bRecord.for_period(account_code, report_type, year, month).count
        break if year == year_to && month == month_to
        month += 1
        if month > 12; month = 1; year += 1; end
      end
      total
    end
end
