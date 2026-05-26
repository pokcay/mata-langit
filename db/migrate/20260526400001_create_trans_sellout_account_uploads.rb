# frozen_string_literal: true

class CreateTransSelloutAccountUploads < ActiveRecord::Migration[8.0]
  def change
    create_table :trans_sellout_account_uploads do |t|
      t.references :user, null: false, foreign_key: true
      t.string  :filename,           null: false
      t.string  :distributor_code,   null: false
      t.string  :distributor_name,   null: false
      t.integer :period_year,        null: false
      t.integer :period_month,       null: false
      t.string  :status,             null: false, default: "pending"
      t.integer :row_count,          null: false, default: 0
      t.decimal :netto_wise_sum,     precision: 20, scale: 4
      t.integer :replaced_row_count, null: false, default: 0
      t.text    :error_message
      t.datetime :imported_at
      t.timestamps
    end

    add_index :trans_sellout_account_uploads, :distributor_code
    add_index :trans_sellout_account_uploads, :status
    add_index :trans_sellout_account_uploads,
              %i[distributor_code period_year period_month],
              name: "index_tsau_on_dist_and_period"
  end
end
