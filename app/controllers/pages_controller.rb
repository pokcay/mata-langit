# frozen_string_literal: true

class PagesController < ApplicationController
  allow_unauthenticated_access only: :home

  def home
    redirect_to dashboard_path if authenticated?
    render inertia: "Home"
  end
end
