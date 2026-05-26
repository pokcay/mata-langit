# frozen_string_literal: true

class TransSelloutAccountUpload < ApplicationRecord
  belongs_to :user
  has_many :trans_sellout_account_transactions, dependent: :delete_all
  has_one_attached :file

  STATUSES = %w[pending processing completed failed cancelled].freeze
  DISTRIBUTOR_CODES = %w[IDM IDG MIDI SAT SIL].freeze

  validates :filename, :distributor_code, :distributor_name,
            :period_year, :period_month, :status, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :distributor_code, inclusion: { in: DISTRIBUTOR_CODES }

  scope :recent, -> { order(created_at: :desc) }

  def period_label
    Date.new(period_year, period_month, 1).strftime("%b %Y")
  end

  def completed?  = status == "completed"
  def failed?     = status == "failed"
  def processing? = status == "processing"
  def pending?    = status == "pending"
  def cancelled?  = status == "cancelled"
  def in_flight?  = status.in?(%w[pending processing])
end
