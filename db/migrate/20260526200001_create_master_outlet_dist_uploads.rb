# frozen_string_literal: true

class CreateMasterOutletDistUploads < ActiveRecord::Migration[8.0]
  def change
    create_table :master_outlet_dist_uploads do |t|
      t.references :user, null: false, foreign_key: true
      t.string  :filename,            null: false
      t.string  :dist_sap_code,       null: false
      t.string  :dist_name,           null: false
      t.string  :status,              null: false, default: "pending"
      t.integer :row_count,           null: false, default: 0
      t.integer :replaced_row_count,  null: false, default: 0
      t.text    :error_message
      t.datetime :imported_at
      t.timestamps
    end

    add_index :master_outlet_dist_uploads, :dist_sap_code
    add_index :master_outlet_dist_uploads, :status
  end
end
