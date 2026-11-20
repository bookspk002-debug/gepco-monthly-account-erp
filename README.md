# GEPCO Monthly Account ERP (Web)

RO GEPCO Hafizabad (Code: HFR) ke liye web-based Monthly Account ERP.
Flow: **CP-41 + Payroll + CP-91 + Dr/Cr Advices + Imprest → Ledger Posting Summaries → Trial → Final Trial (previous month add) → 12 months → Year-End (Balance Sheet carry forward, Operating zero).**

## Features
- **Dashboard** — Trial totals, difference, advices, checks ek nazar mein
- **Chart of Accounts** — 139 GL codes, Balance Sheet / Operating classification
- **CP-41 Entry** — Sale categories + Taxes (OB/Assessment/Payments/CB) → Folio 3/4 auto
- **Payroll Entry** — Pay + deductions → Folio 1 auto, Net Pay auto
- **CP-91 Entry** — Company-wise free supply → CP-91 lines auto
- **Ledger Posting Summaries** — Excel/CSV upload, copy-paste, manual lines, batches
- **Journal Vouchers** — ek ek JV post karein (narration lazmi), print bhi
- **Trial Balance** — Opening + During + Closing, printable, CSV export
- **Dr/Cr Advices** — advice banana, har advice printable, lists printable
- **SS Cheques** — list + print (Form A-25)
- **Current Account** — Sections A–D statement, printable
- **Month / Year Close** — Closing → agle month ka Opening; June ke baad Year-End (BS carry, Operating zero, Surplus/Deficit transfer)
- **Checks** — Summaries difference, unmatched codes, negative balances, draft JVs
- **Backup** — JSON export/import (har month close par backup lazmi lein)

## Database
Data browser ke **IndexedDB** mein rehta hai (isi computer/browser par). Pehli dafa July 2026 ka asal data load hota hai (Monthly_Account_7-2026.xls se). Kisi aur computer par use karna ho to Backup JSON export karke wahan restore karein.

## Note (July 2026)
- Trial totals asal trail se match karte hain: Closing Dr 107,363,658,494.35 / Cr 107,263,724,964.35, Difference 99,933,530 (SUMMARY ka apna farq).
- 16 SUMMARY codes COA mein nahi milte (maslan 100102, 70102) — Checks page par list hai. COA mein add karein ya JV se adjust karein.
- July ke adjustments ek JV mein hain ("July 2026 adjustments — purani file ke formulas se") — har line confirm karein.
