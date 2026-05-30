# frozen_string_literal: true

class TransSlFactoryUpload < ApplicationRecord
  belongs_to :user
  has_many :trans_sl_factory_transactions, dependent: :delete_all
  has_one_attached :file

  STATUSES = %w[pending processing completed failed cancelled].freeze

  validates :filename, :period_year, :period_month, :status, presence: true
  validates :status, inclusion: { in: STATUSES }

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
