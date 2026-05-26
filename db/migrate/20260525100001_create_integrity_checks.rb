# frozen_string_literal: true

class CreateIntegrityChecks < ActiveRecord::Migration[8.0]
  def change
    create_table :integrity_checks do |t|
      t.references :user, null: false, foreign_key: true
      t.string  :filename,             null: false
      t.string  :status,               null: false, default: "pending"
      t.integer :period_min_year
      t.integer :period_min_month
      t.integer :period_max_year
      t.integer :period_max_month
      t.integer :total_rows_in_sot,    null: false, default: 0
      t.integer :matched_count,        null: false, default: 0
      t.integer :mismatched_count,     null: false, default: 0
      t.integer :missing_in_db_count,  null: false, default: 0
      t.integer :extra_in_db_count,    null: false, default: 0
      t.text    :error_message
      t.datetime :checked_at
      t.datetime :last_rerun_at
      t.timestamps
    end
  end
end
