# frozen_string_literal: true

class MasterRentalCost < ApplicationRecord
  belongs_to :master_rental_upload

  scope :for_period, ->(year, month) {
    where(period_year: year, period_month: month)
  }
end
