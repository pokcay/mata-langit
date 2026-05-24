# frozen_string_literal: true

class TimeseriesUpload < ApplicationRecord
  belongs_to :user
  has_many :timeseries_transactions, dependent: :delete_all
  has_one_attached :file

  STATUSES = %w[pending processing completed failed cancelled].freeze
  SCHEMA_VERSIONS = %w[standard_pre2025 standard_2025 ecom_pre2025 ecom_2025].freeze

  validates :filename, :region, :period_year, :period_month, :schema_version, :status, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :schema_version, inclusion: { in: SCHEMA_VERSIONS }

  scope :recent, -> { order(created_at: :desc) }
  scope :pending_or_processing, -> { where(status: %w[pending processing]) }

  def period_label
    Date.new(period_year, period_month, 1).strftime("%B %Y")
  end

  def completed?  = status == "completed"
  def failed?     = status == "failed"
  def processing? = status == "processing"
  def pending?    = status == "pending"
  def cancelled?  = status == "cancelled"
  def in_flight?  = status.in?(%w[pending processing])
end
