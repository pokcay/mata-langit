# frozen_string_literal: true

class CreateTransSlFactoryUploads < ActiveRecord::Migration[8.0]
  def change
    create_table :trans_sl_factory_uploads do |t|
      t.references :user, null: false, foreign_key: true
      t.string   :filename,           null: false
      t.integer  :period_year,        null: false
      t.integer  :period_month,       null: false
      t.string   :status,             null: false, default: "pending"
      t.integer  :row_count,          null: false, default: 0
      t.decimal  :value_net_sum,      precision: 20, scale: 4
      t.integer  :replaced_row_count, null: false, default: 0
      t.text     :error_message
      t.datetime :imported_at
      t.timestamps
    end

    add_index :trans_sl_factory_uploads, :status
    add_index :trans_sl_factory_uploads,
              %i[period_year period_month],
              name: "index_tslfu_on_period"
  end
end
