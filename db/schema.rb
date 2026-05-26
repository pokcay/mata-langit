# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_05_26_600001) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.bigint "record_id", null: false
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "email_templates", force: :cascade do |t|
    t.string "key", null: false
    t.string "name", null: false
    t.text "description"
    t.string "subject", default: "", null: false
    t.text "body_html"
    t.text "body_text"
    t.boolean "customized", default: false, null: false
    t.bigint "updated_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_email_templates_on_key", unique: true
    t.index ["updated_by_id"], name: "index_email_templates_on_updated_by_id"
  end

  create_table "good_job_batches", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "description"
    t.jsonb "serialized_properties"
    t.text "on_finish"
    t.text "on_success"
    t.text "on_discard"
    t.text "callback_queue_name"
    t.integer "callback_priority"
    t.datetime "enqueued_at"
    t.datetime "discarded_at"
    t.datetime "finished_at"
    t.datetime "jobs_finished_at"
  end

  create_table "good_job_executions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "active_job_id", null: false
    t.text "job_class"
    t.text "queue_name"
    t.jsonb "serialized_params"
    t.datetime "scheduled_at"
    t.datetime "finished_at"
    t.text "error"
    t.integer "error_event", limit: 2
    t.text "error_backtrace", array: true
    t.uuid "process_id"
    t.interval "duration"
    t.index ["active_job_id", "created_at"], name: "index_good_job_executions_on_active_job_id_and_created_at"
    t.index ["process_id", "created_at"], name: "index_good_job_executions_on_process_id_and_created_at"
  end

  create_table "good_job_processes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "state"
    t.integer "lock_type", limit: 2
  end

  create_table "good_job_settings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "key"
    t.jsonb "value"
    t.index ["key"], name: "index_good_job_settings_on_key", unique: true
  end

  create_table "good_jobs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "queue_name"
    t.integer "priority"
    t.jsonb "serialized_params"
    t.datetime "scheduled_at"
    t.datetime "performed_at"
    t.datetime "finished_at"
    t.text "error"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "active_job_id"
    t.text "concurrency_key"
    t.text "cron_key"
    t.uuid "retried_good_job_id"
    t.datetime "cron_at"
    t.uuid "batch_id"
    t.uuid "batch_callback_id"
    t.boolean "is_discrete"
    t.integer "executions_count"
    t.text "job_class"
    t.integer "error_event", limit: 2
    t.text "labels", array: true
    t.uuid "locked_by_id"
    t.datetime "locked_at"
    t.integer "lock_type", limit: 2
    t.index ["active_job_id", "created_at"], name: "index_good_jobs_on_active_job_id_and_created_at"
    t.index ["batch_callback_id"], name: "index_good_jobs_on_batch_callback_id", where: "(batch_callback_id IS NOT NULL)"
    t.index ["batch_id"], name: "index_good_jobs_on_batch_id", where: "(batch_id IS NOT NULL)"
    t.index ["concurrency_key", "created_at"], name: "index_good_jobs_on_concurrency_key_and_created_at"
    t.index ["concurrency_key"], name: "index_good_jobs_on_concurrency_key_when_unfinished", where: "(finished_at IS NULL)"
    t.index ["created_at"], name: "index_good_jobs_on_created_at"
    t.index ["cron_key", "created_at"], name: "index_good_jobs_on_cron_key_and_created_at_cond", where: "(cron_key IS NOT NULL)"
    t.index ["cron_key", "cron_at"], name: "index_good_jobs_on_cron_key_and_cron_at_cond", unique: true, where: "(cron_key IS NOT NULL)"
    t.index ["finished_at"], name: "index_good_jobs_jobs_on_finished_at_only", where: "(finished_at IS NOT NULL)"
    t.index ["finished_at"], name: "index_good_jobs_on_discarded", order: :desc, where: "((finished_at IS NOT NULL) AND (error IS NOT NULL))"
    t.index ["id"], name: "index_good_jobs_on_unfinished_or_errored", where: "((finished_at IS NULL) OR (error IS NOT NULL))"
    t.index ["job_class"], name: "index_good_jobs_on_job_class"
    t.index ["labels"], name: "index_good_jobs_on_labels", where: "(labels IS NOT NULL)", using: :gin
    t.index ["locked_by_id"], name: "index_good_jobs_on_locked_by_id", where: "(locked_by_id IS NOT NULL)"
    t.index ["priority", "created_at"], name: "index_good_job_jobs_for_candidate_lookup", where: "(finished_at IS NULL)"
    t.index ["priority", "created_at"], name: "index_good_jobs_jobs_on_priority_created_at_when_unfinished", order: { priority: "DESC NULLS LAST" }, where: "(finished_at IS NULL)"
    t.index ["priority", "scheduled_at", "id"], name: "index_good_jobs_for_candidate_dequeue_unlocked", where: "((finished_at IS NULL) AND (locked_by_id IS NULL))"
    t.index ["priority", "scheduled_at", "id"], name: "index_good_jobs_on_priority_scheduled_at_unfinished", where: "(finished_at IS NULL)"
    t.index ["priority", "scheduled_at"], name: "index_good_jobs_on_priority_scheduled_at_unfinished_unlocked", where: "((finished_at IS NULL) AND (locked_by_id IS NULL))"
    t.index ["queue_name", "scheduled_at", "id"], name: "index_good_jobs_on_queue_name_priority_scheduled_at_unfinished", where: "(finished_at IS NULL)"
    t.index ["queue_name", "scheduled_at"], name: "index_good_jobs_on_queue_name_and_scheduled_at", where: "(finished_at IS NULL)"
    t.index ["queue_name"], name: "index_good_jobs_on_queue_name"
    t.index ["scheduled_at", "queue_name"], name: "index_good_jobs_on_scheduled_at_and_queue_name"
    t.index ["scheduled_at"], name: "index_good_jobs_on_scheduled_at", where: "(finished_at IS NULL)"
  end

  create_table "inbound_emails", force: :cascade do |t|
    t.string "from", null: false
    t.string "to", null: false
    t.string "reply_to"
    t.string "subject"
    t.text "body_html"
    t.text "body_text"
    t.datetime "received_at", null: false
    t.boolean "read", default: false, null: false
    t.boolean "archived", default: false, null: false
    t.text "raw_payload"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["archived", "read", "received_at"], name: "index_inbound_emails_on_archived_and_read_and_received_at"
    t.index ["to", "archived"], name: "index_inbound_emails_on_to_and_archived"
  end

  create_table "integrity_check_results", force: :cascade do |t|
    t.bigint "integrity_check_id", null: false
    t.string "region", null: false
    t.integer "period_year", null: false
    t.integer "period_month", null: false
    t.decimal "sot_netto_wise", precision: 20, scale: 4
    t.decimal "db_netto_wise", precision: 20, scale: 4
    t.decimal "delta", precision: 20, scale: 4
    t.string "outcome", null: false
    t.datetime "resolved_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["integrity_check_id", "region", "period_year", "period_month"], name: "idx_integrity_results_on_check_region_period", unique: true
    t.index ["integrity_check_id"], name: "index_integrity_check_results_on_integrity_check_id"
    t.index ["outcome"], name: "index_integrity_check_results_on_outcome"
  end

  create_table "integrity_checks", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "filename", null: false
    t.string "status", default: "pending", null: false
    t.integer "period_min_year"
    t.integer "period_min_month"
    t.integer "period_max_year"
    t.integer "period_max_month"
    t.integer "total_rows_in_sot", default: 0, null: false
    t.integer "matched_count", default: 0, null: false
    t.integer "mismatched_count", default: 0, null: false
    t.integer "missing_in_db_count", default: 0, null: false
    t.integer "extra_in_db_count", default: 0, null: false
    t.text "error_message"
    t.datetime "checked_at"
    t.datetime "last_rerun_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "include_program", default: false, null: false
    t.index ["user_id"], name: "index_integrity_checks_on_user_id"
  end

  create_table "ka_profitability_records", force: :cascade do |t|
    t.bigint "ka_profitability_upload_id", null: false
    t.string "outlet_group", null: false
    t.string "level"
    t.string "description", null: false
    t.string "period_type", null: false
    t.string "period_month", null: false
    t.string "fiscal_year", null: false
    t.decimal "value", precision: 20, scale: 4
    t.index ["fiscal_year", "outlet_group"], name: "index_ka_prof_records_on_fiscal_year_outlet"
    t.index ["ka_profitability_upload_id", "outlet_group", "period_type", "period_month"], name: "index_ka_prof_records_on_upload_outlet_period"
    t.index ["ka_profitability_upload_id"], name: "index_ka_profitability_records_on_ka_profitability_upload_id"
  end

  create_table "ka_profitability_uploads", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "filename", null: false
    t.string "fiscal_year", null: false
    t.string "status", default: "pending", null: false
    t.integer "outlet_count"
    t.integer "record_count"
    t.boolean "is_latest", default: false, null: false
    t.text "error_message"
    t.datetime "imported_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_ka_profitability_uploads_on_created_at"
    t.index ["fiscal_year"], name: "index_ka_profitability_uploads_on_fiscal_year"
    t.index ["is_latest"], name: "index_ka_profitability_uploads_on_is_latest"
    t.index ["status"], name: "index_ka_profitability_uploads_on_status"
    t.index ["user_id"], name: "index_ka_profitability_uploads_on_user_id"
  end

  create_table "market_share_b2b_records", force: :cascade do |t|
    t.bigint "market_share_b2b_upload_id", null: false
    t.string "account_code", null: false
    t.string "account_name", null: false
    t.integer "period_year", null: false
    t.integer "period_month", null: false
    t.string "report_type", null: false
    t.string "category"
    t.string "brand"
    t.string "product_name"
    t.string "dc_name"
    t.decimal "market_share_pct", precision: 10, scale: 4
    t.decimal "market_share_ly_pct", precision: 10, scale: 4
    t.integer "ranking"
    t.integer "total_plu"
    t.decimal "growth_pct", precision: 10, scale: 4
    t.index ["account_code", "report_type", "period_year", "period_month"], name: "index_ms_b2b_records_on_account_period"
    t.index ["market_share_b2b_upload_id"], name: "index_market_share_b2b_records_on_market_share_b2b_upload_id"
  end

  create_table "market_share_b2b_uploads", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "filename", null: false
    t.string "account_code", null: false
    t.string "account_name", null: false
    t.string "report_type", null: false
    t.string "template_version", null: false
    t.integer "period_year_from", null: false
    t.integer "period_month_from", null: false
    t.integer "period_year_to", null: false
    t.integer "period_month_to", null: false
    t.string "status", default: "pending", null: false
    t.integer "row_count"
    t.integer "replaced_row_count"
    t.text "error_message"
    t.datetime "imported_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_code"], name: "index_market_share_b2b_uploads_on_account_code"
    t.index ["created_at"], name: "index_market_share_b2b_uploads_on_created_at"
    t.index ["status"], name: "index_market_share_b2b_uploads_on_status"
    t.index ["user_id"], name: "index_market_share_b2b_uploads_on_user_id"
  end

  create_table "master_outlet_dist_records", force: :cascade do |t|
    t.bigint "master_outlet_dist_upload_id", null: false
    t.string "region_name"
    t.string "area_name"
    t.string "dist_sap_code"
    t.string "dist_parent_name"
    t.bigint "dist_id"
    t.string "dist_child_name"
    t.string "outlet_dist_code"
    t.string "outlet_national_code"
    t.string "outlet_dist_name"
    t.string "outlet_dist_address"
    t.string "outlet_dist_status"
    t.index ["dist_sap_code"], name: "index_master_outlet_dist_records_on_dist_sap_code"
    t.index ["master_outlet_dist_upload_id"], name: "idx_on_master_outlet_dist_upload_id_0948f2fcf0"
    t.index ["master_outlet_dist_upload_id"], name: "index_mod_records_on_upload_id"
  end

  create_table "master_outlet_dist_uploads", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "filename", null: false
    t.string "dist_sap_code", null: false
    t.string "dist_name", null: false
    t.string "status", default: "pending", null: false
    t.integer "row_count", default: 0, null: false
    t.integer "replaced_row_count", default: 0, null: false
    t.text "error_message"
    t.datetime "imported_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["dist_sap_code"], name: "index_master_outlet_dist_uploads_on_dist_sap_code"
    t.index ["status"], name: "index_master_outlet_dist_uploads_on_status"
    t.index ["user_id"], name: "index_master_outlet_dist_uploads_on_user_id"
  end

  create_table "master_product_dist_rows", force: :cascade do |t|
    t.bigint "master_product_dist_upload_id", null: false
    t.string "region_name"
    t.string "area_name"
    t.string "distributor_sap_code"
    t.string "distributor_parent_name"
    t.bigint "distributor_id"
    t.string "distributor_child_name"
    t.string "product_distributor_code"
    t.string "product_distributor_name"
    t.string "product_distributor_status"
    t.string "product_code"
    t.string "product_sap_code"
    t.string "barcode_product"
    t.string "barcode_inner_box"
    t.string "barcode_carton"
    t.string "product_name"
    t.string "brand_name"
    t.string "category_ceo_name"
    t.string "category_marketing_name"
    t.string "range_name"
    t.string "range_variant_name"
    t.string "range_marketing_name"
    t.string "category_name"
    t.string "category_sub_name"
    t.string "variant_name"
    t.string "size"
    t.float "content_carton_pcs"
    t.string "dimension_product"
    t.string "dimension_inner_box"
    t.string "dimension_carton"
    t.float "weight_product"
    t.float "weight_inner_box"
    t.float "weight_carton"
    t.string "status"
    t.string "opsc_status"
    t.string "to_status"
    t.date "price_start_date"
    t.float "price_rbp"
    t.float "price_cbp"
    t.float "price_gt"
    t.float "price_mt"
    t.float "price_mbs"
    t.float "price_5_5_pct"
    t.float "price_gt_11_pct"
    t.float "price_skincare"
    t.float "price_koperasi"
    t.float "price_lazada"
    t.float "price_farmaku"
    t.float "price_shopee"
    t.float "price_sirclo"
    t.float "price_sociolla"
    t.string "product_image_1"
    t.string "product_image_2"
    t.string "product_image_3"
    t.string "product_image_4"
    t.index ["distributor_sap_code"], name: "index_master_product_dist_rows_on_distributor_sap_code"
    t.index ["master_product_dist_upload_id"], name: "idx_on_master_product_dist_upload_id_d758766ed3"
    t.index ["master_product_dist_upload_id"], name: "index_mpd_rows_on_upload_id"
  end

  create_table "master_product_dist_uploads", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "filename", null: false
    t.string "distributor_sap_code", null: false
    t.string "distributor_name", null: false
    t.string "distributor_parent_name"
    t.string "region"
    t.string "status", default: "pending", null: false
    t.integer "row_count", default: 0, null: false
    t.integer "replaced_row_count", default: 0, null: false
    t.text "error_message"
    t.datetime "imported_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["distributor_sap_code"], name: "index_master_product_dist_uploads_on_distributor_sap_code"
    t.index ["status"], name: "index_master_product_dist_uploads_on_status"
    t.index ["user_id"], name: "index_master_product_dist_uploads_on_user_id"
  end

  create_table "sessions", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "ip_address"
    t.string "user_agent"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "solid_cable_messages", force: :cascade do |t|
    t.binary "channel", null: false
    t.binary "payload", null: false
    t.datetime "created_at", null: false
    t.bigint "channel_hash", null: false
    t.index ["channel"], name: "index_solid_cable_messages_on_channel"
    t.index ["channel_hash"], name: "index_solid_cable_messages_on_channel_hash"
    t.index ["created_at"], name: "index_solid_cable_messages_on_created_at"
  end

  create_table "solid_cache_entries", force: :cascade do |t|
    t.binary "key", null: false
    t.binary "value", null: false
    t.datetime "created_at", null: false
    t.bigint "key_hash", null: false
    t.integer "byte_size", null: false
    t.index ["byte_size"], name: "index_solid_cache_entries_on_byte_size"
    t.index ["key_hash", "byte_size"], name: "index_solid_cache_entries_on_key_hash_and_byte_size"
    t.index ["key_hash"], name: "index_solid_cache_entries_on_key_hash", unique: true
  end

  create_table "solid_queue_blocked_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.string "concurrency_key", null: false
    t.datetime "expires_at", null: false
    t.datetime "created_at", null: false
    t.index ["concurrency_key", "priority", "job_id"], name: "index_solid_queue_blocked_executions_for_release"
    t.index ["expires_at", "concurrency_key"], name: "index_solid_queue_blocked_executions_for_maintenance"
    t.index ["job_id"], name: "index_solid_queue_blocked_executions_on_job_id", unique: true
  end

  create_table "solid_queue_claimed_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.bigint "process_id"
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_claimed_executions_on_job_id", unique: true
    t.index ["process_id", "job_id"], name: "index_solid_queue_claimed_executions_on_process_id_and_job_id"
  end

  create_table "solid_queue_failed_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.text "error"
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_failed_executions_on_job_id", unique: true
  end

  create_table "solid_queue_jobs", force: :cascade do |t|
    t.string "queue_name", null: false
    t.string "class_name", null: false
    t.text "arguments"
    t.integer "priority", default: 0, null: false
    t.string "active_job_id"
    t.datetime "scheduled_at"
    t.datetime "finished_at"
    t.string "concurrency_key"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["active_job_id"], name: "index_solid_queue_jobs_on_active_job_id"
    t.index ["class_name"], name: "index_solid_queue_jobs_on_class_name"
    t.index ["finished_at"], name: "index_solid_queue_jobs_on_finished_at"
    t.index ["queue_name", "finished_at"], name: "index_solid_queue_jobs_for_filtering"
    t.index ["scheduled_at", "finished_at"], name: "index_solid_queue_jobs_for_alerting"
  end

  create_table "solid_queue_pauses", force: :cascade do |t|
    t.string "queue_name", null: false
    t.datetime "created_at", null: false
    t.index ["queue_name"], name: "index_solid_queue_pauses_on_queue_name", unique: true
  end

  create_table "solid_queue_processes", force: :cascade do |t|
    t.string "kind", null: false
    t.datetime "last_heartbeat_at", null: false
    t.bigint "supervisor_id"
    t.integer "pid", null: false
    t.string "hostname"
    t.text "metadata"
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.index ["last_heartbeat_at"], name: "index_solid_queue_processes_on_last_heartbeat_at"
    t.index ["name", "supervisor_id"], name: "index_solid_queue_processes_on_name_and_supervisor_id", unique: true
    t.index ["supervisor_id"], name: "index_solid_queue_processes_on_supervisor_id"
  end

  create_table "solid_queue_ready_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_ready_executions_on_job_id", unique: true
    t.index ["priority", "job_id"], name: "index_solid_queue_poll_all"
    t.index ["queue_name", "priority", "job_id"], name: "index_solid_queue_poll_by_queue"
  end

  create_table "solid_queue_recurring_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "task_key", null: false
    t.datetime "run_at", null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_recurring_executions_on_job_id", unique: true
    t.index ["task_key", "run_at"], name: "index_solid_queue_recurring_executions_on_task_key_and_run_at", unique: true
  end

  create_table "solid_queue_recurring_tasks", force: :cascade do |t|
    t.string "key", null: false
    t.string "schedule", null: false
    t.string "command", limit: 2048
    t.string "class_name"
    t.text "arguments"
    t.string "queue_name"
    t.integer "priority", default: 0
    t.boolean "static", default: true, null: false
    t.text "description"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_solid_queue_recurring_tasks_on_key", unique: true
    t.index ["static"], name: "index_solid_queue_recurring_tasks_on_static"
  end

  create_table "solid_queue_scheduled_executions", force: :cascade do |t|
    t.bigint "job_id", null: false
    t.string "queue_name", null: false
    t.integer "priority", default: 0, null: false
    t.datetime "scheduled_at", null: false
    t.datetime "created_at", null: false
    t.index ["job_id"], name: "index_solid_queue_scheduled_executions_on_job_id", unique: true
    t.index ["scheduled_at", "priority", "job_id"], name: "index_solid_queue_dispatch_all"
  end

  create_table "solid_queue_semaphores", force: :cascade do |t|
    t.string "key", null: false
    t.integer "value", default: 1, null: false
    t.datetime "expires_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expires_at"], name: "index_solid_queue_semaphores_on_expires_at"
    t.index ["key", "value"], name: "index_solid_queue_semaphores_on_key_and_value"
    t.index ["key"], name: "index_solid_queue_semaphores_on_key", unique: true
  end

  create_table "timeseries_transactions", force: :cascade do |t|
    t.bigint "timeseries_upload_id", null: false
    t.string "region", null: false
    t.integer "period_year", null: false
    t.integer "period_month", null: false
    t.string "region_name"
    t.string "area_name"
    t.string "area_sub_name"
    t.string "dist_parent_name"
    t.string "dist_sap_code"
    t.string "dist_child_name"
    t.string "type_transaction"
    t.date "date_transaction"
    t.string "invoice_no"
    t.string "outlet_dist_code"
    t.string "outlet_dist_name"
    t.string "product_dist_code"
    t.string "product_dist_name"
    t.decimal "qty_carton", precision: 20, scale: 4
    t.decimal "qty_pieces", precision: 20, scale: 4
    t.decimal "qty_total_pcs", precision: 20, scale: 4
    t.decimal "brutto_dist", precision: 20, scale: 4
    t.decimal "disc_pct_1", precision: 20, scale: 4
    t.decimal "disc_pct_2", precision: 20, scale: 4
    t.decimal "disc_pct_3", precision: 20, scale: 4
    t.decimal "disc_pct_4", precision: 20, scale: 4
    t.decimal "disc_pct_5", precision: 20, scale: 4
    t.decimal "disc_pct_6", precision: 20, scale: 4
    t.decimal "disc_pct_7", precision: 20, scale: 4
    t.decimal "disc_pct_8", precision: 20, scale: 4
    t.decimal "disc_pct_9", precision: 20, scale: 4
    t.decimal "disc_pct_10", precision: 20, scale: 4
    t.decimal "disc_value_1", precision: 20, scale: 4
    t.decimal "disc_value_2", precision: 20, scale: 4
    t.decimal "disc_value_3", precision: 20, scale: 4
    t.decimal "disc_value_4", precision: 20, scale: 4
    t.decimal "disc_value_5", precision: 20, scale: 4
    t.decimal "disc_value_6", precision: 20, scale: 4
    t.decimal "disc_value_7", precision: 20, scale: 4
    t.decimal "disc_value_8", precision: 20, scale: 4
    t.decimal "disc_value_9", precision: 20, scale: 4
    t.decimal "disc_value_10", precision: 20, scale: 4
    t.decimal "disc_value_total", precision: 20, scale: 4
    t.decimal "netto_dist", precision: 20, scale: 4
    t.decimal "netto_wise", precision: 20, scale: 4
    t.string "outlet_national_group"
    t.string "outlet_national_code"
    t.string "outlet_national_name"
    t.string "outlet_national_address"
    t.string "channel_code"
    t.string "channel_sub_code"
    t.string "spv_salesman_name"
    t.string "salesman_name"
    t.decimal "salesman_day", precision: 20, scale: 4
    t.decimal "salesman_frequency", precision: 20, scale: 4
    t.decimal "salesman_week_1", precision: 20, scale: 4
    t.decimal "salesman_week_2", precision: 20, scale: 4
    t.decimal "salesman_week_3", precision: 20, scale: 4
    t.decimal "salesman_week_4", precision: 20, scale: 4
    t.string "tl_spv_name"
    t.string "tl_name"
    t.string "bp_name"
    t.string "md_name"
    t.decimal "md_day", precision: 20, scale: 4
    t.decimal "md_frequency", precision: 20, scale: 4
    t.decimal "md_week_1", precision: 20, scale: 4
    t.decimal "md_week_2", precision: 20, scale: 4
    t.decimal "md_week_3", precision: 20, scale: 4
    t.decimal "md_week_4", precision: 20, scale: 4
    t.string "brand_group_name"
    t.string "brand_name"
    t.string "category_sub_name"
    t.string "variant_name"
    t.string "range_name"
    t.string "range_variant_name"
    t.string "product_code"
    t.string "sap_parent_code"
    t.string "product_name"
    t.decimal "content_carton_pcs", precision: 20, scale: 4
    t.string "price_category"
    t.decimal "price_rbp", precision: 20, scale: 4
    t.decimal "price_gt", precision: 20, scale: 4
    t.decimal "price_mt", precision: 20, scale: 4
    t.decimal "price_mbs", precision: 20, scale: 4
    t.decimal "price_5_5_pct", precision: 20, scale: 4
    t.decimal "price_gt_11_pct", precision: 20, scale: 4
    t.decimal "price_skincare", precision: 20, scale: 4
    t.decimal "balance_summary", precision: 20, scale: 4
    t.string "flag_program"
    t.string "bp_position"
    t.string "bp_type"
    t.date "report_so_date"
    t.string "report_so_number"
    t.string "delivery_no"
    t.string "sap_customer_code"
    t.string "sap_customer_name"
    t.string "sap_customer_group"
    t.string "sap_customer_sub_group"
    t.string "sap_customer_sub_group_2"
    t.string "shipping_point"
    t.index ["date_transaction"], name: "index_timeseries_transactions_on_date_transaction"
    t.index ["region", "period_year", "period_month"], name: "idx_on_region_period_year_period_month_969d6bca67"
    t.index ["timeseries_upload_id"], name: "index_timeseries_transactions_on_timeseries_upload_id"
  end

  create_table "timeseries_uploads", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "filename", null: false
    t.string "region", null: false
    t.integer "period_year", null: false
    t.integer "period_month", null: false
    t.string "schema_version", null: false
    t.integer "row_count"
    t.decimal "netto_wise_sum", precision: 20, scale: 4
    t.integer "replaced_row_count", default: 0, null: false
    t.string "status", default: "pending", null: false
    t.text "error_message"
    t.datetime "imported_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_timeseries_uploads_on_user_id"
  end

  create_table "trans_sellout_account_transactions", force: :cascade do |t|
    t.bigint "trans_sellout_account_upload_id", null: false
    t.string "distributor_code", null: false
    t.integer "period_year", null: false
    t.integer "period_month", null: false
    t.string "region_name"
    t.string "area_name"
    t.string "area_sub_name"
    t.string "dist_parent_name"
    t.string "dist_sap_code"
    t.string "dist_child_name"
    t.string "type_transaction"
    t.date "date_transaction"
    t.string "invoice_no"
    t.string "outlet_dist_code"
    t.string "outlet_dist_name"
    t.string "product_dist_code"
    t.string "product_dist_name"
    t.decimal "qty_carton", precision: 20, scale: 4
    t.decimal "qty_pieces", precision: 20, scale: 4
    t.decimal "qty_total_pcs", precision: 20, scale: 4
    t.decimal "brutto_dist", precision: 20, scale: 4
    t.decimal "disc_pct_1", precision: 20, scale: 4
    t.decimal "disc_pct_2", precision: 20, scale: 4
    t.decimal "disc_pct_3", precision: 20, scale: 4
    t.decimal "disc_pct_4", precision: 20, scale: 4
    t.decimal "disc_pct_5", precision: 20, scale: 4
    t.decimal "disc_pct_6", precision: 20, scale: 4
    t.decimal "disc_pct_7", precision: 20, scale: 4
    t.decimal "disc_pct_8", precision: 20, scale: 4
    t.decimal "disc_pct_9", precision: 20, scale: 4
    t.decimal "disc_pct_10", precision: 20, scale: 4
    t.decimal "disc_value_1", precision: 20, scale: 4
    t.decimal "disc_value_2", precision: 20, scale: 4
    t.decimal "disc_value_3", precision: 20, scale: 4
    t.decimal "disc_value_4", precision: 20, scale: 4
    t.decimal "disc_value_5", precision: 20, scale: 4
    t.decimal "disc_value_6", precision: 20, scale: 4
    t.decimal "disc_value_7", precision: 20, scale: 4
    t.decimal "disc_value_8", precision: 20, scale: 4
    t.decimal "disc_value_9", precision: 20, scale: 4
    t.decimal "disc_value_10", precision: 20, scale: 4
    t.decimal "disc_value_total", precision: 20, scale: 4
    t.decimal "netto_dist", precision: 20, scale: 4
    t.decimal "netto_wise", precision: 20, scale: 4
    t.string "outlet_national_group"
    t.string "outlet_national_code"
    t.string "outlet_national_name"
    t.string "outlet_national_address"
    t.string "channel_code"
    t.string "channel_sub_code"
    t.string "spv_salesman_name"
    t.string "salesman_name"
    t.decimal "salesman_day", precision: 20, scale: 4
    t.decimal "salesman_frequency", precision: 20, scale: 4
    t.decimal "salesman_week_1", precision: 20, scale: 4
    t.decimal "salesman_week_2", precision: 20, scale: 4
    t.decimal "salesman_week_3", precision: 20, scale: 4
    t.decimal "salesman_week_4", precision: 20, scale: 4
    t.string "tl_spv_name"
    t.string "tl_name"
    t.string "bp_name"
    t.string "md_name"
    t.decimal "md_day", precision: 20, scale: 4
    t.decimal "md_frequency", precision: 20, scale: 4
    t.decimal "md_week_1", precision: 20, scale: 4
    t.decimal "md_week_2", precision: 20, scale: 4
    t.decimal "md_week_3", precision: 20, scale: 4
    t.decimal "md_week_4", precision: 20, scale: 4
    t.string "brand_group_name"
    t.string "brand_name"
    t.string "category_sub_name"
    t.string "variant_name"
    t.string "range_name"
    t.string "range_variant_name"
    t.string "product_code"
    t.string "sap_parent_code"
    t.string "product_name"
    t.decimal "content_carton_pcs", precision: 20, scale: 4
    t.string "price_category"
    t.decimal "price_rbp", precision: 20, scale: 4
    t.decimal "price_gt", precision: 20, scale: 4
    t.decimal "price_mt", precision: 20, scale: 4
    t.decimal "price_mbs", precision: 20, scale: 4
    t.decimal "price_5_5_pct", precision: 20, scale: 4
    t.decimal "price_gt_11_pct", precision: 20, scale: 4
    t.decimal "price_skincare", precision: 20, scale: 4
    t.decimal "balance_summary", precision: 20, scale: 4
    t.string "flag_program"
    t.string "bp_position"
    t.string "bp_type"
    t.index ["date_transaction"], name: "index_trans_sellout_account_transactions_on_date_transaction"
    t.index ["distributor_code", "period_year", "period_month"], name: "index_tsat_on_dist_and_period"
    t.index ["trans_sellout_account_upload_id"], name: "index_tsat_on_upload_id"
  end

  create_table "trans_sellout_account_uploads", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "filename", null: false
    t.string "distributor_code", null: false
    t.string "distributor_name", null: false
    t.integer "period_year", null: false
    t.integer "period_month", null: false
    t.string "status", default: "pending", null: false
    t.integer "row_count", default: 0, null: false
    t.decimal "netto_wise_sum", precision: 20, scale: 4
    t.integer "replaced_row_count", default: 0, null: false
    t.text "error_message"
    t.datetime "imported_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["distributor_code", "period_year", "period_month"], name: "index_tsau_on_dist_and_period"
    t.index ["distributor_code"], name: "index_trans_sellout_account_uploads_on_distributor_code"
    t.index ["status"], name: "index_trans_sellout_account_uploads_on_status"
    t.index ["user_id"], name: "index_trans_sellout_account_uploads_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "email", null: false
    t.string "password_digest", null: false
    t.string "timezone"
    t.boolean "admin", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "include_program_in_integrity_checks", default: false, null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "email_templates", "users", column: "updated_by_id"
  add_foreign_key "integrity_check_results", "integrity_checks"
  add_foreign_key "integrity_checks", "users"
  add_foreign_key "ka_profitability_records", "ka_profitability_uploads"
  add_foreign_key "ka_profitability_uploads", "users"
  add_foreign_key "market_share_b2b_records", "market_share_b2b_uploads"
  add_foreign_key "market_share_b2b_uploads", "users"
  add_foreign_key "master_outlet_dist_records", "master_outlet_dist_uploads"
  add_foreign_key "master_outlet_dist_uploads", "users"
  add_foreign_key "master_product_dist_rows", "master_product_dist_uploads"
  add_foreign_key "master_product_dist_uploads", "users"
  add_foreign_key "sessions", "users"
  add_foreign_key "solid_queue_blocked_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_claimed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_failed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_ready_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_recurring_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_scheduled_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "timeseries_transactions", "timeseries_uploads"
  add_foreign_key "timeseries_uploads", "users"
  add_foreign_key "trans_sellout_account_transactions", "trans_sellout_account_uploads"
  add_foreign_key "trans_sellout_account_uploads", "users"
end
