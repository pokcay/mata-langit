# frozen_string_literal: true

class IntegrityCheck < ApplicationRecord
  belongs_to :user
  has_many :integrity_check_results, dependent: :destroy
  has_one_attached :file

  STATUSES = %w[pending processing completed failed cancelled].freeze

  validates :filename, :status, presence: true
  validates :status, inclusion: { in: STATUSES }

  scope :recent, -> { order(created_at: :desc) }

  def completed?  = status == "completed"
  def failed?     = status == "failed"
  def processing? = status == "processing"
  def pending?    = status == "pending"
  def cancelled?  = status == "cancelled"
  def in_flight?  = status.in?(%w[pending processing])

  def excludes_program? = !include_program
  def includes_program? = include_program

  def period_range_label
    return nil unless period_min_year && period_max_year
    min = Date.new(period_min_year, period_min_month, 1).strftime("%b %Y")
    max = Date.new(period_max_year, period_max_month, 1).strftime("%b %Y")
    min == max ? min : "#{min} – #{max}"
  end
end
