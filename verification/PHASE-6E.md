# Phase 6E end-to-end operational verification

Verified 2026-10-16 against an isolated production-server database copy at /tmp/lakowe-phase6e.db. The source database was never written: SHA-256 before/after was abe1a9811718effe22539157629fa17391007bf8f5cacbae30b249acb9bc390f.

## Environment

- Node: v20.20.2
- Next.js: 14.2.35
- Prisma / client: 6.19.3
- Database: SQLite
- Production server: Next production build on localhost

The Inner Circle and marketing projects were not accessed or changed.

## Repair made

Guest checkout parsed a failed API response twice, losing the server validation message. The second parse was removed; rejected checkout now preserves the returned error, including sold-out-item feedback.

## Passed current end-to-end checks

- Isolated demo deposit and wallet checkout.
- Guest demo checkout; generated order reference.
- Staff server-issued session and order transitions Received -> Preparing -> Ready -> Completed.
- Duplicate completed transition rejected with HTTP 409.
- Wallet refund request, supervisor approval, and second approval rejected with HTTP 409.
- Management exceptions: anonymous HTTP 401, ordinary staff HTTP 403, supervisor HTTP 200.
- Mobile (390x844), tablet (768x1024), and desktop (1440x1000) guest/management navigation loaded without page-level horizontal overflow.
- Live database checksum preserved.
- Prisma validate, TypeScript, lint, and production build passed.

## Regression coverage carried forward

Phase 5A verified OPERA successful, rejected, unavailable and uncertain/reconciled simulated postings, idempotency and restart persistence in isolated data. Phase 5B verified Sage preparation/submission/reconciliation scenarios, financial non-mutation and restart persistence. Phase 6C verified rejected/self/concurrent refunds, Sage reversal-required state, staff/supervisor browser interactions, wallet history and management reconciliation. Phase 6D verified persisted exception categories, filters, pagination, read-only semantics and mobile rendering.

## Financial reconciliation

For the isolated Phase 6E exercise:
- Wallet deposit: 5,000,000 kobo.
- Wallet purchase: 350,000 kobo debit.
- Approved wallet refund: 350,000 kobo credit.
- Net wallet movement from the purchase/refund pair: 0 kobo.
- The refunded transaction is not eligible revenue after refund approval.
- Fulfillment-only status updates created no wallet ledger entries.

POS sales are transaction recognition; wallet deposits/debits/refunds are wallet movements; Sage records are simulated accounting events and are not a second sales source; confirmed OPERA charges become POS transactions once.

## Known limitations and UX backlog

- Demo identity selection is not production authentication, authorization, SSO, MFA or session management.
- OPERA and Sage are explicit local simulations; no external system was contacted.
- Kitchen-delay exceptions remain unsupported because no documented SLA threshold exists.
- Existing lint warnings: five next/no-img-element warnings in dining pages.
- Later redesign candidates: denser filter layout on small screens, unified status badge language, and richer empty/error-state illustrations. No redesign was implemented in this phase.

## Recommendation

The standalone functional demo is suitable to enter the planned UI/UX redesign, subject to retaining its explicit demo/authentication and integration limitations.
