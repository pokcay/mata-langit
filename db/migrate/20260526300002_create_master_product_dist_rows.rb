# frozen_string_literal: true

class CreateMasterProductDistRows < ActiveRecord::Migration[8.0]
  def change
    create_table :master_product_dist_rows do |t|
      t.references :master_product_dist_upload, null: false, foreign_key: true

      # Info Distributor
      t.string :region_name
      t.string :area_name
      t.string :distributor_sap_code
      t.string :distributor_parent_name
      t.bigint :distributor_id
      t.string :distributor_child_name

      # Kode Produk Distributor
      t.string :product_distributor_code
      t.string :product_distributor_name
      t.string :product_distributor_status

      # Identitas Produk
      t.string :product_code
      t.string :product_sap_code
      t.string :barcode_product
      t.string :barcode_inner_box
      t.string :barcode_carton
      t.string :product_name
      t.string :brand_name

      # Klasifikasi
      t.string :category_ceo_name
      t.string :category_marketing_name
      t.string :range_name
      t.string :range_variant_name
      t.string :range_marketing_name
      t.string :category_name
      t.string :category_sub_name
      t.string :variant_name

      # Packaging & Dimensi
      t.string :size
      t.float  :content_carton_pcs
      t.string :dimension_product
      t.string :dimension_inner_box
      t.string :dimension_carton
      t.float  :weight_product
      t.float  :weight_inner_box
      t.float  :weight_carton

      # Status Flags
      t.string :status
      t.string :opsc_status
      t.string :to_status

      # Harga
      t.date  :price_start_date
      t.float :price_rbp
      t.float :price_cbp
      t.float :price_gt
      t.float :price_mt
      t.float :price_mbs
      t.float :price_5_5_pct
      t.float :price_gt_11_pct
      t.float :price_skincare
      t.float :price_koperasi
      t.float :price_lazada
      t.float :price_farmaku
      t.float :price_shopee
      t.float :price_sirclo
      t.float :price_sociolla

      # Gambar Produk
      t.string :product_image_1
      t.string :product_image_2
      t.string :product_image_3
      t.string :product_image_4
    end

    add_index :master_product_dist_rows, :distributor_sap_code
    add_index :master_product_dist_rows, :master_product_dist_upload_id,
              name: "index_mpd_rows_on_upload_id"
  end
end
