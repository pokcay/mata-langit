# frozen_string_literal: true

class MasterListingCost < ApplicationRecord
  belongs_to :master_listing_upload

  scope :for_period, ->(year, month) {
    where(period_year: year, period_month: month)
  }
end
