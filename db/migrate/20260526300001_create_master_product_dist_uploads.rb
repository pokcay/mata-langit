# frozen_string_literal: true

class CreateMasterProductDistUploads < ActiveRecord::Migration[8.0]
  def change
    create_table :master_product_dist_uploads do |t|
      t.references :user, null: false, foreign_key: true
      t.string  :filename,               null: false
      t.string  :distributor_sap_code,   null: false
      t.string  :distributor_name,       null: false
      t.string  :distributor_parent_name
      t.string  :region
      t.string  :status,                 null: false, default: "pending"
      t.integer :row_count,              null: false, default: 0
      t.integer :replaced_row_count,     null: false, default: 0
      t.text    :error_message
      t.datetime :imported_at
      t.timestamps
    end

    add_index :master_product_dist_uploads, :distributor_sap_code
    add_index :master_product_dist_uploads, :status
  end
end
