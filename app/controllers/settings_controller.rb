class SettingsController < ApplicationController
  def show
    render inertia: "Settings", props: {
      include_program_in_integrity_checks: Current.user.include_program_in_integrity_checks
    }
  end

  def update
    if Current.user.update(settings_params)
      redirect_to settings_path, notice: "Preferensi tersimpan."
    else
      redirect_to settings_path,
                  inertia: { errors: Current.user.errors.to_hash(true).transform_values(&:first) }
    end
  end

  private
    def settings_params
      params.permit(:include_program_in_integrity_checks)
    end
end
