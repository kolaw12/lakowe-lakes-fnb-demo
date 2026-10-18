# Phase 6A order control and role separation

Verified on 2026-10-16 using an isolated SQLite copy for all fulfillment transitions.

## Routes and files

- Updated `/dining/orders/[reference]`: customer/golfer tracking only.
- Updated `/staff/orders/[reference]`: retained staff fulfillment actions.
- Updated `POST /api/demo`: derives mutating actors from a server-issued demo cookie.
- Added `/api/demo/session`: creates, reads, and clears the demo session cookie.
- Updated `lib/demo-db.ts`: explicit authorization and invalid-transition errors.
- Updated `components/fnb/FnbProvider.tsx`: removed local guest status mutation.
- Updated staff login and sign-out to create and clear the server session.

## Before and after

Before, the guest tracking page exposed a client-only status selector that could alter local state, while the mutation API accepted a body-supplied actor ID.

After, the guest page displays fulfillment progress and a staff-update message only. It contains no status select, status action button, or provider mutation function. Staff status actions pass through the server session and existing outlet/transition rules.

## Authorization and transition results

- Direct no-cookie status update: HTTP 401.
- Body actor mismatch with issued staff cookie: HTTP 403.
- Staff without the Clubhouse outlet assignment: HTTP 403.
- Invalid skipped transition: HTTP 409.
- Duplicate transition: HTTP 409.
- Valid staff progression: Received → Preparing → Ready → Completed.
- After session deletion, mutation attempt: HTTP 401.

The session cookie is HttpOnly, SameSite=Lax and server-issued after the existing demo identity selection. It prevents unauthenticated or body-spoofed direct requests. Selecting a demo profile remains intentionally non-production authentication and is not a substitute for real login, password, SSO, MFA, server session storage, or authorization policy management.

## Audit and guest visibility

Each valid transition created one existing `order.status_changed` audit record with:

- Actor: `staff-ade`
- Role: `staff`
- Previous status
- New status
- Timestamp

The snapshot returns audit events newest first. All three expected transitions were present. The guest order page showed Completed after refresh using the existing provider snapshot/sync mechanism. No realtime infrastructure was added.

## Financial and integration regression

For the two isolated Phase 6A test orders:

- Transactions: 2, unchanged by fulfillment updates.
- Wallet ledger entries: unchanged.
- OPERA attempts: 0.
- Sage records: 0.
- Status-change audits: 3.
- Eligible sales before and after transitions: 14,220,000 kobo.

No duplicate sale, wallet debit, OPERA charge, Sage record, or other financial side effect was created.

## Browser verification

- Guest mobile tracking page: no fulfillment controls.
- Staff desktop page: valid progression completed through the staff UI after server-session login.
- Guest refresh: showed Completed after staff changes.
- Guest mobile viewport: 390 × 844 with no page-level horizontal overflow.

Screenshots:

- `verification/artifacts/phase6-guest-before-mobile.png`
- `verification/artifacts/phase6-staff-desktop.png`
- `verification/artifacts/phase6-guest-completed-mobile.png`

## Dataset preservation

Phase 6A orders existed only in `/tmp/lakowe-phase6a.db`, which was removed after testing. The live database has zero `PHASE6A-` orders. Existing live operational activity was preserved.

## Validation

- `npx prisma validate`: passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with five pre-existing dining image warnings and no Phase 6A warnings.
- `npm run build`: passed with `/api/demo/session` in the route table.

No kitchen display, refunds, or management exception monitoring was added.
