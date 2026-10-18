# Phase 5B Sage 200 accounting simulation

Verified on 2026-10-16 with the migrated standalone database for schema compatibility and an isolated SQLite copy for every synchronization scenario.

## Routes

- `/management/sage`
- `GET /api/management/sage`
- `POST /api/management/sage` with `prepare`, `submit`, and `reconcile` only.

The management shell now includes Sage 200 Demo without removing existing links.

## Architecture

`SageAccountingAdapter` defines preparation, simulated submission and deterministic posting retrieval. `MockSageAccountingAdapter` is the only implementation. It makes no network request and does not claim Sage 200 API, endpoint, schema, or edition compatibility.

`SageAccountingSync` is a one-to-one persisted record linked to the source POS Transaction. It stores source amounts, mapping version/categories, placeholder payload, posting/reconciliation state, posting reference, attempt count, actors, timestamps and failure reasons. Synchronization never mutates the source Order or Transaction.

The synchronization engine reuses the existing `managementEligibleAmount` sales definition. It discovers POS Transactions only, so wallet deposits and unconfirmed OPERA attempts are excluded by design.

## DEMO mapping assumptions

All categories are clearly marked placeholders:

- Outlet revenue category: `DEMO_FNB_*_SALES`.
- Demo checkout offset: `DEMO_TENDER_CLEARING`.
- Wallet sale offset: `DEMO_WALLET_CLEARING`.
- Confirmed OPERA sale offset: `DEMO_GUEST_FOLIO_CLEARING`.
- Discount category: `DEMO_SALES_DISCOUNT`.
- Void category: `DEMO_POS_VOID_REVERSAL`.

For a normal sale, the placeholder lines balance gross sales credit against payment clearing debit. For discounts, the separate discount debit plus net clearing debit balances gross sales credit. For a voided transaction with a documented void adjustment, the mock policy creates a reversal record only; it does not recognize new revenue.

## Synchronization behavior

- `prepare` persists one queued record per source Transaction through a unique database constraint.
- Repeating preparation returns the existing record.
- `submit` is allowed for queued records and safely retryable transmission failures.
- Rejected records do not retry automatically.
- Uncertain records cannot be resubmitted and expose only deterministic reconciliation.
- Repeated reconciliation returns the existing posted result without a new posting.
- Success/failure does not alter POS settlement status.
- Accounting audit events record source identification, preparation, posting attempt, result, reconciliation request and reconciliation result.

## Isolated scenario results

The isolated database contained discounted, voided, confirmed OPERA, and unconfirmed OPERA fixtures plus existing POS records.

- 9 Sage synchronization records.
- 8 posted, 1 rejected.
- 9 unique source Transaction IDs.
- 9 balanced DEMO payloads.
- Successful settled sale: passed.
- Wallet-funded sale mapped once with `DEMO_WALLET_CLEARING`: passed.
- Wallet deposit synchronized: 0 records.
- Confirmed OPERA sale mapped once with `DEMO_GUEST_FOLIO_CLEARING`: passed.
- Unconfirmed OPERA attempt synchronized: 0 records.
- Voided transaction: eligible amount 0; reversal amount 1,000,000 kobo; reversal reference `PHASE5B-VOID-OVR`.
- Discounted transaction: eligible amount 1,500,000 kobo; discount 500,000 kobo.
- Duplicate preparation and duplicate post submission: returned existing records; no duplicate posting.
- Mock unavailable service: first attempt became transmission failure, second safe retry posted.
- Mock accounting rejection: rejected.
- Uncertain acknowledgment: unsafe resubmit returned HTTP 400; deterministic reconciliation posted; repeated reconciliation returned duplicate.
- Sage audit events in isolated data: 40.

Financial regression:

- Sales before Sage synchronization: 15,370,000 kobo.
- Sales after synchronization: 15,370,000 kobo.
- Outlet totals: 15,370,000 kobo.
- Payment totals: 15,370,000 kobo.
- Existing wallet statement PDF still rendered ₦3,500 and excluded the ₦200,000 deposit.
- Existing management PDF rendered ₦153,700 in the isolated fixture set.
- Existing OPERA monitoring retained one confirmed and one unconfirmed simulated attempt in the isolated fixture set.

## Authorization and browser verification

- Missing identity: HTTP 401.
- Ordinary staff: HTTP 403 for GET and mutation attempts.
- Supervisor: HTTP 200.
- Invalid filters: HTTP 400.
- Unsupported mutation: HTTP 400 and no state change.
- Central audit search resolves Sage source transaction, order, outlet and posting details.
- Desktop: 1440 × 1000.
- Mobile: 390 × 844 with no page-level horizontal overflow.
- Management UI prepared and submitted one additional candidate through the browser.
- Safe controls shown only for queued, transmission-failed or uncertain records.

Screenshots:

- `verification/artifacts/sage-monitoring-desktop.png`
- `verification/artifacts/sage-monitoring-mobile.png`

## Existing data preservation

Immediately before and after the schema migration, live users, outlets, orders, transactions and overrides were unchanged. While verification was running, concurrent normal demo activity added one wallet deposit and three staff status-change audits for the existing ordinary order `LL-MV9R7M12-KUIW`. Those records were preserved. The live database contains zero Sage synchronization records or Phase 5B test identifiers.

All Sage fixtures were confined to `/tmp/lakowe-sage-phase5b.db`; the isolated database and pre-migration backup were removed after verification.

## Validation

- `npx prisma validate`: passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with five pre-existing `next/no-img-element` warnings in dining pages and no Phase 5B warnings.
- `npm run build`: passed with Sage page/API in the route table.
- Restart persistence: 9 records, 8 posted and 1 rejected survived isolated production-server restart.
- Live Sage monitoring after Prisma-client restart: HTTP 200 with zero live sync records.

## Eventual authorized Sage 200 integration

Real deployment requires confirmation of Lakowe Lakes' exact Sage 200 edition, deployment model, modules, chart of accounts, tax rules, revenue/tender mappings, posting periods, business dates, reversal policy, API/import contract, authentication method, external idempotency rules, posting-status retrieval contract, sandbox/UAT access, secrets management, network controls, reconciliation ownership, financial close procedures and security/finance approval.

No Sage environment, credential, accounting file, production endpoint, or external financial transaction was used.
