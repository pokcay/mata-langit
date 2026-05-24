# frozen_string_literal: true

class TimeseriesUploadChannel < ApplicationCable::Channel
  def subscribed
    upload = TimeseriesUpload.find_by(id: params[:upload_id])
    if upload&.user == current_user
      stream_for upload
      # Transmit current state immediately so the frontend is in sync
      # even when the job started before the browser finished subscribing.
      transmit({ type: "status_update" }.merge(serialize(upload)))
    else
      reject
    end
  end

  private
    def serialize(u)
      {
        upload_id:      u.id,
        status:         u.status,
        row_count:      u.row_count,
        netto_wise_sum: u.netto_wise_sum&.to_f,
        error_message:  u.error_message
      }
    end
end
