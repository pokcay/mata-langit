# frozen_string_literal: true

class MasterOutletDistRecord < ApplicationRecord
  belongs_to :master_outlet_dist_upload

  scope :for_dist, ->(sap_code) { where(dist_sap_code: sap_code) }
end
