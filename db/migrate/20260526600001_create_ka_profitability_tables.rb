# frozen_string_literal: true

class CreateKaProfitabilityTables < ActiveRecord::Migration[8.0]
  def change
    create_table :ka_profitability_uploads do |t|
      t.references :user,       null: false, foreign_key: true
      t.string     :filename,   null: false
      t.string     :fiscal_year, null: false
      t.string     :status,     null: false, default: "pending"
      t.integer    :outlet_count
      t.integer    :record_count
      t.boolean    :is_latest,  null: false, default: false
      t.text       :error_message
      t.datetime   :imported_at
      t.timestamps
    end

    add_index :ka_profitability_uploads, :fiscal_year
    add_index :ka_profitability_uploads, :status
    add_index :ka_profitability_uploads, :created_at
    add_index :ka_profitability_uploads, :is_latest

    create_table :ka_profitability_records do |t|
      t.references :ka_profitability_upload, null: false, foreign_key: true
      t.string  :outlet_group, null: false
      t.string  :level
      t.string  :description,  null: false
      t.string  :period_type,  null: false   # "MTD" or "YTD"
      t.string  :period_month, null: false   # "APR", "MAY", ...
      t.string  :fiscal_year,  null: false   # denormalised
      t.decimal :value, precision: 20, scale: 4
    end

    add_index :ka_profitability_records,
              %i[ka_profitability_upload_id outlet_group period_type period_month],
              name: "index_ka_prof_records_on_upload_outlet_period"
    add_index :ka_profitability_records,
              %i[fiscal_year outlet_group],
              name: "index_ka_prof_records_on_fiscal_year_outlet"
  end
end
