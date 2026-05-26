# frozen_string_literal: true

class IntegrityCheckResult < ApplicationRecord
  belongs_to :integrity_check

  OUTCOMES = %w[matched mismatched missing_in_db extra_in_db].freeze

  validates :region, :period_year, :period_month, :outcome, presence: true
  validates :outcome, inclusion: { in: OUTCOMES }
end
