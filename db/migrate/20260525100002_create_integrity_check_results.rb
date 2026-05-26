# frozen_string_literal: true

class CreateIntegrityCheckResults < ActiveRecord::Migration[8.0]
  def change
    create_table :integrity_check_results do |t|
      t.references :integrity_check, null: false, foreign_key: true
      t.string  :region,         null: false
      t.integer :period_year,    null: false
      t.integer :period_month,   null: false
      t.decimal :sot_netto_wise, precision: 20, scale: 4
      t.decimal :db_netto_wise,  precision: 20, scale: 4
      t.decimal :delta,          precision: 20, scale: 4
      t.string  :outcome,        null: false
      t.datetime :resolved_at
      t.timestamps
    end

    add_index :integrity_check_results,
              %i[integrity_check_id region period_year period_month],
              unique: true,
              name: "idx_integrity_results_on_check_region_period"
    add_index :integrity_check_results, :outcome
  end
end
