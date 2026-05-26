# Build Plan Index

Last updated: 2026-05-26

## Features

| # | Feature | Status | PRD | Started |
|---|---------|--------|-----|---------|
| 1 | Timeseries Upload Enhancements | ✅ Complete | [prd.md](01-timeseries-upload-enhancements/prd.md) | 2026-05-24 |
| 2 | Master Outlet Dist | ✅ Complete | [prd.md](02-master-outlet-dist/prd.md) | 2026-05-24 |
| 3 | Master Product Dist | ✅ Complete | [prd.md](03-master-product-dist/prd.md) | 2026-05-24 |
| 4 | Pivot | 📋 Planned | [prd.md](04-pivot/prd.md) | 2026-05-24 |
| 5 | Data Integrity | ✅ Complete | [prd.md](05-data-integrity/prd.md) | 2026-05-25 |
| 6 | Data Integrity: Excel Export | ✅ Complete | [prd.md](06-data-integrity-excel-export/prd.md) | 2026-05-26 |
| 7 | Trans Sell Out Account | ✅ Complete | [prd.md](07-trans-sellout-account/prd.md) | 2026-05-26 |
| 8 | Market Share B2B | ✅ Complete | [prd.md](08-market-share-b2b/prd.md) | 2026-05-26 |
| 9 | KA Profitability | ✅ Complete | [prd.md](09-ka-profitability/prd.md) | 2026-05-26 |

## Changelog

- **2026-05-24** — Feature 1 (Timeseries Upload Enhancements) PRD created
- **2026-05-24** — Feature 2 (Master Outlet Dist) PRD created
- **2026-05-24** — Feature 1 (Timeseries Upload Enhancements), Milestone 1 complete: duplicate detection comparison cards + per-file skip/replace checkboxes
- **2026-05-24** — Feature 1 (Timeseries Upload Enhancements), Milestone 2 complete: WebSocket real-time progress + cancel with full rollback
- **2026-05-24** — Feature 1 (Timeseries Upload Enhancements), Milestone 3 complete: pagination + filter + search + sort on upload history
- **2026-05-24** — Feature 3 (Master Product Dist) PRD created
- **2026-05-24** — Feature 4 (Pivot) PRD created
- **2026-05-25** — Feature 5 (Data Integrity) PRD created
- **2026-05-25** — Feature 5 (Data Integrity), Milestone 1 complete: sidebar Data group + SoT upload + background check job with WebSocket progress + minimal result detail page
- **2026-05-25** — Feature 5 (Data Integrity), Milestone 2 complete: full mismatch dashboard with tabs/sort/filter/pagination + IDR formatting + re-upload shortcut deeplink + Timeseries banner + sidebar badge counter
- **2026-05-25** — Feature 5 (Data Integrity), Milestone 3 complete: paginated/filterable/sortable history table + latest-check callout on index + "Jalankan ulang check" button + IntegrityCheckRerunJob + "Resolved" badges on re-run results
- **2026-05-25** — Feature 5 (Data Integrity), post-completion patch: `flag_program` filter scaffolding — global per-admin preference on `/settings` (default exclude), snapshotted onto each `IntegrityCheck` for re-run reproducibility, `TimeseriesTransaction.non_program` scope (reusable by Pivot), aggregation in both jobs honors the snapshot, "PROGRAM excl./incl." badge in history table + metadata strip on detail page
- **2026-05-25** — Feature 5 (Data Integrity), perf refactor: IntegrityCheckJob + IntegrityCheckRerunJob switched from N+1 (count + sum per SoT row) to single `GROUP BY region, period_year, period_month` bulk aggregation + `insert_all!`; cut wall-clock for 200 SoT rows on 44.5M DB from ~3 min to seconds
- **2026-05-25** — Feature 5 (Data Integrity), filter case-sensitivity fix: `non_program` scope changed to `UPPER(flag_program) IS DISTINCT FROM 'PROGRAM'` (case-insensitive) after discovering real data uses sentence case `"Program"`; PRD updated to clarify case-insensitive matching is in-scope
- **2026-05-26** — Feature 6 (Data Integrity: Excel Export) PRD created
- **2026-05-26** — Feature 6 (Data Integrity: Excel Export), Milestone 1 complete: "Download Excel" button on completed check detail page + server-side xlsx generation via caxlsx with four sheets (Mismatched, Missing in DB, Extra in DB, Matched)
- **2026-05-26** — Feature 2 (Master Outlet Dist), Milestone 1 complete: full upload pipeline for OUTLET_DIST_*.xlsx — parser reads "OUTLET DISTRIBUTOR" sheet by name, duplicate detection by dist_sap_code, WebSocket progress + cancel, paginated/filterable history table
- **2026-05-26** — Feature 3 (Master Product Dist), Milestone 1 complete: upload pipeline for PRODUCT_DIST_*.xlsx — parser reads "PRODUCT DIST" sheet by name (54 columns), duplicate detection by distributor_sap_code, preview cards with region + product count comparison, background import job, plain history table
- **2026-05-26** — Feature 3 (Master Product Dist), Milestone 2 complete: WebSocket real-time progress view + per-file cancel with full rollback + live-update history rows for in-flight uploads
- **2026-05-26** — Feature 3 (Master Product Dist), Milestone 3 complete: server-side pagination (25/page) + Region/Status/filename filters + 5-column sort + URL-reflected state on upload history table
- **2026-05-26** — Feature 7 (Trans Sell Out Account) PRD created
- **2026-05-26** — Feature 7 (Trans Sell Out Account), Milestone 1 complete: upload pipeline for Distributor .xlsx — parser reads "Report Time Series" sheet by name (86 CORE+NEW_2025 columns), duplicate detection by distributor_code+period with old-vs-new row count + netto wise comparison, per-file checkboxes, background import job with advisory lock, plain history table with IDR netto formatting
- **2026-05-26** — Feature 7 (Trans Sell Out Account), Milestone 2 complete: TransSelloutAccountUploadChannel + broadcast calls in job + live progress view with per-file Batalkan button + final summary panel + live history row updates
- **2026-05-26** — Feature 7 (Trans Sell Out Account), Milestone 3 complete: server-side pagination (25/page) + Distributor Code/Year/Month/Status filters + filename search + 6-column sort + URL-reflected state on upload history table
- **2026-05-26** — Feature 8 (Market Share B2B) PRD created
- **2026-05-26** — Feature 8 (Market Share B2B), Milestone 1 complete: 5-template detection (IDG wide-format, IDM Reguler/Skincare, MIDI, SAT) + upload pipeline + MarketShareB2bImportJob + plain history table
- **2026-05-26** — Feature 8 (Market Share B2B), Milestone 2 complete: MarketShareB2bUploadChannel + broadcast calls in job + live progress view with per-file Batalkan button + final summary panel + live history row updates
- **2026-05-26** — Feature 8 (Market Share B2B), Milestone 3 complete: server-side pagination (25/page) + Account/Report Type/Year/Month/Status filters + filename search + 6-column sort + URL-reflected state on upload history table
- **2026-05-26** — Feature 9 (KA Profitability) PRD created
- **2026-05-26** — Feature 9 (KA Profitability), Milestone 1 complete: upload pipeline for Profitability_*.xlsx — parser reads "Detail" sheet (wide format), fiscal_year detection, duplicate/supersede detection via is_latest flag, background import job with advisory lock, static history table with "Terbaru" badge
- **2026-05-26** — Feature 9 (KA Profitability), Milestone 2 complete: KaProfitabilityUploadChannel + broadcast calls in job + live progress view with per-file Batalkan button + final summary panel + live history row updates
- **2026-05-26** — Feature 9 (KA Profitability), Milestone 3 complete: server-side pagination (25/page) + Status/Fiscal Year filters + 4-column sort + URL-reflected state on upload history table
