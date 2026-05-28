# frozen_string_literal: true

# Stores a DB-backed catalog of distinct values for every pivot dimension field.
# The catalog is populated by PivotCatalogRefreshJob and is never auto-expired —
# it persists until the user explicitly triggers a refresh from the Pivot page.
class CreatePivotDimensionCaches < ActiveRecord::Migration[8.0]
  def change
    create_table :pivot_dimension_caches do |t|
      t.string   :field_name,    null: false
      t.jsonb    :values,        null: false, default: []
      # empty | building | ready | error
      t.string   :status,        null: false, default: "empty"
      t.datetime :refreshed_at
      t.text     :error_message
      t.timestamps
    end

    add_index :pivot_dimension_caches, :field_name, unique: true
  end
end
