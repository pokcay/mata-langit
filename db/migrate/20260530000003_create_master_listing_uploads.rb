# frozen_string_literal: true

class CreateMasterListingUploads < ActiveRecord::Migration[8.0]
  def change
    create_table :master_listing_uploads do |t|
      t.references :user, null: false, foreign_key: true
      t.string   :filename,           null: false
      t.integer  :period_year,        null: false
      t.integer  :period_month,       null: false
      t.string   :status,             null: false, default: "pending"
      t.integer  :row_count,          null: false, default: 0
      t.bigint   :total_cost,         null: false, default: 0
      t.integer  :replaced_row_count, null: false, default: 0
      t.text     :error_message
      t.datetime :imported_at
      t.timestamps
    end

    add_index :master_listing_uploads, :status
    add_index :master_listing_uploads,
              %i[period_year period_month],
              name: "index_mlu_on_period"
  end
end
