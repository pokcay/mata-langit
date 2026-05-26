# frozen_string_literal: true

class CreateMasterOutletDistRecords < ActiveRecord::Migration[8.0]
  def change
    create_table :master_outlet_dist_records do |t|
      t.references :master_outlet_dist_upload, null: false, foreign_key: true

      t.string :region_name
      t.string :area_name
      t.string :dist_sap_code
      t.string :dist_parent_name
      t.bigint :dist_id
      t.string :dist_child_name
      t.string :outlet_dist_code
      t.string :outlet_national_code
      t.string :outlet_dist_name
      t.string :outlet_dist_address
      t.string :outlet_dist_status
    end

    add_index :master_outlet_dist_records, :dist_sap_code
    add_index :master_outlet_dist_records, :master_outlet_dist_upload_id,
              name: "index_mod_records_on_upload_id"
  end
end
