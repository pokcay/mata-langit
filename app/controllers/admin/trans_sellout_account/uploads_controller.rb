# frozen_string_literal: true

class Admin::TransSelloutAccount::UploadsController < Admin::BaseController
  PER_PAGE = 25

  SORT_COLUMNS = {
    "created_at"       => "trans_sellout_account_uploads.created_at",
    "distributor_code" => "trans_sellout_account_uploads.distributor_code",
    "period"           => :period,
    "row_count"        => "trans_sellout_account_uploads.row_count",
    "netto_wise_sum"   => "trans_sellout_account_uploads.netto_wise_sum",
    "status"           => "trans_sellout_account_uploads.status"
  }.freeze

  def index
    scope = TransSelloutAccountUpload.includes(:user)

    scope = scope.where(distributor_code: params[:distributor_code]) if params[:distributor_code].present?
    scope = scope.where(period_year: params[:year])                  if params[:year].present?
    scope = scope.where(period_month: params[:month])                if params[:month].present?
    scope = scope.where(status: params[:status])                     if params[:status].present?
    if params[:search].present?
      scope = scope.where("filename ILIKE ?",
        "%#{ActiveRecord::Base.sanitize_sql_like(params[:search])}%")
    end

    sort_key = SORT_COLUMNS.key?(params[:sort]) ? params[:sort] : "created_at"
    dir      = params[:direction] == "asc" ? "ASC" : "DESC"
    col      = SORT_COLUMNS[sort_key]
    if col == :period
      scope = scope.order(Arel.sql(
        "trans_sellout_account_uploads.period_year #{dir}, trans_sellout_account_uploads.period_month #{dir}"
      ))
    else
      scope = scope.order(Arel.sql("#{col} #{dir}"))
    end

    total   = scope.count
    page    = (params[:page] || 1).to_i.clamp(1, Float::INFINITY)
    offset  = (page - 1) * PER_PAGE
    uploads = scope.limit(PER_PAGE).offset(offset)

    available_distributor_codes = TransSelloutAccountUpload
      .distinct.pluck(:distributor_code).compact.sort
    available_years = TransSelloutAccountUpload
      .distinct.pluck(:period_year).compact.sort.reverse

    render inertia: "admin/trans_sellout_account/Uploads", props: {
      uploads:                     uploads.map { |u| serialize(u) },
      total:                       total,
      page:                        page,
      per_page:                    PER_PAGE,
      sort:                        sort_key,
      direction:                   dir.downcase,
      filters:                     {
        distributor_code: params[:distributor_code].presence,
        year:             params[:year].presence,
        month:            params[:month].presence,
        status:           params[:status].presence,
        search:           params[:search].presence
      },
      available_distributor_codes: available_distributor_codes,
      available_years:             available_years
    }
  end

  # POST /admin/trans-sellout-account/uploads/preview
  # Accepts JSON metadata parsed browser-side. No file upload, no DB writes.
  # Body: { files_metadata: [{ filename, row_count, netto_wise_sum, distributor_code }] }
  def preview
    files_metadata = Array(params[:files_metadata])
    return render json: { error: "No files provided" }, status: :unprocessable_entity if files_metadata.empty?

    results = files_metadata.map do |meta|
      filename       = meta[:filename].to_s
      row_count      = meta[:row_count].to_i
      netto_wise_sum = meta[:netto_wise_sum].to_f

      info = TransSelloutAccountFileParser.parse_filename(filename)

      scope          = TransSelloutAccountTransaction.for_period(
        info[:distributor_code], info[:period_year], info[:period_month]
      )
      existing_count = scope.count
      existing_netto = scope.sum(:netto_wise)

      info.merge(
        filename:                filename,
        row_count:               row_count,
        netto_wise_sum:          netto_wise_sum,
        existing_row_count:      existing_count,
        existing_netto_wise_sum: existing_netto.to_f,
        will_replace:            existing_count > 0,
        is_unchanged:            existing_count > 0 &&
                                 existing_count == row_count &&
                                 existing_netto.to_d.round(4) == netto_wise_sum.to_d.round(4)
      )
    rescue ArgumentError => e
      { filename: meta[:filename].to_s, error: e.message }
    rescue => e
      { filename: meta[:filename].to_s, error: "Error: #{e.message}" }
    end

    render json: results
  end

  # POST /admin/trans-sellout-account/uploads
  # Called via raw fetch() from the frontend to support multipart file upload.
  def create
    files = Array(params[:files])
    return render json: { error: "No files provided." }, status: :unprocessable_entity if files.empty?

    queued     = 0
    upload_ids = []
    errors     = []

    files.each do |file|
      validate_file!(file)

      meta = TransSelloutAccountFileParser.parse_filename(file.original_filename)

      # Cancel any pending uploads for the same distributor+period so they
      # don't double-process after this one lands.
      TransSelloutAccountUpload
        .where(distributor_code: meta[:distributor_code],
               period_year:      meta[:period_year],
               period_month:     meta[:period_month])
        .where(status: "pending")
        .update_all(status: "cancelled")

      upload = TransSelloutAccountUpload.new(
        user:             Current.user,
        filename:         file.original_filename,
        distributor_code: meta[:distributor_code],
        distributor_name: meta[:distributor_name],
        period_year:      meta[:period_year],
        period_month:     meta[:period_month],
        status:           "pending"
      )
      upload.file.attach(
        io:           file.tempfile,
        filename:     file.original_filename,
        content_type: file.content_type
      )
      if upload.save
        TransSelloutAccountImportJob.perform_later(upload.id)
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

  # PATCH /admin/trans-sellout-account/uploads/:id/cancel
  def cancel
    upload = TransSelloutAccountUpload.find(params[:id])
    upload.update!(status: "cancelled") if upload.in_flight?
    head :ok
  end

  private
    def serialize(upload)
      {
        id:                 upload.id,
        filename:           upload.filename,
        distributor_code:   upload.distributor_code,
        distributor_name:   upload.distributor_name,
        period_year:        upload.period_year,
        period_month:       upload.period_month,
        period_label:       upload.period_label,
        status:             upload.status,
        row_count:          upload.row_count,
        netto_wise_sum:     upload.netto_wise_sum&.to_f,
        replaced_row_count: upload.replaced_row_count,
        error_message:      upload.error_message,
        imported_at:        upload.imported_at&.iso8601,
        created_at:         upload.created_at.iso8601,
        uploaded_by:        upload.user&.email
      }
    end

    def validate_file!(file)
      raise ArgumentError, "Invalid file object." unless file.respond_to?(:original_filename)
      ext = File.extname(file.original_filename).downcase
      raise ArgumentError, "\"#{file.original_filename}\" bukan file .xlsx." unless ext == ".xlsx"
    end
end
