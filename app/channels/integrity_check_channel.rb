# frozen_string_literal: true

class IntegrityCheckChannel < ApplicationCable::Channel
  def subscribed
    check = IntegrityCheck.find_by(id: params[:check_id])
    if check&.user == current_user
      stream_for check
      transmit({ type: "status_update" }.merge(serialize(check)))
    else
      reject
    end
  end

  private
    def serialize(check)
      {
        check_id:            check.id,
        status:              check.status,
        matched_count:       check.matched_count,
        mismatched_count:    check.mismatched_count,
        missing_in_db_count: check.missing_in_db_count,
        extra_in_db_count:   check.extra_in_db_count,
        error_message:       check.error_message
      }
    end
end
