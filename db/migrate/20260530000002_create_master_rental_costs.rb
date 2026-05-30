# frozen_string_literal: true

class CreateMasterRentalCosts < ActiveRecord::Migration[8.0]
  def change
    create_table :master_rental_costs do |t|
      t.references :master_rental_upload, null: false, foreign_key: true,
                   index: { name: "index_mrc_on_upload_id" }

      t.integer :period_year,  null: false
      t.integer :period_month, null: false

      # --- Data columns (RENTAL sheet, cols B–I; col A "NO" is not stored) ---
      t.string :region       # B  REGION (RegCen / RegTim / RegBar)
      t.string :area         # C  AREA
      t.string :dist_parent  # D  DIST PARENT
      t.string :dist_child   # E  DIST CHILD
      t.string :outlet_code  # F  OUTLET CODE (not unique within a file)
      t.string :outlet_name  # G  OUTLET NAME
      t.string :rental       # H  RENTAL (fixture type)
      t.bigint :cost         # I  COST (monthly rental fee in IDR — integer)
    end

    add_index :master_rental_costs,
              %i[period_year period_month],
              name: "index_mrc_on_period"
  end
end
