# frozen_string_literal: true

class Admin::TransSlFactory::UploadsController < Admin::BaseController
  PER_PAGE = 25

  SORT_COLUMNS = {
    "created_at"    => "trans_sl_factory_uploads.created_at",
    "period"        => :period,
    "row_count"     => "trans_sl_factory_uploads.row_count",
    "value_net_sum" => "trans_sl_factory_uploads.value_net_sum",
    "status"        => "trans_sl_factory_uploads.status"
  }.freeze

  # GET /admin/trans-sl-factory/uploads
  def index
    scope = TransSlFactoryUpload.includes(:user)

    scope = scope.where(period_year: params[:year])   if params[:year].present?
    scope = scope.where(period_month: params[:month])  if params[:month].present?
    scope = scope.where(status: params[:status])       if params[:status].present?
    if params[:search].present?
      scope = scope.where("filename ILIKE ?",
        "%#{ActiveRecord::Base.sanitize_sql_like(params[:search])}%")
    end

    sort_key = SORT_COLUMNS.key?(params[:sort]) ? params[:sort] : "created_at"
    dir      = params[:direction] == "asc" ? "ASC" : "DESC"
    col      = SORT_COLUMNS[sort_key]
    if col == :period
      scope = scope.order(Arel.sql(
        "trans_sl_factory_uploads.period_year #{dir}, trans_sl_factory_uploads.period_month #{dir}"
      ))
    else
      scope = scope.order(Arel.sql("#{col} #{dir}"))
    end

    total   = scope.count
    page    = (params[:page] || 1).to_i.clamp(1, Float::INFINITY)
    offset  = (page - 1) * PER_PAGE
    uploads = scope.limit(PER_PAGE).offset(offset)

    available_years = TransSlFactoryUpload
      .distinct.pluck(:period_year).compact.sort.reverse

    render inertia: "admin/trans_sl_factory/Uploads", props: {
      uploads:         uploads.map { |u| serialize(u) },
      total:           total,
      page:            page,
      per_page:        PER_PAGE,
      sort:            sort_key,
      direction:       dir.downcase,
      filters:         {
        year:   params[:year].presence,
        month:  params[:month].presence,
        status: params[:status].presence,
        search: params[:search].presence
      },
      available_years: available_years
    }
  end

  # POST /admin/trans-sl-factory/uploads/preview
  # Accepts JSON metadata parsed browser-side. No file upload, no DB writes.
  # Body: { files_metadata: [{ filename, period_year, period_month, row_count, value_net_sum }] }
  def preview
    files_metadata = Array(params[:files_metadata])
    return render json: { error: "No files provided" }, status: :unprocessable_entity if files_metadata.empty?

    results = files_metadata.map do |meta|
      filename      = meta[:filename].to_s
      period_year   = meta[:period_year].to_i
      period_month  = meta[:period_month].to_i
      row_count     = meta[:row_count].to_i
      value_net_sum = meta[:value_net_sum].to_f

      unless (1..12).cover?(period_month) && period_year > 1900
        raise ArgumentError, "Periode tidak valid pada \"#{filename}\"."
      end

      scope          = TransSlFactoryTransaction.for_period(period_year, period_month)
      existing_count = scope.count
      existing_value = scope.sum(:value_net)

      {
        filename:               filename,
        period_year:            period_year,
        period_month:           period_month,
        period_label:           Date.new(period_year, period_month, 1).strftime("%b %Y"),
        row_count:              row_count,
        value_net_sum:          value_net_sum,
        existing_row_count:     existing_count,
        existing_value_net_sum: existing_value.to_f,
        will_replace:           existing_count > 0,
        is_unchanged:           existing_count > 0 &&
                                existing_count == row_count &&
                                existing_value.to_d.round(4) == value_net_sum.to_d.round(4)
      }
    rescue ArgumentError => e
      { filename: meta[:filename].to_s, error: e.message }
    rescue => e
      { filename: meta[:filename].to_s, error: "Error: #{e.message}" }
    end

    render json: results
  end

  # POST /admin/trans-sl-factory/uploads
  # Called via raw fetch() from the frontend to support multipart file upload.
  def create
    files = Array(params[:files])
    return render json: { error: "No files provided." }, status: :unprocessable_entity if files.empty?

    queued     = 0
    upload_ids = []
    errors     = []

    files.each do |file|
      validate_file!(file)

      period = TransSlFactoryFileParser.read_period(file.tempfile.path)

      # Cancel any pending uploads for the same period so they don't
      # double-process after this one lands.
      TransSlFactoryUpload
        .where(period_year: period[:period_year], period_month: period[:period_month])
        .where(status: "pending")
        .update_all(status: "cancelled")

      upload = TransSlFactoryUpload.new(
        user:         Current.user,
        filename:     file.original_filename,
        period_year:  period[:period_year],
        period_month: period[:period_month],
        status:       "pending"
      )
      upload.file.attach(
        io:           file.tempfile,
        filename:     file.original_filename,
        content_type: file.content_type
      )
      if upload.save
        TransSlFactoryImportJob.perform_later(upload.id)
        upload_ids << upload.id
        queued += 1
      else
        errors << "#{file.original_filename}: #{upload.errors.full_messages.join(', ')}"
      end
    rescue ArgumentError => e
      errors << "#{file.try(:original_filename)}: #{e.message}"
    rescue => e
      errors << "#{file.try(:original_filename)}: #{e.message}"
    end

    if errors.any?
      render json: { error: errors.join(" | "), queued: queued, upload_ids: upload_ids },
             status: :unprocessable_entity
    else
      render json: { queued: queued, upload_ids: upload_ids }, status: :created
    end
  end

  # PATCH /admin/trans-sl-factory/uploads/:id/cancel
  # Called via raw fetch() — not Inertia's router — so head :ok is fine.
  def cancel
    upload = TransSlFactoryUpload.find(params[:id])
    upload.update!(status: "cancelled") if upload.in_flight?
    head :ok
  end

  private
    def serialize(upload)
      {
        id:                 upload.id,
        filename:           upload.filename,
        period_year:        upload.period_year,
        period_month:       upload.period_month,
        period_label:       upload.period_label,
        status:             upload.status,
        row_count:          upload.row_count,
        value_net_sum:      upload.value_net_sum&.to_f,
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
