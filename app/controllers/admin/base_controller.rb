class Admin::BaseController < ApplicationController
  before_action :require_admin

  inertia_share do
    latest = IntegrityCheck.where(status: "completed").order(checked_at: :desc).first
    mismatch_count = latest ? latest.mismatched_count.to_i + latest.missing_in_db_count.to_i : 0
    {
      admin_inbox_unread_count:       InboundEmail.unread.count,
      data_integrity_mismatch_count:  mismatch_count,
    }
  end

  private
    def require_admin
      unless Current.user&.admin?
        redirect_to root_path, alert: "You don't have access to that page."
      end
    end
end
