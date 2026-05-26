# Mata Langit — Master Product Dist

## What we're building

We are building a **Master Product Dist** upload feature — an admin interface to manage master data produk per-distributor. Admin dapat mengupload satu atau beberapa file Excel (format `PRODUCT_DIST_{nama_distributor}.xlsx`, sheet: **PRODUCT DIST**), melihat preview sebelum import, memantau progress secara real-time via WebSocket, membatalkan import dengan rollback data penuh, dan melihat riwayat upload dengan pagination, filter, sort, dan pencarian.

Feature ini adalah pasangan dari menu Timeseries yang sudah ada — polanya identik (upload → preview → background import → progress live → history), namun datanya adalah **master produk per-distributor** (bukan transaksi bulanan per-region). Kunci duplikat adalah `distributor_sap_code`: jika file baru diupload untuk distributor yang sama, seluruh data lama distributor tersebut digantikan.

Feature dibangun di atas stack yang sama: Rails 8 + React 19 + PostgreSQL + Inertia.js, dengan ActionCable (Solid Cable) untuk real-time updates dan background job infrastructure yang sudah ada. Implementasi dibagi menjadi tiga milestone: upload + preview + import dasar, WebSocket progress + cancel dengan rollback, dan list management.

---

### What the app does

- Admin mengupload satu atau banyak file `.xlsx` sekaligus (drag-and-drop atau pilih file/folder) dari `PRODUCT_DIST_*.xlsx`
- Sebelum import, setiap file ditampilkan dalam preview card: nama distributor, region, jumlah baris yang akan diimport
- Jika distributor sudah ada di database (duplikat berdasarkan `distributor_sap_code`), preview card menampilkan perbandingan: jumlah baris lama vs baru
- File duplikat yang tidak ada perubahan (row count identik) ditandai "Tidak ada perubahan terdeteksi" dan otomatis tidak dicentang
- Setiap preview card memiliki checkbox: file baru otomatis dicentang, file duplikat otomatis tidak dicentang (admin harus opt-in untuk mengganti)
- Tombol "Konfirmasi Import" hanya aktif jika minimal satu file dicentang
- Setelah konfirmasi, preview bertransisi ke tampilan progress real-time via WebSocket: setiap file menampilkan status live (queued → processing → completed / failed / cancelled)
- Admin dapat membatalkan file yang masih pending atau processing; pembatalan melakukan rollback penuh ke data sebelum upload — data lama dipertahankan untuk skenario replacement
- Setelah semua selesai, ditampilkan ringkasan "X berhasil, Y dibatalkan, Z gagal" dengan tombol "Upload lagi"
- Riwayat upload ditampilkan dalam tabel dengan pagination 25 per halaman, filter (region, status), pencarian filename, dan sort per kolom

---

### Already provided by the existing codebase

- Admin shell, design system components, auth (`Admin::BaseController`)
- Background job infrastructure (GoodJob / Solid Queue on Unix, `:async` adapter in-process on Windows)
- ActionCable infrastructure (Solid Cable, DB-backed) — sudah digunakan oleh Timeseries feature
- ActiveStorage untuk file attachment (sudah terkonfigurasi)
- Pattern identik sudah terbukti di `TimeseriesUpload`, `TimeseriesTransaction`, `TimeseriesImportJob`, `TimeseriesUploadChannel`, `Admin::Timeseries::UploadsController`
- Design system komponen: `Button`, `Badge`, `Checkbox`, `Input`, `Select`, `AdminShell`

---

### Out of scope

- **Delete upload dari history** — risiko kehilangan data; deferred ke iterasi berikutnya
- **Export / download** — re-download file asli atau export ke CSV/Excel
- **Audit trail per-row** — melihat baris mana yang berubah antara dua upload distributor yang sama
- **Email notifikasi** — memberitahu admin saat import selesai atau gagal
- **Bulk delete** — memilih beberapa upload record dan menghapus sekaligus
- **Tampilkan / edit data produk inline** — UI untuk melihat atau mengedit isi baris produk dari web
- **Filter history berdasarkan siapa yang mengupload** — semua admin punya akses penuh

---

### Data model

#### MasterProductDistUpload

Envelope satu upload session — satu record per file yang disubmit.

- **filename** — nama file asli yang diupload
- **distributor_sap_code** — kode SAP distributor (misal: `333344`), diambil dari data di dalam file; digunakan sebagai kunci duplikat
- **distributor_name** — nama lengkap distributor anak (misal: "Eka Jaya Putra Makmur, Semarang"), diambil dari data
- **distributor_parent_name** — nama distributor induk, diambil dari data
- **region** — nama region (misal: `RegCen`), diambil dari data
- **status** — status import: `pending`, `processing`, `completed`, `failed`, `cancelled`
- **row_count** — jumlah baris yang berhasil diimport (diisi setelah import selesai)
- **replaced_row_count** — jumlah baris lama yang dihapus saat replacement (0 jika file baru)
- **error_message** — pesan error jika import gagal
- **imported_at** — waktu import selesai
- **file attachment** — binary file `.xlsx` yang diupload (untuk diproses oleh background job)
- **uploaded_by** — user yang mengupload (relasi ke User)

#### MasterProductDistRow

Satu baris = satu product mapping untuk distributor tersebut. Setiap baris terhubung ke `MasterProductDistUpload`.

**Info Distributor (6 kolom):**
- region_name, area_name, distributor_sap_code, distributor_parent_name, distributor_id, distributor_child_name

**Kode Produk Distributor (3 kolom):**
- product_distributor_code, product_distributor_name, product_distributor_status

**Identitas Produk (7 kolom):**
- product_code, product_sap_code, barcode_product, barcode_inner_box, barcode_carton, product_name, brand_name

**Klasifikasi (8 kolom):**
- category_ceo_name, category_marketing_name, range_name, range_variant_name, range_marketing_name, category_name, category_sub_name, variant_name

**Packaging & Dimensi (8 kolom):**
- size, content_carton_pcs, dimension_product, dimension_inner_box, dimension_carton, weight_product, weight_inner_box, weight_carton

**Status Flags (3 kolom):**
- status (Active/Inactive), opsc_status (Active/Inactive), to_status (Active/Inactive)

**Harga — 14 price tier (15 kolom termasuk tanggal berlaku):**
- price_start_date, price_rbp, price_cbp, price_gt, price_mt, price_mbs, price_5_5_pct, price_gt_11_pct, price_skincare, price_koperasi, price_lazada, price_farmaku, price_shopee, price_sirclo, price_sociolla

**Gambar Produk (4 kolom):**
- product_image_1, product_image_2, product_image_3, product_image_4

**Relasi:** setiap `MasterProductDistRow` belongs to satu `MasterProductDistUpload`. Duplikat detection: jika `distributor_sap_code` yang sama sudah ada di database, semua baris lama untuk distributor tersebut dihapus dan digantikan oleh baris dari upload baru.

---

## Milestone 1 — Upload, Preview & Import Dasar

Milestone ini membangun end-to-end flow inti: admin dapat mengupload file Excel, melihat preview per-file dengan duplicate detection, memilih file mana yang diimport via checkbox, dan mengkonfirmasi import yang kemudian diproses di background. Progress masih menggunakan polling sederhana (belum WebSocket).

### What gets built

- Halaman `/admin/master-product-dist/uploads` dengan header, tombol "Upload File" dan "Pilih Folder", dan drop zone drag-and-drop untuk file `.xlsx`
- Menu "Master Product Dist" muncul di admin sidebar
- Setelah file dipilih, sistem membaca setiap file (sheet: PRODUCT DIST) dan menampilkan preview card per-file:
  - Nama file, nama distributor, region, jumlah baris yang akan diimport
  - Jika distributor sudah ada di DB: badge "Replacement" + perbandingan jumlah baris lama vs baru
  - Jika row count identik (tidak ada perubahan): label "Tidak ada perubahan terdeteksi"
- Checkbox per preview card: file baru → dicentang otomatis; file duplikat → tidak dicentang otomatis (admin harus opt-in)
- Tombol "Konfirmasi Import" disabled jika tidak ada yang dicentang
- Setelah konfirmasi, file yang dicentang dikirim ke server, import diproses di background, dan halaman menampilkan status sederhana (pending/processing/completed/failed) yang bisa di-refresh manual
- Tabel riwayat upload di bawah form (tanpa filter/sort/pagination di milestone ini): kolom Filename, Distributor, Region, Baris, Status, Waktu

### What milestone 1 explicitly does NOT include

- Real-time WebSocket progress — status hanya diperbarui via page refresh
- Tombol "Batalkan" dan rollback
- Pagination, filter, sort, atau search pada tabel history

### Done when

Admin dapat mengupload satu atau beberapa file `PRODUCT_DIST_*.xlsx`, melihat preview card dengan info distributor + duplicate comparison, memilih file yang ingin diimport, mengkonfirmasi, dan setelah refresh melihat status upload berubah menjadi `completed` dengan jumlah baris yang diimport.

---

## Milestone 2 — WebSocket Progress & Cancel

Milestone ini menggantikan polling manual dengan feed real-time via WebSocket dan menambahkan kemampuan membatalkan import dengan rollback data penuh.

### What gets built

- Setelah admin mengkonfirmasi import, tampilan bertransisi ke progress view: setiap file menampilkan status live (queued → processing → completed / failed / cancelled) tanpa perlu refresh halaman
- Status update mengalir via WebSocket dari background job ke browser
- Tombol "Batalkan" muncul per-file selama status masih `pending` atau `processing`
- Pembatalan: import berhenti, semua data yang sudah ditulis dalam sesi ini di-rollback; jika ini adalah replacement, data lama dipertahankan utuh; upload ditandai "Cancelled"
- Ringkasan final: "X berhasil, Y dibatalkan, Z gagal" dengan tombol "Upload lagi" yang mengembalikan ke state awal

### What milestone 2 explicitly does NOT include

- Granular row-level progress percentage (misal "3.241 / 8.301 baris diproses")
- Membatalkan beberapa upload sekaligus dari tabel history
- Pagination, filter, atau sort pada tabel history

### Done when

Admin mengkonfirmasi import, melihat per-file status berubah secara real-time tanpa refresh, dapat membatalkan file yang sedang diproses, dan memverifikasi bahwa setelah pembatalan database berisi data yang sama seperti sebelum upload dimulai.

---

## Milestone 3 — List Management

Milestone ini menambahkan pagination, filter, pencarian, dan sort pada tabel riwayat upload sehingga admin dapat menavigasi ratusan record secara efisien.

### What gets built

- Tabel riwayat upload dipaginasi server-side, 25 record per halaman
- Kontrol pagination di bawah tabel: Sebelumnya, Berikutnya, nomor halaman, dan ringkasan "Menampilkan X–Y dari Z upload"
- Filter bar di atas tabel: dropdown Region, dropdown Status, dan field text search untuk filename
- Tombol "Reset filter" untuk menghapus semua filter aktif sekaligus
- Kolom yang bisa di-sort dengan klik header: Uploaded at, Distributor, Region, Row Count, Status
- Klik header → sort ascending; klik lagi → sort descending; kolom aktif ditandai dengan ikon panah
- Semua filter aktif, search term, sort column, sort direction, dan halaman aktif dicerminkan di URL (bisa dibookmark atau dishare)
- Menerapkan filter atau search mereset ke halaman 1

### What milestone 3 explicitly does NOT include

- Saved / preset filter configurations
- Multi-column sort
- Variable page-size picker (per-page count tetap di 25)
- Filter berdasarkan distributor_id numerik (hanya by region dan status)

### Done when

Dengan ratusan upload record di database, admin dapat menavigasi halaman-halaman, memfilter berdasarkan region dan status, mencari berdasarkan nama file, dan sort berdasarkan row count — semua tercermin di URL dan bisa digunakan dari fresh page load.
