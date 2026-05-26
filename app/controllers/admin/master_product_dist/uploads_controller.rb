# frozen_string_literal: true

class Admin::MasterProductDist::UploadsController < Admin::BaseController
  PER_PAGE = 25

  SORT_COLUMNS = {
    "created_at"       => "master_product_dist_uploads.created_at",
    "distributor_name" => "master_product_dist_uploads.distributor_name",
    "region"           => "master_product_dist_uploads.region",
    "row_count"        => "master_product_dist_uploads.row_count",
    "status"           => "master_product_dist_uploads.status",
  }.freeze

  def index
    scope = MasterProductDistUpload.includes(:user)

    scope = scope.where(region: params[:region])  if params[:region].present?
    scope = scope.where(status: params[:status])  if params[:status].present?
    if params[:search].present?
      scope = scope.where("filename ILIKE ?",
        "%#{ActiveRecord::Base.sanitize_sql_like(params[:search])}%")
    end

    sort_key = SORT_COLUMNS.key?(params[:sort]) ? params[:sort] : "created_at"
    dir      = params[:direction] == "asc" ? "ASC" : "DESC"
    scope    = scope.order(Arel.sql("#{SORT_COLUMNS[sort_key]} #{dir}"))

    total   = scope.count
    page    = (params[:page] || 1).to_i.clamp(1, Float::INFINITY)
    offset  = (page - 1) * PER_PAGE
    uploads = scope.limit(PER_PAGE).offset(offset)

    available_regions = MasterProductDistUpload.distinct.pluck(:region).compact.sort

    render inertia: "admin/master_product_dist/Uploads", props: {
      uploads:           uploads.map { |u| serialize(u) },
      total:             total,
      page:              page,
      per_page:          PER_PAGE,
      sort:              sort_key,
      direction:         dir.downcase,
      filters:           {
        region: params[:region].presence,
        status: params[:status].presence,
        search: params[:search].presence,
      },
      available_regions: available_regions,
    }
  end

  # POST /admin/master-product-dist/uploads/preview
  # Receives browser-parsed metadata; no file upload, no DB writes.
  # Body: { files_metadata: [{ filename, row_count, distributor_sap_code, distributor_name,
  #                            distributor_parent_name, region }] }
  def preview
    files_metadata = Array(params[:files_metadata])
    return render json: { error: "No files provided" }, status: :unprocessable_entity if files_metadata.empty?

    results = files_metadata.map do |meta|
      filename              = meta[:filename].to_s
      row_count             = meta[:row_count].to_i
      distributor_sap_code  = meta[:distributor_sap_code].to_s
      distributor_name      = meta[:distributor_name].to_s
      distributor_parent_name = meta[:distributor_parent_name].to_s
      region                = meta[:region].to_s

      existing_upload = MasterProductDistUpload
        .where(distributor_sap_code: distributor_sap_code, status: "completed")
        .order(imported_at: :desc)
        .first
      existing_count = existing_upload&.row_count.to_i

      {
        filename:               filename,
        distributor_sap_code:   distributor_sap_code,
        distributor_name:       distributor_name,
        distributor_parent_name: distributor_parent_name,
        region:                 region,
        row_count:              row_count,
        existing_row_count:     existing_count,
        will_replace:           existing_count > 0,
        is_unchanged:           existing_count > 0 && existing_count == row_count
      }
    rescue => e
      { filename: meta[:filename].to_s, error: "Error: #{e.message}" }
    end

    render json: results
  end

  # POST /admin/master-product-dist/uploads
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
      meta     = MasterProductDistFileParser.peek(tmp_path)

      # Cancel any pending uploads for the same distributor so they don't
      # double-process after this one lands.
      MasterProductDistUpload
        .where(distributor_sap_code: meta[:distributor_sap_code], status: "pending")
        .update_all(status: "cancelled")

      upload = MasterProductDistUpload.new(
        user:                   Current.user,
        filename:               file.original_filename,
        distributor_sap_code:   meta[:distributor_sap_code],
        distributor_name:       meta[:distributor_name],
        distributor_parent_name: meta[:distributor_parent_name],
        region:                 meta[:region],
        status:                 "pending"
      )
      upload.file.attach(
        io:           file.tempfile,
        filename:     file.original_filename,
        content_type: file.content_type
      )
      if upload.save
        MasterProductDistImportJob.perform_later(upload.id)
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

  # PATCH /admin/master-product-dist/uploads/:id/cancel
  # Called via raw fetch() from the progress view. Flips status to cancelled so
  # the background job detects it on the next batch loop and rolls back.
  def cancel
    upload = MasterProductDistUpload.find(params[:id])
    unless upload.user == Current.user
      return head :forbidden
    end

    upload.update!(status: "cancelled") if upload.pending? || upload.processing?
    MasterProductDistUploadChannel.broadcast_to(upload, {
      type:          "status_update",
      upload_id:     upload.id,
      status:        upload.status,
      row_count:     upload.row_count,
      error_message: upload.error_message
    })
    head :ok
  end

  private
    def serialize(upload)
      {
        id:                     upload.id,
        filename:               upload.filename,
        distributor_sap_code:   upload.distributor_sap_code,
        distributor_name:       upload.distributor_name,
        distributor_parent_name: upload.distributor_parent_name,
        region:                 upload.region,
        status:                 upload.status,
        row_count:              upload.row_count,
        replaced_row_count:     upload.replaced_row_count,
        error_message:          upload.error_message,
        imported_at:            upload.imported_at&.iso8601,
        created_at:             upload.created_at.iso8601,
        uploaded_by:            upload.user&.email
      }
    end

    def validate_file!(file)
      raise ArgumentError, "Invalid file object." unless file.respond_to?(:original_filename)
      ext = File.extname(file.original_filename).downcase
      raise ArgumentError, "\"#{file.original_filename}\" bukan file .xlsx." unless ext == ".xlsx"
    end
end
