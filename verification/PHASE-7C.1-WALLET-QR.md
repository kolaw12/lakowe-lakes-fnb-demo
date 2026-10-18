# Phase 7C.1 — Wallet Checkout QR Issuance and Financial Integrity

## Scope

This is a wallet-only continuation of Phase 7C. It does not implement OPERA issuance, staff scanning, QR enforcement, or a new handoff UI.

## Files changed

- `prisma/schema.prisma`
- `prisma/migrations/20261017180000_order_fulfillment/migration.sql`
- `lib/order-fulfillment.ts`
- `lib/wallet.ts`
- `app/dining/checkout/page.tsx`
- `components/fnb/OrderVerificationQr.tsx`
- `app/dining/orders/[reference]/page.tsx`
- `lib/fnb.ts`

## Isolated test database

Wallet tests ran against `/tmp/lakowe-phase7c-wallet-rerun.db`, copied from the migrated live database. The live migration was backed up to `/tmp/lakowe-phase7c-live-before.db` before additive `OrderFulfillment` DDL was applied.

## Handoff mode and fulfillment storage

`OrderFulfillment` is separate from `OrderVerification` and stores only:

- unique order binding;
- checkout idempotency key;
- normalized handoff mode;
- minimal destination hint.

Wallet checkout defaults to counter pickup when no handoff selection is supplied. Supported validation is outlet-aware. Detailed destination data is not stored in the credential.

## Wallet issuance behavior

For a new successful wallet checkout, one Prisma transaction now creates:

1. the existing Order;
2. the existing settled wallet Transaction;
3. one active OrderVerification credential with a SHA-256 token hash;
4. one OrderFulfillment row;
5. one existing negative wallet purchase ledger entry;
6. the existing wallet purchase audit event.

The raw token is returned only in the first successful checkout response. The checkout client stores it under versioned guest order data for the originating browser. Broad snapshots, statements, wallet responses, and management report responses do not expose raw tokens or hashes.

On a repeated wallet idempotency key, the existing order is returned with `credentialRecoveryUnavailable: true`; no raw token is reissued or recovered using the order reference. No duplicate debit, order, credential, fulfillment row, or audit is created.

## Isolated financial assertions

After the test deposit baseline, a successful checkout changed counts by exactly:

```json
{"orders":1,"tx":1,"ledger":1,"ver":1,"ful":1,"sage":0}
```

The successful token matched `LLQ1.<43 base64url characters>`. The duplicate returned the same order reference, omitted `verification`, and set safe recovery-unavailable state.

An intentionally unaffordable cart returned `Insufficient wallet balance.` with no new records. An outlet/item mismatch returned `Invalid wallet order.` with no new records.

Token and hash privacy checks passed across `/api/demo`, wallet statement output, wallet snapshot, and management report output.

## Migration safety

The 7C migration is additive. Existing order, transaction, ledger, audit, OPERA, and Sage records are unaffected. No fulfillment or credential rows were backfilled for historical orders. Live Prisma migration status reports three migrations up to date.

## Technical validation

- `npx prisma validate`: passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with four pre-existing dining `next/no-img-element` warnings.
- `npm run build`: passed.

## Remaining Phase 7C work

- Standard checkout needs end-to-end browser/idempotency coverage and safe client handoff selection UI.
- Direct confirmed OPERA issuance and reconciled-OPERA token recovery limitation are not implemented.
- Guest storage migration/cleanup needs a dedicated shared persistence utility.
- Guest QR display needs browser verification on successful wallet checkout and same-device reload.
- No staff scanner, mandatory QR enforcement, supervisor exception workflow, or Phase 7D/7E work has started.

Assessment: wallet issuance is **READY FOR FURTHER PHASE 7C INTEGRATION**, but the overall Phase 7C objective is not complete.
