# frozen_string_literal: true

class MarketShareB2bUpload < ApplicationRecord
  belongs_to :user
  has_many :market_share_b2b_records, dependent: :delete_all
  has_one_attached :file

  STATUSES      = %w[pending processing completed failed cancelled].freeze
  ACCOUNT_CODES = %w[IDG IDM MIDI SAT].freeze

  validates :filename, :account_code, :account_name, :report_type, :template_version,
            :period_year_from, :period_month_from, :period_year_to, :period_month_to,
            :status, presence: true
  validates :status,       inclusion: { in: STATUSES }
  validates :account_code, inclusion: { in: ACCOUNT_CODES }

  scope :recent, -> { order(created_at: :desc) }

  def period_label
    from = Date.new(period_year_from, period_month_from, 1).strftime("%b %Y")
    to   = Date.new(period_year_to,   period_month_to,   1).strftime("%b %Y")
    from == to ? from : "#{from} – #{to}"
  end

  def completed?  = status == "completed"
  def failed?     = status == "failed"
  def processing? = status == "processing"
  def pending?    = status == "pending"
  def cancelled?  = status == "cancelled"
  def in_flight?  = status.in?(%w[pending processing])
end
