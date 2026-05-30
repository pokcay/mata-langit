# frozen_string_literal: true

class CreateTransSlFactoryTransactions < ActiveRecord::Migration[8.0]
  def change
    create_table :trans_sl_factory_transactions do |t|
      t.references :trans_sl_factory_upload, null: false, foreign_key: true,
                   index: { name: "index_tslft_on_upload_id" }

      t.integer :period_year,  null: false
      t.integer :period_month, null: false

      # --- Line-level detail columns (Detail SL sheet, cols B–AA) ---
      t.string :shipping_point        # B  Shipping (SLT / JKT2 / Other)
      t.string :sold_to_party         # C  Sold-to Party (SAP code)
      t.string :area                  # D  Area
      t.string :f_and_r_type          # E  F & R (Faktur / Return / Balsum)
      t.string :customer_name         # F  Customer Name
      t.date   :date_so               # G  DATE SO (DD.MM.YYYY)
      t.string :no_so                 # H  NO SO
      t.string :no_dn                 # I  NO DN
      t.date   :date_invoice          # J  DATE Invoice (DD.MM.YYYY)
      t.string :no_invoice            # K  NO Invoice
      t.string :code_material         # L  CODE MATERIAL
      t.string :brand                 # M  BRAND
      t.string :description_material  # N  DESCRIPTION MATERIAL

      t.decimal :qty_so,               precision: 20, scale: 4   # O
      t.decimal :value_so,             precision: 20, scale: 4   # P
      t.decimal :qty_delivery_order,   precision: 20, scale: 4   # Q
      t.decimal :value_delivery_order, precision: 20, scale: 4   # R
      t.decimal :qty_return,           precision: 20, scale: 4   # S
      t.decimal :value_return,         precision: 20, scale: 4   # T
      t.decimal :qty_net,              precision: 20, scale: 4   # U
      t.decimal :value_net,            precision: 20, scale: 4   # V
      t.decimal :pct_qty,              precision: 20, scale: 4   # W (% QTY, 100-scale)
      t.decimal :pct_value,            precision: 20, scale: 4   # Y (% Value, 100-scale)

      t.text :reason_for_rejection    # AA Reason For Rejection
    end

    add_index :trans_sl_factory_transactions,
              %i[period_year period_month],
              name: "index_tslft_on_period"
  end
end
