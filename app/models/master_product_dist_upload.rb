# frozen_string_literal: true

class MasterProductDistUpload < ApplicationRecord
  belongs_to :user
  has_many :master_product_dist_rows, dependent: :delete_all
  has_one_attached :file

  STATUSES = %w[pending processing completed failed cancelled].freeze

  validates :filename, :distributor_sap_code, :distributor_name, :status, presence: true
  validates :status, inclusion: { in: STATUSES }

  scope :recent, -> { order(created_at: :desc) }
  scope :pending_or_processing, -> { where(status: %w[pending processing]) }

  def completed?  = status == "completed"
  def failed?     = status == "failed"
  def processing? = status == "processing"
  def pending?    = status == "pending"
  def cancelled?  = status == "cancelled"
  def in_flight?  = status.in?(%w[pending processing])
end
