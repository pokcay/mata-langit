# frozen_string_literal: true

class MarketShareB2bRecord < ApplicationRecord
  belongs_to :market_share_b2b_upload

  scope :for_period, ->(account_code, report_type, year, month) {
    where(account_code: account_code, report_type: report_type,
          period_year: year, period_month: month)
  }
end
