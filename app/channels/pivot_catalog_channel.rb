# frozen_string_literal: true

# Streams pivot catalog build progress to authenticated admin clients.
# Broadcasts: { type: "status_update", total:, ready:, building:, pct:, refreshed_at: }
class PivotCatalogChannel < ApplicationCable::Channel
  def subscribed
    reject unless current_user&.admin?
    stream_from "pivot_catalog"
  end
end
