# Phase 4C advanced management reporting

Verified on 2026-10-15 against the persisted Prisma SQLite records and an isolated database copy.

## Routes

- `/management/reports`
- `/api/management/reports`

The management shell now includes Reports while preserving Overview, Audit Logs, Supervisor Overrides and operational links.

## Shared reporting architecture

The advanced report composer calls the existing Phase 4A `getManagementReport` and Phase 4B `getAuditReport` / `getOverrideReport` services. The sales service was extended with validated payment/status filters, discount totals, outlet order counts, and bounded row offset/limit metadata. No second sales eligibility engine was created.

The same `AdvancedReportDataset` drives browser JSON, CSV and PDF output.

## Report types

1. Sales Report: eligible sales, eligible transaction count, void count, approved discount amount, daily trend, payment breakdown and transaction rows.
2. Outlet Performance Report: eligible sales, orders, completed orders and eligible transaction counts by outlet.
3. Employee Activity Report: persisted actor identity/role, actions, status-change count, override-request count, outlets and transaction/order references.
4. Supervisor Override Report: requester, deciding supervisor, requested action, reasons, status, linked transaction/order, amounts and timestamps.

## Filters

- Sales: date range, outlet, transaction status, payment method.
- Outlet performance: date range, outlet.
- Employee activity: date range, outlet, employee.
- Supervisor overrides: date range, outlet, requesting employee, deciding supervisor, override status.

Applied filters are returned with resolved display labels and shown above every report. Irrelevant, unknown, duplicate or malformed parameters return HTTP 400. Date filters are inclusive UTC dates and inherit the existing 366-day range limit.

## Persisted reconciliation

- Eligible sales: 11,820,000 kobo (₦118,200).
- Eligible POS transactions: 6.
- Voids: 0.
- Approved discounts: 0.
- Outlet sales sum: 11,820,000 kobo.
- Payment-method sales sum: 11,820,000 kobo.
- Orders across outlets: 6.
- Completed orders: 1.
- Employee actions: 12.
- Order status changes: 3.
- Override requests: 1.
- Override decisions: 1 rejected, 0 approved, 0 pending.
- Wallet payment filter: 4,110,000 kobo across 2 POS transactions.
- The 20,000,000-kobo wallet deposit is absent from UI, CSV and PDF sales output.

## Export behavior

- All four report types passed JSON, CSV and PDF checks.
- CSV money fields are raw integer kobo and are labelled `(kobo)`.
- PDF and UI money fields are formatted Naira.
- CSV strings beginning with `=`, `+`, `-` or `@` receive a leading apostrophe before RFC-style quoting.
- PDFs embed a subset of OFL Noto Sans with Unicode mapping; `pdffonts` reports embedded/subset/Unicode as yes.
- Sales PDF visibly and textually renders ₦118,200 and each transaction amount.
- Empty sales, employee and override reports export a valid no-records CSV/PDF. An empty-period outlet report preserves four outlets with zero activity.
- UI and exports use the last successfully generated query.
- Exports are capped at 2,000 rows and mark `Truncated: Yes` when more records match.

## Isolated special-case results

The verified database was copied to `/tmp`. The copy received one approved discount, one void, an outlet name beginning with `=SUM(1,1)`, and 2,005 audit-only rows.

- Eligible sales: 13,320,000 kobo.
- Eligible transactions: 7.
- Void count: 1; void eligible amount: 0.
- Approved discount: 500,000 kobo.
- Discounted 2,000,000-kobo transaction contributed 1,500,000 kobo.
- Outlet and payment totals both reconciled to 13,320,000 kobo.
- CSV exported the formula-like outlet as `'=SUM(1,1)`.
- PDF rendered ₦133,200 and ₦5,000 correctly.
- Employee activity matched 2,020 records; exports contained 2,000 and explicitly marked truncation.
- The long PDF contained 124 content pages during the limit test.
- The source database SHA-256 remained `759ef54469db0c021c147774d33b3e7cdbd6c533aff338c0e309016de0daa975`.
- The temporary database was removed.

## Authorization and endpoint safety

- No identity: HTTP 401.
- Ordinary staff: HTTP 403.
- Persisted supervisor: HTTP 200.
- The endpoint implements GET only; report generation does not modify financial or audit records.

## Browser verification

- All four report selectors and relevant controls were exercised in system Chrome with browser sandboxing enabled.
- Sales, wallet-payment, employee and supervisor/override filters matched backend results.
- Actual CSV and PDF downloads completed through the UI.
- Empty result state remained exportable.
- Desktop viewport: 1440 × 1000.
- Mobile viewport: 390 × 844 with no page-level horizontal overflow.
- Daily trend chart, payment breakdown, outlet comparison, summary cards, applied filters and data tables rendered.
- No unexpected local request failures.

Screenshots and primary export evidence:

- `verification/artifacts/management-reports-desktop.png`
- `verification/artifacts/management-reports-mobile.png`
- `verification/artifacts/management-sales.csv`
- `verification/artifacts/management-sales.pdf`
- `verification/artifacts/management-sales-isolated.csv`
- `verification/artifacts/management-sales-isolated.pdf`
- `verification/artifacts/management-employees-limited.csv`
- `verification/artifacts/management-employees-limited.pdf`

## Validation

- `npx prisma validate`: passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with five pre-existing `next/no-img-element` warnings in dining pages and no Phase 4C warnings.
- `npm run build`: passed with both Phase 4C routes in the production route table.

## Limitations

Profit, expenses, cost of goods, taxes, inventory, covers and provider settlement are not recorded and are not inferred. Employee activity is limited to persisted `AuditEvent` records. Assigned supervisor is unavailable because only the deciding supervisor is recorded. Demo identity is server-checked against the persisted supervisor role but is not production authentication.
