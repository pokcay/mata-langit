# frozen_string_literal: true

class TransSelloutAccountTransaction < ApplicationRecord
  belongs_to :trans_sellout_account_upload

  scope :for_period, ->(distributor_code, year, month) {
    where(distributor_code: distributor_code, period_year: year, period_month: month)
  }
end
