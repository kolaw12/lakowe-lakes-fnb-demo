# Phase 7A — QR Order Verification Architecture Assessment

## Scope and conclusion

This is a read-only assessment of the standalone Lakowe Lakes F&B demo. No application code, Prisma schema, or records were changed.

Recommendation: implement one order-handoff verification capability shared by counter pickup, table delivery, hotel room delivery, and golf-course delivery. The QR must be a bearer capability containing an opaque, high-entropy token only. Scanning must open a staff-authenticated preview; an explicit second action must atomically redeem the credential and move an eligible order from `ready` to `completed` exactly once.

The QR must never create or retry a payment, wallet movement, refund, OPERA posting, or Sage record.

## 1. Existing architecture findings

### Orders and fulfillment

- `Order.reference` is unique but is a human-facing reference generated from time plus `Math.random`; it is not suitable as a security credential.
- `Order.status` is a string implementing `received → preparing → ready → completed` in `lib/demo-db.ts`.
- `updateOrder` is the only current completion service. It re-loads the server-side staff identity, enforces the actor's outlet assignment, validates the next state, updates the order, and creates an `order.status_changed` audit event in one Prisma transaction.
- Kitchen intentionally stops at `ready`; staff complete an order through the service queue/order-detail workflow.
- Guest tracking is read-only. `FnbProvider` refreshes `/api/demo` every five seconds and stores local cart/order state.

Safe integration point: the QR confirmation service should reuse the same transition policy and audit conventions as `updateOrder`, or extract the transition validation into one shared server-only helper. It must not introduce a second, weaker completion rule.

### Order creation paths

There are three confirmed order creators:

1. Demo checkout: `createOrder` in `lib/demo-db.ts` creates an Order, a settled `demo` Transaction, and an order-created audit event.
2. Wallet checkout: `walletCheckout` in `lib/wallet.ts` atomically decrements the wallet, creates the Order and settled `wallet_demo` Transaction, creates one purchase ledger entry using a unique idempotency key, and audits the purchase.
3. OPERA simulation: `finalizePosting` in `lib/opera-room-charge.ts` creates the Order and settled `opera_demo` Transaction only after confirmed posting or deterministic reconciliation. Failed, rejected, unavailable, and unresolved uncertain attempts have no eligible Order/Transaction pair.

Safe integration point: issue the QR credential inside the same Prisma transaction that creates each confirmed Order/Transaction. OPERA credentials must be created only in `finalizePosting`, never when an uncertain attempt is first recorded.

### Payments and financial controls

- Each Order has at most one Transaction through `Transaction.orderId @unique`.
- Normal eligible handoff candidates currently have settled demo, wallet, or OPERA transactions. A valid discounted transaction may also remain financially eligible under the documented reporting policy.
- Wallet checkout and refunds already rely on unique idempotency constraints and database transactions.
- Approved wallet refunds change the Transaction to `refunded`; approved voids change it to `voided`. These must invalidate handoff eligibility.
- Sage synchronization observes Transaction state. QR scanning must not prepare, submit, reverse, reconcile, or otherwise mutate Sage state.

### Authorization

- Staff mutations use the HttpOnly `lakowe-demo-staff-id` cookie. The API resolves the persisted DemoUser and ignores/spoof-protects a mismatched body actor.
- Outlet authorization is represented by JSON in `DemoUser.outletIds` and is enforced server-side for order transitions, refunds, and menu availability.
- Supervisor rules and self-approval protections exist independently for refunds/overrides and should remain unchanged.
- Management endpoints use a separate demo identity header. QR handoff is an operational staff action and should use the staff cookie, not the management header.

Production limitation: demo identity selection is not production authentication. A real deployment requires SSO/passwordless login, managed sessions, device policy, revocation, and appropriate assurance for handoff staff.

### Menu and outlet integrity

- Menu items have canonical outlet ownership in `lib/fnb.ts`.
- All checkout paths validate item/outlet relationships, canonical modifier choices, prices, and current persisted availability server-side.
- The handoff credential must bind to the persisted Order and its outlet. It must not accept an outlet from the QR or scanner body as authoritative.

## 2. Recommended QR security model

### Payload

Use an opaque versioned token, for example `LLQ1.<random-secret>`, encoded directly in the QR. Do not encode:

- order reference;
- guest name;
- room or table number;
- payment method, amount, wallet identifier, or posting reference;
- outlet, staff identity, or internal database IDs.

An opaque token is preferable to a public verification URL because camera scanning occurs inside the authenticated staff interface and a URL can leak through browser history, proxy logs, referrers, analytics, screenshots, or link preview services. If a URL is operationally required, use a same-origin HTTPS URL whose path carries only the opaque token, suppress referrers, avoid third-party resources, and immediately require staff authentication before any order detail is disclosed.

### Generation and storage

- Generate at least 256 bits using Node `crypto.randomBytes`, encoded base64url.
- Store only a SHA-256/HMAC hash of the secret, never the raw bearer token.
- Use constant-time comparison where direct comparisons occur.
- The raw token is returned once with the successful checkout response and retained in the guest's local order record for QR re-display on that device.
- Never return token hashes from snapshots, reports, audit APIs, or management endpoints.
- Never log the raw token. Use a credential ID or short non-secret fingerprint for support/audit correlation.

The current guest snapshot exposes all demo orders and is not a production guest authorization model. Phase 7 must not treat an order reference as permission to retrieve/reissue a QR. Durable cross-device QR recovery requires a separate guest order-access capability or real authenticated account, which is an explicit open decision.

### Proposed persistence

Add a one-to-one credential and handoff record rather than placing mutable verification fields directly on Order:

```prisma
model OrderVerification {
  id              String   @id @default(cuid())
  orderId         String   @unique
  order           Order    @relation(fields: [orderId], references: [id])
  tokenHash       String   @unique
  tokenVersion    Int      @default(1)
  handoffMode     String
  destinationHint String?
  status          String   @default("active")
  expiresAt       DateTime
  revokedAt       DateTime?
  revokedReason   String?
  redeemedAt      DateTime?
  redeemedBy      String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([status, expiresAt])
}
```

`handoffMode` is one of `counter`, `table`, `room`, or `golf_course`. It changes presentation and handoff instructions, not verification security or completion semantics. `destinationHint` must be minimal and safe for staff display (for example `Table 12`, masked room, or predefined course zone); it must not appear in the QR.

For stronger reporting/history separation, add an immutable `OrderHandoff` record keyed uniquely by `orderId`, containing verification ID, actor, outlet, mode, completion timestamp, and safe metadata. Otherwise the redeemed fields plus `AuditEvent` can provide the initial demo record. Finance/security should decide retention requirements before migration.

### Expiry and revocation

- Default expiry: local business-day close or 24 hours after order creation, whichever is earlier. This needs operations approval.
- A credential becomes unusable when expired, redeemed, or revoked.
- Revoke when a transaction is voided/refunded, an order is cancelled if cancellation is added, an order is administratively replaced, or a credential is rotated.
- A pending refund or pending void request should conservatively block handoff until resolved; this policy requires operations/finance approval.
- Expired credentials require authorized manual handoff review or supervisor reissue, not client-side clock extension.

### Replay, duplicate, and concurrency protection

The confirmation must execute in one database transaction:

1. Hash the submitted token and load the credential, Order, Transaction, refund/override state, and actor.
2. Recheck actor role and outlet assignment.
3. Recheck credential active/not expired/not revoked.
4. Recheck Order is exactly `ready`.
5. Recheck Transaction is eligible and not voided/refunded/unsettled.
6. Atomically claim the credential with an update constrained to `status = active` and `redeemedAt = null`; require affected-row count 1.
7. Atomically change Order from `ready` to `completed`; require affected-row count 1.
8. Persist handoff/audit records.

Any failure rolls back the entire transaction. Concurrent confirmations therefore produce one success and one HTTP 409 with no duplicate completion/audit event.

## 3. End-to-end operational workflow

1. Guest selects one handoff mode during checkout. The same mode model serves counter, table, room, and golf-course delivery.
2. Server validates the canonical basket, destination fields, menu availability, and payment as it does today.
3. In the confirmed Order/Transaction creation transaction, the server creates one active OrderVerification credential.
4. Checkout returns the raw token once. Guest local state stores it beside that order and renders a QR on confirmation/tracking.
5. Kitchen progresses `received → preparing → ready`; QR confirmation is unavailable before Ready.
6. Authorized outlet staff opens Scan handoff from Queue or the staff overflow/More menu, grants camera permission, and scans the opaque token.
7. `POST /api/staff/order-verification/preview` validates the token and authorization without mutation.
8. Staff sees a preview: order reference, outlet, handoff mode/destination hint, item count, payment/fulfillment status, and any blocking condition. No sensitive OPERA or wallet data is exposed.
9. Staff physically checks the handoff context and chooses Confirm pickup/delivery.
10. `POST /api/staff/order-verification/confirm` rechecks every invariant and atomically redeems plus completes.
11. UI shows a success state with green check, order reference, handoff type, staff actor, and completion time.
12. Any repeat scan shows Already completed and never mutates financial or fulfillment data again.

## 4. Eligibility and decision rules

An order is eligible only when all are true:

- persisted credential is active and unexpired;
- persisted Order is `ready`;
- persisted Order outlet is in the actor's assignments;
- persisted Transaction exists and is eligible (`settled`, or a valid approved discounted state under existing policy);
- there is no approved refund, void, unresolved payment, or unsafe integration state;
- OPERA-backed orders already have a confirmed linked settled Transaction;
- the credential is bound to that exact Order.

Behavior by condition:

| Condition | Result | Staff guidance |
|---|---|---|
| Received/preparing | Reject 409 | Wait for Kitchen Ready. |
| Ready and eligible | Preview, then allow confirm | Explicit staff confirmation. |
| Completed/redeemed | Reject 409, safe completed summary | No second handoff. |
| Wrong outlet | Reject 403 | Use authorized outlet staff; do not disclose order details. |
| Missing/invalid token | Reject 404/400 generically | Rescan or use authorized fallback. |
| Expired/revoked | Reject 409 | Supervisor review/reissue if policy allows. |
| Refunded/voided | Reject 409 | Do not hand off; direct to supervisor. |
| Pending refund/void | Block pending policy decision | Resolve controlled request first. |
| OPERA rejected/unavailable/uncertain | No eligible Order credential | Management reconciliation; never hand off from attempt alone. |
| Discounted settled transaction | Allow if existing eligible-amount validator accepts it | Show final recorded amount. |

## 5. UX proposal

### Guest

- Confirmation/tracking: add a Handoff verification section only for confirmed eligible orders.
- Show QR, order reference, handoff label, expiry/help text, and a privacy note: the code contains no payment or personal details.
- Keep tracking read-only. Do not expose regenerate/revoke unless a safe authenticated guest capability exists.
- Hide or mark the QR unavailable after refund/void/revocation/completion.

### Staff

- Do not add a fifth bottom-navigation item. Add Scan handoff as a prominent Queue header action and inside the existing supervisor More/secondary navigation.
- New `/staff/verify` screen: camera scanner, permission explanation, manual-code fallback, preview, confirmation, success/failure.
- Camera denial: retain instructions plus manual entry. Do not claim scanning is impossible if manual fallback is authorized.
- Manual fallback must accept a high-entropy verification code, be server-authorized and rate-limited, and must not accept order reference alone.
- Dialog/preview must focus its heading, trap focus, close safely before mutation, and require explicit confirmation.

## 6. Edge-case matrix

| Edge case | Decision |
|---|---|
| Repeated scan | Show already completed/redeemed; no mutation. |
| Concurrent staff scans | One atomic winner; other receives 409. |
| Forwarded/screenshot QR | Bearer capability remains transferable; rely on Ready state, short validity, authorized staff, outlet binding, preview, and physical handoff checks. Document that QR proves possession, not guest identity. |
| Camera unavailable/denied | Manual high-entropy code entry; never order-reference-only completion. |
| Offline | Do not complete offline. Hold scanned value locally only long enough to retry after connection; server remains authoritative. |
| Stale UI | Confirmation endpoint rechecks all state; stale preview cannot authorize. |
| Wrong outlet | 403 without order details; audit/rate-limit repeated attempts. |
| Previously completed | 409 with safe completion summary. |
| Refund/void after issuance | Revoke/block on current persisted Transaction state even if explicit revocation hook failed. |
| OPERA uncertain/failed | No QR credential because no confirmed Order/Transaction exists. |
| Multiple guest orders | One unique credential per Order; preview must display reference/outlet/mode clearly. |
| Token brute force | 256-bit entropy, authenticated endpoint, rate limiting, generic errors, monitoring. |
| Token leakage | Never log raw token; no analytics/referrers/third-party QR generator. Render QR locally. |

## 7. Audit and financial safeguards

- Preview is read-only and creates no payment/ledger/accounting records. Consider security telemetry separate from business AuditEvent to avoid audit flooding.
- Successful confirm creates `order.handoff_completed` and the existing order status audit in the same transaction, attributed to the server-resolved staff actor.
- Failed/replayed/wrong-outlet attempts may create rate-limited security events without raw tokens.
- QR generation/revocation must not touch WalletAccount, WalletLedgerEntry, RefundRequest, OperaRoomChargeAttempt posting state, or SageAccountingSync.
- Completion must not imply a new sale. Reporting continues to derive sales from the existing Transaction only.
- Supervisor override/self-approval rules remain independent and unchanged.

## 8. Staged implementation roadmap

### Phase 7B — Persistence and server verification core

Existing files likely affected:

- `prisma/schema.prisma`
- `lib/demo-db.ts` (shared transition extraction/reuse only)
- `lib/audit-reporting.ts` (enrich handoff events if required)

Proposed new files:

- `prisma/migrations/<timestamp>_order_verification/migration.sql`
- `lib/order-verification.ts`
- `app/api/staff/order-verification/preview/route.ts`
- `app/api/staff/order-verification/confirm/route.ts`

Work:

- Add OrderVerification relation/indexes and optional OrderHandoff.
- Implement cryptographic generation/hash, expiry/revocation, staff-cookie authorization, outlet checks, eligibility policy, preview, and atomic confirm.
- Extract/reuse one fulfillment transition validator so QR and order detail cannot diverge.
- Add unit tests for token validation and integration tests for missing session, spoofing, wrong outlet, invalid state, replay, concurrent confirm, and audit attribution.

Migration risk: existing orders have no credential. Backfill none by default. Do not silently generate redeemable credentials for historical/completed/refunded orders. Rollback requires first disabling routes/UI, then removing new tables; existing Order/Transaction data remains unchanged.

### Phase 7C — Checkout issuance and guest QR

Existing files likely affected:

- `lib/demo-db.ts`
- `lib/wallet.ts`
- `lib/opera-room-charge.ts`
- `app/api/demo/route.ts`
- `app/api/wallet/route.ts`
- `app/api/opera/room-charge/route.ts`
- `components/fnb/FnbProvider.tsx`
- `app/dining/checkout/page.tsx`
- `app/dining/orders/[reference]/page.tsx`
- `lib/fnb.ts` for guest DTO/type additions

Proposed new files:

- `components/fnb/OrderVerificationQr.tsx`
- `lib/order-handoff.ts` if mode/destination validation is separated from token verification

Work:

- Add one normalized handoff-mode input and mode-specific destination validation.
- Issue credentials in all three confirmed creation transactions.
- Return raw token only to the successful guest checkout result and retain it device-locally.
- Render QR locally; add expiry, privacy, completion, and unavailable states.
- Verify demo, wallet, direct OPERA, and reconciled OPERA paths; rejected/uncertain OPERA must show no QR.

Risk: changing API DTOs can break local storage compatibility. Version stored guest order data and tolerate orders without credentials.

### Phase 7D — Staff scanner and handoff UX

Existing files likely affected:

- `components/staff/StaffShell.tsx`
- `app/staff/page.tsx`
- `app/staff/orders/[reference]/page.tsx`
- `app/staff/kitchen/page.tsx` for a link/handoff explanation only
- `components/ui/DesignSystem.tsx` if scanner feedback/dialog primitives need extension

Proposed new files:

- `app/staff/verify/page.tsx`
- `components/staff/QrScanner.tsx`
- `components/staff/VerificationPreview.tsx`
- `components/staff/VerificationResult.tsx`

Work:

- Camera permission states, local scanning, manual secure-token fallback, preview, confirmation, loading, success/error/replay states.
- Add Queue header and secondary-menu entry without crowding bottom navigation.
- Keyboard/focus/accessibility verification and responsive browser coverage.
- Do not add client-side completion shortcuts.

Risk: camera APIs require HTTPS/localhost and vary by browser. Provide feature detection and manual fallback; avoid a heavy scanner dependency until bundle/security review.

### Phase 7E — End-to-end security, operations, and rollout verification

- Isolated migrations and rollback rehearsal.
- Demo/wallet/OPERA checkout-to-handoff journeys.
- Cross-outlet, guest, missing-session, spoofed-actor, expired, revoked, refunded, voided, pending-control, duplicate, and concurrent confirmation tests.
- Restart persistence and audit/reporting reconciliation.
- Mobile/tablet/desktop, camera permission, keyboard, screen-reader, and no-overflow tests.
- Threat-model review, token/log inspection, rate-limit tests, and finance/operations sign-off.
- Confirm zero new Wallet, OPERA, Sage, or sales records are created by preview/confirm beyond the existing Order completion and audit effects.

## 9. Open decisions requiring approval

1. Which handoff modes are offered by each outlet, and what destination fields are operationally required?
2. Is a pending refund/void request a mandatory handoff block?
3. What is the business-day expiry and supervisor reissue policy?
4. Must guests retrieve QR codes across devices? If yes, what real guest authentication/capability model will authorize it?
5. Is a separate immutable OrderHandoff model required for compliance/reporting, or are credential redemption fields plus AuditEvent sufficient?
6. Which staff roles may confirm each handoff mode? Is supervisor approval required for expired/manual fallback?
7. What rate limits, retention periods, alerting thresholds, and device/browser support are required?
8. Should table/room/course destination data be stored on Order, OrderVerification, or a separate privacy-scoped fulfillment record?
9. What physical identity or possession check, if any, supplements a transferable QR screenshot?
10. What host/origin will be used if QR payloads are URLs, and can all environments guarantee HTTPS?

## Final assessment

The current system has strong reusable foundations: server-issued staff sessions, outlet authorization, a strict fulfillment state machine, transactional wallet/payment creation, OPERA confirmation-before-order creation, idempotency constraints, and audit events. The safe QR design is an opaque order-bound capability plus authenticated staff preview and atomic confirmation. It must remain a fulfillment control only.

Phase 7B should not begin until the open policy decisions—especially handoff data, expiry, pending-refund behavior, guest cross-device access, and staff fallback authority—are approved.
