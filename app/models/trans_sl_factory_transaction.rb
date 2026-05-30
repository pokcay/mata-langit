# frozen_string_literal: true

class TransSlFactoryTransaction < ApplicationRecord
  belongs_to :trans_sl_factory_upload

  scope :for_period, ->(year, month) {
    where(period_year: year, period_month: month)
  }
end
