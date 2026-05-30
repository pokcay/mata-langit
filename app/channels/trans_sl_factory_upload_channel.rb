# frozen_string_literal: true

class TransSlFactoryUploadChannel < ApplicationCable::Channel
  def subscribed
    upload = TransSlFactoryUpload.find_by(id: params[:upload_id])
    if upload&.user == current_user
      stream_for upload
      transmit({ type: "status_update" }.merge(serialize(upload)))
    else
      reject
    end
  end

  private
    def serialize(u)
      {
        upload_id:     u.id,
        status:        u.status,
        row_count:     u.row_count,
        error_message: u.error_message
      }
    end
end
