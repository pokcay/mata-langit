# frozen_string_literal: true

class Admin::Data::KaProfitability::UploadsController < Admin::BaseController
  PER_PAGE = 25

  SORT_COLUMNS = {
    "created_at"  => "ka_profitability_uploads.created_at",
    "filename"    => "ka_profitability_uploads.filename",
    "fiscal_year" => "ka_profitability_uploads.fiscal_year",
    "status"      => "ka_profitability_uploads.status"
  }.freeze

  # GET /admin/data/ka-profitability/uploads
  def index
    scope = KaProfitabilityUpload.includes(:user)

    scope = scope.where(status: params[:status])           if params[:status].present?
    scope = scope.where(fiscal_year: params[:fiscal_year]) if params[:fiscal_year].present?

    sort_key = SORT_COLUMNS.key?(params[:sort]) ? params[:sort] : "created_at"
    dir      = params[:direction] == "asc" ? "ASC" : "DESC"
    col      = SORT_COLUMNS[sort_key]
    scope    = scope.order(Arel.sql("#{col} #{dir}"))

    total   = scope.count
    page    = (params[:page] || 1).to_i.clamp(1, Float::INFINITY)
    offset  = (page - 1) * PER_PAGE
    uploads = scope.limit(PER_PAGE).offset(offset)

    available_fiscal_years = KaProfitabilityUpload.distinct.pluck(:fiscal_year).compact.sort.reverse

    render inertia: "admin/data/ka_profitability/Uploads", props: {
      uploads:                uploads.map { |u| serialize(u) },
      total:                  total,
      page:                   page,
      per_page:               PER_PAGE,
      sort:                   sort_key,
      direction:              dir.downcase,
      filters:                {
        status:      params[:status].presence,
        fiscal_year: params[:fiscal_year].presence
      },
      available_fiscal_years: available_fiscal_years
    }
  end

  # POST /admin/data/ka-profitability/uploads/preview
  # Body: { files_metadata: [{ filename, fiscal_year, outlet_count, row_count }] }
  # Returns JSON — called via raw fetch(), not Inertia router.
  def preview
    files_metadata = Array(params[:files_metadata])
    return render json: { error: "No files provided" },
                  status: :unprocessable_entity if files_metadata.empty?

    results = files_metadata.map do |meta|
      fiscal_year = meta[:fiscal_year].to_s
      existing    = KaProfitabilityUpload
        .where(fiscal_year: fiscal_year)
        .where(status: "completed")
        .order(created_at: :desc)
        .first

      meta.to_unsafe_h.symbolize_keys.merge(
        existing_fiscal_year: fiscal_year,
        existing_upload:      existing ? serialize_existing(existing) : nil,
        will_replace:         existing.present?
      )
    rescue => e
      { filename: meta[:filename].to_s, error: e.message }
    end

    render json: results
  end

  # PATCH /admin/data/ka-profitability/uploads/:id/cancel
  def cancel
    upload = KaProfitabilityUpload.find(params[:id])
    upload.update!(status: "cancelled") if upload.in_flight?
    head :ok
  end

  # POST /admin/data/ka-profitability/uploads
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

      meta = KaProfitabilityFileParser.detect(file.tempfile.path, file.original_filename)

      upload = KaProfitabilityUpload.new(
        user:        Current.user,
        filename:    file.original_filename,
        fiscal_year: meta[:fiscal_year],
        status:      "pending"
      )
      upload.file.attach(
        io:           file.tempfile,
        filename:     file.original_filename,
        content_type: file.content_type
      )

      if upload.save
        KaProfitabilityImportJob.perform_later(upload.id)
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

  private

    def serialize(upload)
      {
        id:           upload.id,
        filename:     upload.filename,
        fiscal_year:  upload.fiscal_year,
        status:       upload.status,
        outlet_count: upload.outlet_count,
        record_count: upload.record_count,
        is_latest:    upload.is_latest,
        error_message: upload.error_message,
        imported_at:  upload.imported_at&.iso8601,
        created_at:   upload.created_at.iso8601,
        uploaded_by:  upload.user&.email
      }
    end

    def serialize_existing(upload)
      {
        id:          upload.id,
        filename:    upload.filename,
        imported_at: upload.imported_at&.iso8601,
        created_at:  upload.created_at.iso8601
      }
    end

    def validate_file!(file)
      raise ArgumentError, "Invalid file object." unless file.respond_to?(:original_filename)
      ext = File.extname(file.original_filename).downcase
      raise ArgumentError, "\"#{file.original_filename}\" bukan file .xlsx." unless ext == ".xlsx"
    end
end
