# frozen_string_literal: true

class TimeseriesTransaction < ApplicationRecord
  belongs_to :timeseries_upload

  scope :for_period, ->(region, year, month) {
    where(region: region, period_year: year, period_month: month)
  }

  # Case-insensitive match: data uses "Program" (sentence case) in practice, but
  # we defend against future "PROGRAM" / "program" / etc by uppercasing both sides.
  # IS DISTINCT FROM keeps NULL rows (Postgres NULL semantics would otherwise drop
  # them from a plain "<>" comparison).
  scope :non_program, -> { where("UPPER(flag_program) IS DISTINCT FROM ?", "PROGRAM") }
end
