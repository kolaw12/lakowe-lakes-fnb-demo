# Phase 5A Oracle OPERA integration simulation

Verified on 2026-10-15 using the migrated standalone SQLite database for schema compatibility and an isolated database copy for all workflow scenarios.

## Routes

- `/management/opera`
- `POST /api/opera/room-charge`
- `GET /api/management/opera`
- `POST /api/management/opera` with the single supported management action `reconcile`

The management shell includes OPERA Demo without removing existing management or operations links.

## Architecture

`OperaAdapter` defines three replaceable operations: room validation, folio-charge submission, and posting-result retrieval. `MockOperaAdapter` implements deterministic fictional scenarios and makes no network request. It does not claim to reproduce an OPERA edition or endpoint contract.

`checkoutWithOpera` validates untrusted input, rebuilds modifier selections from canonical menu data, recalculates the total in integer minor units, creates an idempotent attempt, audits verification/posting, and creates an Order plus settled POS Transaction only after a confirmed posting.

`reconcileOperaAttempt` is supervisor-protected. It only acts on an uncertain accepted posting with a posting reference and pending reconciliation state. Repeating reconciliation after settlement returns the existing result without new financial recognition.

`OperaRoomChargeAttempt` persists the attempt, masked guest display, fictional room reference, canonical checkout reconstruction data, verification/posting/reconciliation states, failure reason, posting reference, audit identity, and optional Order/Transaction relations. Verification codes and guest surnames are not persisted.

## Fictional scenarios

- Room 101 / Adebayo / LAKE-101: confirmed posting.
- Room 202: vacant.
- Room 303 / Okoro / LAKE-303: room charging disabled.
- Room 404 / Mensah / LAKE-404: posting rejected.
- Room 505 / Bello / LAKE-505: mock integration unavailable.
- Room 606 / Nwosu / LAKE-606: uncertain posting followed by deterministic supervisor reconciliation.
- Incorrect surname or code on an occupied room: invalid guest verification.

All rooms, people, codes, folio references and posting references are explicitly fictional.

## Transaction behavior

- Confirmed posting: creates one `opera_demo` Order and one `settled` POS Transaction, linked to the attempt.
- Verification failure: creates no Order or Transaction.
- Rejected posting: creates no Order or Transaction.
- Unavailable posting: creates no Order or Transaction and enters manual-review state; no unsafe retry is exposed.
- Uncertain posting: creates no Order or Transaction until supervisor reconciliation confirms the result.
- Reconciled posting: creates the Order/Transaction exactly once and marks the attempt resolved.
- Duplicate checkout key: returns the original attempt/order and creates no second posting.
- If external confirmation were received but local persistence failed, the posting reference is retained as uncertain/pending rather than claiming success or blindly resubmitting.

Existing reporting continues to recognize only `settled` and valid `discounted` transactions. Wallet deposits remain excluded.

## Audit behavior

The workflow records:

- `opera.room_charge.initiated`
- `opera.room_charge.verification`
- `opera.room_charge.posting_attempt`
- `opera.room_charge.posting_result`
- `opera.room_charge.reconciliation_requested`
- `opera.room_charge.reconciled`
- `order.created` for confirmed postings

OPERA events are enriched in the central management audit service with outlet, reserved order reference, linked transaction where confirmed, and safe posting/reconciliation details.

## Isolated test results

Nine complete checkout attempts were created:

- 3 settled: direct API success, browser success, and one uncertain posting reconciled by a supervisor.
- 2 rejected postings: API and browser.
- 1 integration unavailable.
- 1 vacant.
- 1 invalid guest verification.
- 1 room-charge disabled.

Results:

- Unique idempotency keys: 9 of 9.
- Confirmed OPERA Orders/Transactions: 3.
- Unconfirmed attempts with financial links: 0.
- Duplicate success request returned the same attempt and order.
- Repeated reconciliation returned the existing result and added no audit or transaction.
- Client-injected modifier pricing was rejected before attempt creation.
- OPERA workflow audit events: 35.
- Verification codes and unmasked fictional guest surnames persisted: 0.
- All monitoring room and guest displays were masked.
- Persistence after production-server restart: passed.

Wallet regression:

- A new wallet checkout still created one wallet order and ledger debit.
- Final isolated eligible sales: 13,220,000 kobo (₦132,200).
- Demo checkout: 7,710,000 kobo.
- Golfer Wallet: 4,460,000 kobo.
- OPERA Demo: 1,050,000 kobo.
- Payment totals reconcile to 13,220,000 kobo.

## Authorization and validation

- Missing management identity: HTTP 401.
- Ordinary staff identity: HTTP 403.
- Persisted supervisor identity: HTTP 200.
- Room details, idempotency key, guest fields, cart lines, quantities, item/outlet relationship, modifier choices and totals are validated server-side.
- Monitoring date, outlet, status, reconciliation and reference filters are validated server-side.
- Management room and guest values are masked.

## Browser verification

- Rejected room charge remained on checkout and showed the fictional folio rejection.
- Successful room charge redirected to the order confirmation page.
- Confirmation explicitly states that no real hotel or financial service was contacted.
- Uncertain posting exposed one functional supervisor reconciliation control.
- After reconciliation: settled 3, uncertain 0, pending reconciliation 0.
- Management monitoring desktop: 1440 × 1000.
- Checkout and monitoring mobile: 390 × 844 with no page-level horizontal overflow.
- Staff management access denial: passed.

Screenshots:

- `verification/artifacts/opera-checkout-rejected-mobile.png`
- `verification/artifacts/opera-order-confirmed-mobile.png`
- `verification/artifacts/opera-monitoring-desktop.png`
- `verification/artifacts/opera-monitoring-mobile.png`

## Existing dataset preservation

Before and after schema migration:

- Users: 4.
- Outlets: 4.
- Orders: 6.
- Transactions: 6.
- Overrides: 1.
- Audit events: 12.
- Wallet entries: 3.
- Deposits: 1.

The migration comparison above was captured immediately before and after schema application. During later verification, the live app received one separate ordinary `demo` checkout (`LL-MV9R7M12-KUIW`, customer “dara”) through concurrent use. It was preserved. The current live database therefore has 7 Orders, 7 Transactions and 13 AuditEvents, while still containing zero OPERA attempts or Phase 5 test identifiers. All Phase 5 scenario data was confined to `/tmp/lakowe-opera-phase5a.db`, which was removed after testing.

## Validation

- `npx prisma validate`: passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with five pre-existing dining image warnings and no Phase 5A warnings.
- `npm run build`: passed with all Phase 5A pages and APIs in the route table.
- Live development monitoring endpoint after Prisma-client restart: HTTP 200.

## Requirements for eventual authorized OPERA integration

- Confirm the deployed OPERA edition and obtain the corresponding current Oracle Hospitality integration documentation.
- Use an authorized non-production environment before UAT or production.
- Obtain property identifiers, OAuth/client configuration and secrets through an approved secrets manager.
- Map POS outlets, tender types, revenue/transaction codes, currencies, business dates and folio windows with hotel finance.
- Verify the edition-specific guest/stay lookup, charge-permission, posting, idempotency and posting-retrieval contracts.
- Define timeout semantics, retry safety, reconciliation ownership and duplicate-detection guarantees.
- Add network controls, TLS validation, credential rotation, access logging, privacy retention and operational alerting.
- Complete security, finance, hotel operations and data-protection sign-off.

No Oracle environment, credential or external transaction was used. Sage 200 simulation was not started.
