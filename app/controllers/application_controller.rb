class ApplicationController < ActionController::Base
  include Authentication

  allow_browser versions: :modern

  inertia_share do
    {
      current_user: Current.user && {
        id: Current.user.id,
        email_address: Current.user.email_address,
        timezone: Current.user.timezone
      },
      flash: {
        notice: flash.notice,
        alert: flash.alert
      }
    }
  end
end
