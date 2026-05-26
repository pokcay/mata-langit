# frozen_string_literal: true

class AddProgramFilterColumns < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :include_program_in_integrity_checks, :boolean, default: false, null: false
    add_column :integrity_checks, :include_program, :boolean, default: false, null: false
  end
end
