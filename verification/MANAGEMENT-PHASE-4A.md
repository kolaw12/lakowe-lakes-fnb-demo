# Phase 4A management dashboard verification

Verified on 2026-10-15 against the persisted Prisma SQLite records and an isolated database copy.

## Routes

- `/management`
- `/api/management/report`

## Financial definitions

- Eligible sales use the POS `Transaction` as the single source. A linked wallet ledger debit is not counted again, and wallet deposits are never queried.
- `settled` transactions contribute their recorded integer-minor-unit amount once.
- `discounted` transactions contribute the original transaction amount minus the approved discount amount stored in `adjustmentJson`. Invalid discount data is excluded and surfaced as a data-quality warning.
- `voided` transactions contribute zero and are counted separately.
- Total orders count orders created in the selected period/outlet. Completed orders count the independent order service status; completion does not imply payment.
- Outlet, payment and daily trend totals use the same eligible-transaction set and reconcile to total eligible sales.
- Date filters are inclusive UTC calendar dates and are limited to 366 days.

## Persisted-record results

- Eligible sales: 11,820,000 kobo (₦118,200)
- Eligible POS transactions: 6
- Total orders: 6
- Completed orders: 1
- Voided transactions: 0
- The Clubhouse: 8,220,000 kobo (₦82,200)
- Winebar: 3,600,000 kobo (₦36,000)
- Demo checkout: 7,710,000 kobo (₦77,100)
- Golfer Wallet: 4,110,000 kobo (₦41,100)
- Outlet and payment totals both reconcile to 11,820,000 kobo.
- The ₦200,000 wallet deposit is excluded. Wallet purchases are represented once by their POS transaction.

## Isolated adjustment test

The existing database was copied to `/tmp`. One 1,000,000-kobo void and one 2,000,000-kobo sale with a 500,000-kobo approved discount were added only to the copy.

- The void contributed 0.
- The discounted sale contributed 1,500,000 kobo.
- Eligible sales became 13,320,000 kobo across 7 eligible transactions.
- The void count became 1.
- Outlet and payment totals both reconciled to 13,320,000 kobo.
- Trend values were 11,820,000 kobo on 2026-10-14 and 1,500,000 kobo on 2026-10-15.
- The original database SHA-256 remained `759ef54469db0c021c147774d33b3e7cdbd6c533aff338c0e309016de0daa975`.
- The temporary database was removed after the test.

## Access and UI verification

- Missing identity: HTTP 401.
- Persisted staff identity: HTTP 403.
- Persisted supervisor identity: HTTP 200.
- Desktop viewport: 1440 × 1000, dashboard and all required sections visible.
- Mobile viewport: 390 × 844, no page-level horizontal overflow.
- Winebar filter displayed ₦36,000 and 2 transactions.
- End date 2026-10-13 displayed ₦0 and no transactions.
- Reset restored ₦118,200.
- Browser testing reported no unexpected local request failures.

Screenshots:

- `verification/artifacts/management-desktop.png`
- `verification/artifacts/management-mobile.png`

## Validation

- `npx prisma validate`: passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with five pre-existing `next/no-img-element` warnings in dining pages and no management warnings.
- `npm run build`: passed; both management routes are present in the production route table.

## Limitations

The schema does not record profit, cost of goods, expenses, taxes, inventory, covers or payment-provider settlement. Those metrics are labelled unsupported rather than inferred. Demo identity is supplied from local storage and revalidated against the persisted supervisor role by the API, but it is not production authentication.
