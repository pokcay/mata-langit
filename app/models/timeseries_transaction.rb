# frozen_string_literal: true

class TimeseriesTransaction < ApplicationRecord
  belongs_to :timeseries_upload

  scope :for_period, ->(region, year, month) {
    where(region: region, period_year: year, period_month: month)
  }
end
