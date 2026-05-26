# frozen_string_literal: true

class Admin::MasterOutletDist::UploadsController < Admin::BaseController
  PER_PAGE = 25

  SORT_COLUMNS = {
    "created_at"         => "master_outlet_dist_uploads.created_at",
    "dist_name"          => "master_outlet_dist_uploads.dist_name",
    "dist_sap_code"      => "master_outlet_dist_uploads.dist_sap_code",
    "row_count"          => "master_outlet_dist_uploads.row_count",
    "replaced_row_count" => "master_outlet_dist_uploads.replaced_row_count",
    "status"             => "master_outlet_dist_uploads.status"
  }.freeze

  def index
    scope = MasterOutletDistUpload.includes(:user)

    scope = scope.where(dist_name: params[:dist_name]) if params[:dist_name].present?
    scope = scope.where(status: params[:status])       if params[:status].present?
    if params[:search].present?
      scope = scope.where("filename ILIKE ?",
        "%#{ActiveRecord::Base.sanitize_sql_like(params[:search])}%")
    end

    sort_key = SORT_COLUMNS.key?(params[:sort]) ? params[:sort] : "created_at"
    dir      = params[:direction] == "asc" ? "ASC" : "DESC"
    col      = SORT_COLUMNS[sort_key]
    scope    = scope.order(Arel.sql("#{col} #{dir}"))

    total   = scope.count
    page    = (params[:page] || 1).to_i.clamp(1, Float::INFINITY)
    offset  = (page - 1) * PER_PAGE
    uploads = scope.limit(PER_PAGE).offset(offset)

    available_dist_names = MasterOutletDistUpload.distinct.pluck(:dist_name).sort

    render inertia: "admin/master_outlet_dist/Uploads", props: {
      uploads:              uploads.map { |u| serialize(u) },
      total:                total,
      page:                 page,
      per_page:             PER_PAGE,
      sort:                 sort_key,
      direction:            dir.downcase,
      filters:              {
        dist_name: params[:dist_name].presence,
        status:    params[:status].presence,
        search:    params[:search].presence
      },
      available_dist_names: available_dist_names
    }
  end

  # POST /admin/master-outlet-dist/uploads/preview
  # Receives browser-parsed metadata; no file upload, no DB writes.
  # Body: { files_metadata: [{ filename, row_count, dist_sap_code, dist_name }, ...] }
  def preview
    files_metadata = Array(params[:files_metadata])
    return render json: { error: "No files provided" }, status: :unprocessable_entity if files_metadata.empty?

    results = files_metadata.map do |meta|
      filename     = meta[:filename].to_s
      row_count    = meta[:row_count].to_i
      dist_sap_code = meta[:dist_sap_code].to_s
      dist_name    = meta[:dist_name].to_s

      existing_upload = MasterOutletDistUpload
        .where(dist_sap_code: dist_sap_code, status: "completed")
        .order(imported_at: :desc)
        .first
      existing_count = existing_upload&.row_count.to_i

      {
        filename:           filename,
        dist_sap_code:      dist_sap_code,
        dist_name:          dist_name,
        row_count:          row_count,
        existing_row_count: existing_count,
        will_replace:       existing_count > 0,
        is_unchanged:       existing_count > 0 && existing_count == row_count
      }
    rescue => e
      { filename: meta[:filename].to_s, error: "Error: #{e.message}" }
    end

    render json: results
  end

  # POST /admin/master-outlet-dist/uploads
  # Called via raw fetch() (multipart). Queues import jobs.
  def create
    files = Array(params[:files])
    return render json: { error: "No files provided." }, status: :unprocessable_entity if files.empty?

    queued     = 0
    upload_ids = []
    errors     = []

    files.each do |file|
      validate_file!(file)

      tmp_path = file.tempfile.path
      meta     = MasterOutletDistFileParser.peek(tmp_path)

      # Cancel any pending uploads for the same distributor so they don't
      # double-process after this one lands.
      MasterOutletDistUpload
        .where(dist_sap_code: meta[:dist_sap_code], status: "pending")
        .update_all(status: "cancelled")

      upload = MasterOutletDistUpload.new(
        user:         Current.user,
        filename:     file.original_filename,
        dist_sap_code: meta[:dist_sap_code],
        dist_name:    meta[:dist_name],
        status:       "pending"
      )
      upload.file.attach(
        io:           file.tempfile,
        filename:     file.original_filename,
        content_type: file.content_type
      )
      if upload.save
        MasterOutletDistImportJob.perform_later(upload.id)
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

  # PATCH /admin/master-outlet-dist/uploads/:id/cancel
  def cancel
    upload = MasterOutletDistUpload.find(params[:id])
    if upload.in_flight?
      upload.update!(status: "cancelled")
      MasterOutletDistUploadChannel.broadcast_to(upload, {
        type:          "status_update",
        upload_id:     upload.id,
        status:        "cancelled",
        row_count:     upload.row_count,
        error_message: nil
      })
    end
    head :ok
  end

  private
    def serialize(upload)
      {
        id:                 upload.id,
        filename:           upload.filename,
        dist_sap_code:      upload.dist_sap_code,
        dist_name:          upload.dist_name,
        status:             upload.status,
        row_count:          upload.row_count,
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
