# frozen_string_literal: true

class CreateMarketShareB2bTables < ActiveRecord::Migration[8.0]
  def change
    create_table :market_share_b2b_uploads do |t|
      t.references :user, null: false, foreign_key: true
      t.string   :filename,          null: false
      t.string   :account_code,      null: false
      t.string   :account_name,      null: false
      t.string   :report_type,       null: false
      t.string   :template_version,  null: false
      t.integer  :period_year_from,  null: false
      t.integer  :period_month_from, null: false
      t.integer  :period_year_to,    null: false
      t.integer  :period_month_to,   null: false
      t.string   :status,            null: false, default: "pending"
      t.integer  :row_count
      t.integer  :replaced_row_count
      t.text     :error_message
      t.datetime :imported_at
      t.timestamps
    end

    add_index :market_share_b2b_uploads, :account_code
    add_index :market_share_b2b_uploads, :status
    add_index :market_share_b2b_uploads, :created_at

    create_table :market_share_b2b_records do |t|
      t.references :market_share_b2b_upload, null: false, foreign_key: true
      t.string   :account_code,        null: false
      t.string   :account_name,        null: false
      t.integer  :period_year,         null: false
      t.integer  :period_month,        null: false
      t.string   :report_type,         null: false
      t.string   :category
      t.string   :brand
      t.string   :product_name
      t.string   :dc_name
      t.decimal  :market_share_pct,    precision: 10, scale: 4
      t.decimal  :market_share_ly_pct, precision: 10, scale: 4
      t.integer  :ranking
      t.integer  :total_plu
      t.decimal  :growth_pct,          precision: 10, scale: 4
    end

    add_index :market_share_b2b_records,
              %i[account_code report_type period_year period_month],
              name: "index_ms_b2b_records_on_account_period"
  end
end
