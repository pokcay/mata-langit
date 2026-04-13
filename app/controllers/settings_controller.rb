class SettingsController < ApplicationController
  def show
    render inertia: "Settings"
  end
end
