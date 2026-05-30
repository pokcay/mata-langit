# frozen_string_literal: true

class CreateMasterListingCosts < ActiveRecord::Migration[8.0]
  def change
    create_table :master_listing_costs do |t|
      t.references :master_listing_upload, null: false, foreign_key: true,
                   index: { name: "index_mlc_on_upload_id" }

      t.integer :period_year,  null: false
      t.integer :period_month, null: false

      # --- Data columns (Listing Cost sheet, cols B–H; col A "NO" is not stored) ---
      t.string :region       # B  REGION (RegCen / RegTim / RegBar)
      t.string :area         # C  AREA
      t.string :dist_parent  # D  DIST PARENT
      t.string :dist_child   # E  DIST CHILD
      t.string :outlet_code  # F  OUTLET CODE (not unique within a file)
      t.string :outlet_name  # G  OUTLET NAME
      t.bigint :cost         # H  COST (monthly listing fee in IDR — integer)
    end

    add_index :master_listing_costs,
              %i[period_year period_month],
              name: "index_mlc_on_period"
  end
end
