# frozen_string_literal: true

class Admin::Timeseries::UploadsController < Admin::BaseController
  ALLOWED_TYPES = %w[
    application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    application/vnd.ms-excel
  ].freeze

  PER_PAGE = 25

  SORT_COLUMNS = {
    "created_at"     => "timeseries_uploads.created_at",
    "region"         => "timeseries_uploads.region",
    "period"         => :period,
    "row_count"      => "timeseries_uploads.row_count",
    "netto_wise_sum" => "timeseries_uploads.netto_wise_sum",
    "status"         => "timeseries_uploads.status",
  }.freeze

  def index
    scope = TimeseriesUpload.includes(:user)

    scope = scope.where(region: params[:region])      if params[:region].present?
    scope = scope.where(period_year: params[:year])   if params[:year].present?
    scope = scope.where(period_month: params[:month]) if params[:month].present?
    scope = scope.where(status: params[:status])      if params[:status].present?
    if params[:search].present?
      scope = scope.where("filename ILIKE ?",
        "%#{ActiveRecord::Base.sanitize_sql_like(params[:search])}%")
    end

    sort_key = SORT_COLUMNS.key?(params[:sort]) ? params[:sort] : "created_at"
    dir      = params[:direction] == "asc" ? "ASC" : "DESC"
    col      = SORT_COLUMNS[sort_key]
    if col == :period
      scope = scope.order(Arel.sql(
        "timeseries_uploads.period_year #{dir}, timeseries_uploads.period_month #{dir}"
      ))
    else
      scope = scope.order(Arel.sql("#{col} #{dir}"))
    end

    total   = scope.count
    page    = (params[:page] || 1).to_i.clamp(1, Float::INFINITY)
    offset  = (page - 1) * PER_PAGE
    uploads = scope.limit(PER_PAGE).offset(offset)

    available_regions = TimeseriesUpload.distinct.pluck(:region).sort
    available_years   = TimeseriesUpload.distinct.pluck(:period_year).sort.reverse

    # Sanitise return_to to relative paths only
    raw_return_to     = params[:return_to].presence
    safe_return_to    = raw_return_to&.then { |u| u.start_with?("/") && !u.start_with?("//") && !u.include?("://") ? u : nil }
    integrity_outcome = params[:integrity_outcome].presence

    render inertia: "admin/timeseries/Uploads", props: {
      uploads:            uploads.map { |u| serialize(u) },
      total:              total,
      page:               page,
      per_page:           PER_PAGE,
      sort:               sort_key,
      direction:          dir.downcase,
      filters:            {
        region: params[:region].presence,
        year:   params[:year].presence,
        month:  params[:month].presence,
        status: params[:status].presence,
        search: params[:search].presence,
      },
      available_regions:  available_regions,
      available_years:    available_years,
      integrity_return_to: safe_return_to,
      integrity_outcome:   integrity_outcome,
    }
  end

  # POST /admin/timeseries/uploads/preview
  # Accepts JSON metadata (parsed browser-side). No file upload, no Excel reading.
  # Body: { files_metadata: [{ filename, row_count, netto_wise_sum }, ...] }
  def preview
    files_metadata = Array(params[:files_metadata])
    return render json: { error: "No files provided" }, status: :unprocessable_entity if files_metadata.empty?

    results = files_metadata.map do |meta|
      filename       = meta[:filename].to_s
      row_count      = meta[:row_count].to_i
      netto_wise_sum = meta[:netto_wise_sum].to_f

      info = TimeseriesFileParser.parse_filename(filename)
      scope          = TimeseriesTransaction.for_period(info[:region], info[:period_year], info[:period_month])
      existing_count = scope.count
      existing_netto = scope.sum(:netto_wise)

      info.merge(
        filename:               filename,
        row_count:              row_count,
        netto_wise_sum:         netto_wise_sum,
        existing_row_count:     existing_count,
        existing_netto_wise_sum: existing_netto.to_f,
        will_replace:           existing_count > 0,
        is_unchanged:           existing_count > 0 &&
                                existing_count == row_count &&
                                existing_netto.round(4) == netto_wise_sum.to_d.round(4)
      )
    rescue ArgumentError => e
      { filename: meta[:filename].to_s, error: e.message }
    rescue => e
      { filename: meta[:filename].to_s, error: "Error: #{e.message}" }
    end

    render json: results
  end

  # POST /admin/timeseries/uploads
  # Called via raw fetch() from the frontend (not Inertia router) to support multipart file upload.
  def create
    files = Array(params[:files])
    if files.empty?
      return render json: { error: "No files provided." }, status: :unprocessable_entity
    end

    queued     = 0
    upload_ids = []
    errors     = []

    files.each do |file|
      validate_file!(file)

      meta = TimeseriesFileParser.parse_filename(file.original_filename)

      # Cancel any pending uploads for the same period so they don't queue behind
      # this one. Processing uploads are left alone — the concurrency lock in the
      # job ensures they finish before the new job starts.
      TimeseriesUpload
        .where(region: meta[:region], period_year: meta[:period_year], period_month: meta[:period_month])
        .where(status: "pending")
        .update_all(status: "cancelled")

      upload = TimeseriesUpload.new(
        user: Current.user,
        filename: file.original_filename,
        region: meta[:region],
        period_year: meta[:period_year],
        period_month: meta[:period_month],
        schema_version: meta[:schema_version],
        status: "pending"
      )
      upload.file.attach(
        io: file.tempfile,
        filename: file.original_filename,
        content_type: file.content_type
      )
      if upload.save
        TimeseriesImportJob.perform_later(upload.id)
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

  # DELETE /admin/timeseries/uploads/:id
  def destroy
    upload = TimeseriesUpload.find(params[:id])

    # Prevent deleting a job that is actively running
    if upload.in_flight?
      return redirect_back(
        fallback_location: admin_timeseries_uploads_path,
        alert: "Upload \"#{upload.filename}\" sedang diproses. Batalkan dulu sebelum menghapus."
      )
    end

    upload.file.purge_later
    upload.destroy!

    redirect_to admin_timeseries_uploads_path(
      region: params[:region], sort: params[:sort], direction: params[:direction],
      year: params[:year], month: params[:month], status: params[:status], page: params[:page]
    ), notice: "Upload berhasil dihapus."
  end

  # DELETE /admin/timeseries/uploads/bulk_destroy
  def bulk_destroy
    ids = Array(params[:ids]).map(&:to_i).reject(&:zero?)
    uploads = TimeseriesUpload.where(id: ids)

    in_flight, deletable = uploads.partition(&:in_flight?)

    deletable.each do |u|
      u.file.purge_later
      u.destroy!
    end

    notice_parts = []
    notice_parts << "#{deletable.size} upload dihapus." if deletable.any?
    if in_flight.any?
      notice_parts << "#{in_flight.size} upload dilewati karena sedang diproses (batalkan dulu)."
    end
    notice_parts << "Tidak ada upload yang dihapus." if notice_parts.empty?

    redirect_to admin_timeseries_uploads_path(
      region: params[:region], sort: params[:sort], direction: params[:direction],
      year: params[:year], month: params[:month], status: params[:status], page: params[:page]
    ), notice: notice_parts.join(" ")
  end

  # PATCH /admin/timeseries/uploads/:id/cancel
  # Called via raw fetch() from the frontend. Returns 200 OK in all cases.
  def cancel
    upload = TimeseriesUpload.find(params[:id])
    if upload.in_flight?
      upload.update!(status: "cancelled")
      TimeseriesUploadChannel.broadcast_to(upload, {
        type:           "status_update",
        upload_id:      upload.id,
        status:         "cancelled",
        row_count:      upload.row_count,
        netto_wise_sum: upload.netto_wise_sum&.to_f,
        error_message:  nil
      })
    end
    head :ok
  end

  private
    def serialize(upload)
      {
        id: upload.id,
        filename: upload.filename,
        region: upload.region,
        period_year: upload.period_year,
        period_month: upload.period_month,
        period_label: upload.period_label,
        schema_version: upload.schema_version,
        status: upload.status,
        row_count: upload.row_count,
        netto_wise_sum: upload.netto_wise_sum&.to_f,
        replaced_row_count: upload.replaced_row_count,
        error_message: upload.error_message,
        imported_at: upload.imported_at&.iso8601,
        created_at: upload.created_at.iso8601,
        uploaded_by: upload.user&.email
      }
    end

    def validate_file!(file)
      unless file.respond_to?(:original_filename)
        raise ArgumentError, "Invalid file object."
      end
      ext = File.extname(file.original_filename).downcase
      unless ext == ".xlsx"
        raise ArgumentError, "\"#{file.original_filename}\" bukan file .xlsx."
      end
    end
end
