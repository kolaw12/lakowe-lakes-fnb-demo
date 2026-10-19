# Clubhouse-only demo verification

## Configuration
`lib/clubhouse-config.ts` sets `CLUBHOUSE_ONLY = true` and `ACTIVE_OUTLET_ID = "clubhouse"`. Changing that flag restores the reusable multi-outlet path without deleting outlets or records.

## Implemented scope
- Guest dining home shows The Clubhouse only.
- Guest menu always loads Clubhouse items. Old outlet URLs show a clear Clubhouse-only message.
- Standard, wallet, and OPERA simulated checkouts reject non-Clubhouse outlet IDs on the server.
- Staff cannot advance historical non-Clubhouse orders; they remain available as read-only records.
- Menu availability and new menu-item actions reject non-Clubhouse outlets on the server.
- The main management report defaults to Clubhouse when no outlet filter is supplied.

## Historical and financial preservation
No records, balances, ledger entries, QR credentials, orders, transactions, outlets, or staff assignments were deleted or rewritten. Existing OPERA and Sage simulations remain unchanged. OPERA remains explicitly simulated; no compatibility with OPERA PMS 5.6.15.0 is claimed. Future individual-transaction and daily-sales reporting integration remains subject to technical confirmation.

## Validation
- `npx tsc --noEmit` passed.
- `npx prisma validate`, `npm run lint`, and `npm run build` are required before deployment.

## Limitation
The guest-facing menu currently renders the built-in Clubhouse catalog. Newly added staff menu records are retained in operations management; exposing those new records in the guest ordering catalog requires the existing catalog to be made database-backed, which is outside this configuration-only scope.
