# frozen_string_literal: true

class Admin::DashboardController < Admin::BaseController
  def show
    now = Time.current
    render inertia: "admin/Dashboard", props: {
      stats: {
        total_users: User.count,
        admin_users: User.where(admin: true).count,
        new_users_this_week: User.where(created_at: 7.days.ago..).count,
        new_users_this_month: User.where(created_at: 30.days.ago..).count,
        inbox_unread: InboundEmail.unread.count,
        inbox_total: InboundEmail.count
      },
      recent_users: User.order(created_at: :desc).limit(5).map { |u|
        { id: u.id, email: u.email, admin: u.admin?, created_at: u.created_at.iso8601 }
      }
    }
  end
end
