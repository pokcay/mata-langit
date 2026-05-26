# KA Profitability

## What we're building

KA Profitability adalah fitur upload dan pencatatan laporan profitabilitas per Key Account (retail chain). Admin mengupload file Excel `Profitability_*.xlsx` yang berisi data Sales, COGS, dan margin untuk 25 outlet (INDOMARET, MIDI, GUARDIAN, SAT, dsb.) per fiscal year. Aplikasi menyimpan data tersebut ke database dan menampilkan history upload dengan penanda "Terbaru" untuk menunjukkan dataset paling aktual.

Setiap file merupakan **snapshot kumulatif** — file yang diupload bulan Mei berisi data APR + MAY, file Juni berisi APR + MAY + JUN, dan seterusnya. Upload terbaru untuk satu fiscal year otomatis menggantikan (supersede) upload sebelumnya sebagai dataset aktif, meski data lama tetap tersimpan di history.

Fitur ini dibangun di atas Rails 8 + Inertia.js + React 19 + PostgreSQL menggunakan pola upload yang sudah ada di aplikasi (Trans Sellout, Market Share B2B), dan dikerjakan dalam 3 milestone berurutan.

---

### What the app does

- Admin mengupload satu atau beberapa file `Profitability_*.xlsx` dari halaman upload
- Sistem membaca sheet `Detail` dari file dan memparse seluruh baris data (outlet group, level, deskripsi metrik, nilai per bulan MTD dan YTD)
- Deteksi duplikat: jika fiscal year yang sama sudah ada di database, admin mendapat peringatan dan memilih apakah mau supersede data lama
- Import berjalan di background job dengan progress bar real-time via WebSocket; admin bisa membatalkan per file dengan rollback penuh
- Setelah import selesai, upload baru ditandai `is_latest = true`; upload sebelumnya untuk fiscal year yang sama di-set `is_latest = false`
- History table menampilkan semua upload yang pernah dilakukan dengan badge **"Terbaru"** pada upload paling baru per fiscal year
- History table bisa difilter berdasarkan status dan fiscal year, disorting, dan dipaginasi

---

### Already provided by the Build New starter

- Autentikasi admin + authenticated app shell
- Background job queue (Solid Queue / async adapter di Windows)
- WebSocket infrastructure (Solid Cable)
- Pola upload + WebSocket channel + progress view (sudah terimplementasi di fitur Trans Sellout, Market Share B2B, dsb.)
- Design system: token, komponen UI (`<Badge>`, `<Button>`, tabel, dsb.)

---

### Out of scope

- **Dashboard profitabilitas** — visualisasi chart/tabel metrik per outlet; kemungkinan feature 10
- **Drill-down per outlet** — halaman detail yang menampilkan 87 baris metrik per outlet tertentu
- **Export ke Excel** — download data yang sudah diimport
- **Perbandingan antar periode** — side-by-side dua fiscal year atau dua bulan
- **Filter per metrik** — tampilkan hanya Sales atau hanya COGS
- **Akses publik atau sharing** — laporan ini hanya untuk admin internal

---

### Data model

**KaProfitabilityUpload** — satu record per file yang diupload

- `filename` — nama file asli seperti yang diupload
- `status` — status proses: pending, processing, completed, failed, cancelled
- `fiscal_year` — tahun fiskal yang diekstrak dari header file, contoh: "2026-2027"
- `outlet_count` — jumlah outlet unik yang berhasil diimport
- `record_count` — total baris record yang diimport
- `is_latest` — apakah ini upload paling baru untuk fiscal year tersebut; hanya satu upload per fiscal year yang bernilai true di satu waktu
- `uploaded_by` — admin yang melakukan upload (referensi ke User)
- `error_message` — pesan error jika status failed

**KaProfitabilityRecord** — satu record per baris data (outlet × metrik × periode × tipe)

- `upload` — referensi ke KaProfitabilityUpload
- `outlet_group` — nama outlet, contoh: "INDOMARET", "MIDI", "TOTAL"
- `level` — level hierarki dari file Excel, contoh: "\*" untuk summary
- `description` — nama metrik, contoh: "Sales", "COGS", "% of Sales", "YOY%"
- `period_type` — tipe periode: MTD (Month-to-Date) atau YTD (Year-to-Date)
- `period_month` — bulan dalam fiscal year: APR, MAY, JUN, JUL, AUG, SEP, OCT, NOV, DEC, JAN, FEB, MAR
- `fiscal_year` — tahun fiskal, contoh: "2026-2027"
- `value` — nilai numerik (desimal, bisa null jika bulan belum ada data)

Relasi: setiap `KaProfitabilityUpload` memiliki banyak `KaProfitabilityRecord`. Kolom `fiscal_year` di-denormalisasi ke `KaProfitabilityRecord` untuk mempermudah query tanpa join.

---

## Milestone 1 — Upload Pipeline + History Table

Parser Excel, import job background, deteksi duplikat/supersede, dan history table statis tanpa WebSocket.

### What gets built

- Halaman upload di `/admin/data/ka-profitability/uploads` (masuk grup "Data" di sidebar admin)
- Admin memilih satu atau beberapa file Excel untuk diupload
- Preview card per file sebelum import: nama file, fiscal year yang terdeteksi, jumlah outlet, estimasi baris
- Deteksi duplikat: jika sudah ada upload untuk fiscal year yang sama, preview card menampilkan warning "Data fiscal year 2026-2027 sudah ada (upload terakhir: [tanggal])" dengan checkbox per file untuk mengkonfirmasi supersede
- Tombol "Import" memulai background job; halaman berpindah ke history table (tanpa progress live — M2)
- Background job membaca sheet `Detail` file Excel, memparse semua baris, menyimpan ke `ka_profitability_records`, lalu set `is_latest = true` untuk upload baru dan `is_latest = false` untuk upload lama per fiscal year
- History table di bawah form upload: kolom filename, fiscal year, outlet count, record count, status, tanggal upload, siapa upload
- Badge **"Terbaru"** pada baris dengan `is_latest = true`
- Status di tabel direfresh manual (tidak live — M2)

### What milestone 1 explicitly does NOT include

- Progress bar real-time dan tombol Batalkan (M2)
- Filter, sort multi-kolom, dan pagination server-side (M3)
- Rollback otomatis jika dibatalkan
- Validasi format Excel yang sangat ketat (fail gracefully dengan pesan error jika sheet atau kolom tidak ditemukan)

### Done when

Admin bisa mengupload file `Profitability_*.xlsx`, melihat preview dengan deteksi duplikat, mengkonfirmasi import, dan setelah refresh halaman melihat upload baru muncul di history table dengan badge "Terbaru".

---

## Milestone 2 — Real-time Progress (WebSocket)

Tambahkan progress bar live dan tombol Batalkan dengan rollback penuh ke alur upload yang sudah ada dari M1.

### What gets built

- WebSocket channel `KaProfitabilityUploadChannel` yang membroadcast progress per file (mengikuti pola TransSelloutAccountUploadChannel / MarketShareB2bUploadChannel)
- Halaman upload berpindah ke progress view setelah tombol Import ditekan: daftar file dengan progress bar individual, status teks ("Memproses...", "Selesai", "Gagal")
- Tombol **"Batalkan"** per file selama status processing; membatalkan job dan melakukan rollback semua record untuk file tersebut
- Panel ringkasan setelah semua file selesai: berapa berhasil, berapa gagal, berapa dibatalkan
- Baris di history table terupdate secara live selama import berlangsung (tidak perlu refresh manual)

### What milestone 2 explicitly does NOT include

- Filter, sort, dan pagination di history table (M3)

### Done when

Setelah menekan Import, admin melihat progress bar bergerak real-time per file. Admin bisa menekan Batalkan di tengah jalan dan konfirmasi bahwa record untuk file tersebut terhapus dari database. Setelah semua selesai, history table menampilkan baris yang terupdate tanpa refresh halaman.

---

## Milestone 3 — History Filters + Pagination

Tambahkan filter, sort, dan pagination server-side pada history table.

### What gets built

- Pagination server-side: 25 baris per halaman dengan kontrol prev/next
- Filter: Status (All / Completed / Failed / Cancelled / Processing), Fiscal Year (dropdown berisi nilai unik dari DB)
- Sort multi-kolom: tanggal upload, filename, fiscal year, status; arah asc/desc
- State filter dan sort tercermin di URL query string (bisa di-bookmark atau di-share)
- Indikator baris mana yang sedang ditampilkan ("Menampilkan 1–25 dari 48 upload")

### What milestone 3 explicitly does NOT include

- Search full-text pada filename
- Export history table ke CSV/Excel

### Done when

Admin bisa memfilter history hanya menampilkan upload dengan status Completed untuk fiscal year 2026-2027, mengsort dari terbaru ke terlama, dan melihat hasilnya terpaginasi. State tersimpan di URL sehingga bisa di-refresh tanpa kehilangan filter.
