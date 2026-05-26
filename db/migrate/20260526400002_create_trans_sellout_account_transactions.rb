# frozen_string_literal: true

class CreateTransSelloutAccountTransactions < ActiveRecord::Migration[8.0]
  def change
    create_table :trans_sellout_account_transactions do |t|
      t.references :trans_sellout_account_upload, null: false, foreign_key: true,
                   index: { name: "index_tsat_on_upload_id" }

      t.string  :distributor_code, null: false
      t.integer :period_year,      null: false
      t.integer :period_month,     null: false

      # --- CORE_MAP columns (84) ---
      t.string  :region_name
      t.string  :area_name
      t.string  :area_sub_name
      t.string  :dist_parent_name
      t.string  :dist_sap_code
      t.string  :dist_child_name
      t.string  :type_transaction
      t.date    :date_transaction
      t.string  :invoice_no
      t.string  :outlet_dist_code
      t.string  :outlet_dist_name
      t.string  :product_dist_code
      t.string  :product_dist_name
      t.decimal :qty_carton,         precision: 20, scale: 4
      t.decimal :qty_pieces,         precision: 20, scale: 4
      t.decimal :qty_total_pcs,      precision: 20, scale: 4
      t.decimal :brutto_dist,        precision: 20, scale: 4
      t.decimal :disc_pct_1,         precision: 20, scale: 4
      t.decimal :disc_pct_2,         precision: 20, scale: 4
      t.decimal :disc_pct_3,         precision: 20, scale: 4
      t.decimal :disc_pct_4,         precision: 20, scale: 4
      t.decimal :disc_pct_5,         precision: 20, scale: 4
      t.decimal :disc_pct_6,         precision: 20, scale: 4
      t.decimal :disc_pct_7,         precision: 20, scale: 4
      t.decimal :disc_pct_8,         precision: 20, scale: 4
      t.decimal :disc_pct_9,         precision: 20, scale: 4
      t.decimal :disc_pct_10,        precision: 20, scale: 4
      t.decimal :disc_value_1,       precision: 20, scale: 4
      t.decimal :disc_value_2,       precision: 20, scale: 4
      t.decimal :disc_value_3,       precision: 20, scale: 4
      t.decimal :disc_value_4,       precision: 20, scale: 4
      t.decimal :disc_value_5,       precision: 20, scale: 4
      t.decimal :disc_value_6,       precision: 20, scale: 4
      t.decimal :disc_value_7,       precision: 20, scale: 4
      t.decimal :disc_value_8,       precision: 20, scale: 4
      t.decimal :disc_value_9,       precision: 20, scale: 4
      t.decimal :disc_value_10,      precision: 20, scale: 4
      t.decimal :disc_value_total,   precision: 20, scale: 4
      t.decimal :netto_dist,         precision: 20, scale: 4
      t.decimal :netto_wise,         precision: 20, scale: 4
      t.string  :outlet_national_group
      t.string  :outlet_national_code
      t.string  :outlet_national_name
      t.string  :outlet_national_address
      t.string  :channel_code
      t.string  :channel_sub_code
      t.string  :spv_salesman_name
      t.string  :salesman_name
      t.decimal :salesman_day,       precision: 20, scale: 4
      t.decimal :salesman_frequency, precision: 20, scale: 4
      t.decimal :salesman_week_1,    precision: 20, scale: 4
      t.decimal :salesman_week_2,    precision: 20, scale: 4
      t.decimal :salesman_week_3,    precision: 20, scale: 4
      t.decimal :salesman_week_4,    precision: 20, scale: 4
      t.string  :tl_spv_name
      t.string  :tl_name
      t.string  :bp_name
      t.string  :md_name
      t.decimal :md_day,             precision: 20, scale: 4
      t.decimal :md_frequency,       precision: 20, scale: 4
      t.decimal :md_week_1,          precision: 20, scale: 4
      t.decimal :md_week_2,          precision: 20, scale: 4
      t.decimal :md_week_3,          precision: 20, scale: 4
      t.decimal :md_week_4,          precision: 20, scale: 4
      t.string  :brand_group_name
      t.string  :brand_name
      t.string  :category_sub_name
      t.string  :variant_name
      t.string  :range_name
      t.string  :range_variant_name
      t.string  :product_code
      t.string  :sap_parent_code
      t.string  :product_name
      t.decimal :content_carton_pcs, precision: 20, scale: 4
      t.string  :price_category
      t.decimal :price_rbp,          precision: 20, scale: 4
      t.decimal :price_gt,           precision: 20, scale: 4
      t.decimal :price_mt,           precision: 20, scale: 4
      t.decimal :price_mbs,          precision: 20, scale: 4
      t.decimal :price_5_5_pct,      precision: 20, scale: 4
      t.decimal :price_gt_11_pct,    precision: 20, scale: 4
      t.decimal :price_skincare,     precision: 20, scale: 4
      t.decimal :balance_summary,    precision: 20, scale: 4
      t.string  :flag_program

      # --- NEW_2025_MAP columns (2) ---
      t.string  :bp_position
      t.string  :bp_type
    end

    add_index :trans_sellout_account_transactions,
              %i[distributor_code period_year period_month],
              name: "index_tsat_on_dist_and_period"
    add_index :trans_sellout_account_transactions, :date_transaction
  end
end
