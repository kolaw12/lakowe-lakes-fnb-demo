# Phase 7B — Secure QR Persistence and Server Verification Foundation

Verified on 2026-10-17 using `/tmp/lakowe-phase7b.db`. QR issuance from checkout, guest QR rendering, staff scanning UI, mandatory enforcement, and supervisor exception UI remain inactive.

## 1. Files created and modified

Modified:

- `prisma/schema.prisma`

Created:

- `prisma/migrations/migration_lock.toml`
- `prisma/migrations/20261017000000_baseline/migration.sql`
- `prisma/migrations/20261017120000_order_verification/migration.sql`
- `lib/order-verification.ts`
- `app/api/staff/order-verification/preview/route.ts`
- `app/api/staff/order-verification/confirm/route.ts`
- `verification/phase7b.mjs`
- `verification/artifacts/phase7b-results.json`

No guest, staff, navigation, checkout, wallet, OPERA, Sage, reporting, or fulfillment UI was changed.

## 2. Schema and migration

`OrderVerification` provides:

- unique one-to-one Order binding;
- unique SHA-256 token hash and explicit token format version;
- `active`, `redeemed`, and `revoked` lifecycle state;
- 24-hour default expiry;
- redemption and revocation actor/timestamps/reason;
- safe handoff mode (`counter`, `table`, `room`, `golf_course`);
- indexes for lifecycle/expiry and mode.

`OrderHandoff` provides an immutable one-to-one completed handoff:

- unique Order and credential binding;
- staff actor/role, outlet, handoff mode, and completion time;
- optional safe metadata field, unused in Phase 7B;
- actor/outlet time indexes.

The repository previously had no migration history. A pre-7B baseline was generated from the inspected prior schema, followed by the additive 7B migration. The full chain was successfully deployed to a new empty rehearsal database and reports `Database schema is up to date`.

Historical orders were not backfilled. Live QR counts after migration are zero.

## 3. Token-security implementation

- Token format: `LLQ1.<base64url>`.
- Entropy: 32 cryptographically random bytes from Node `crypto.randomBytes` (256 bits).
- Persistence: SHA-256 hash only; raw tokens are never persisted, audited, logged, returned in snapshots, or exposed by preview/confirm.
- Format and supported-version validation occur before lookup.
- Raw token is returned only by server-only issue/reissue utilities for one-time delivery by a future Phase 7C caller.
- Default expiration is configurable through function input and otherwise 24 hours. Expiration never cancels an Order.
- Server-only revoke/reissue utilities exist without API/UI exposure and require a supervisor assigned to the Order outlet plus a reason.
- One credential per Order and unique hash are database-enforced.

## 4. Preview endpoint

`POST /api/staff/order-verification/preview`

- Requires the existing HttpOnly staff-session cookie.
- Resolves the authoritative persisted actor server-side.
- Accepts only `{ token }`; body actor/outlet spoofing fields are rejected.
- Validates token, version, lifecycle, expiry, actor role, outlet assignment, Order `ready` state, Transaction eligibility, pending refund/void controls, and confirmed OPERA state.
- Returns only order reference, outlet ID/name, handoff mode, fulfillment/payment states, amount, item names/quantities, expiry, and `canConfirm`.
- Does not return guest/room/wallet/posting data, raw token, or hash.
- Is read-only: no Order, audit, credential, handoff, wallet, or integration mutation.

## 5. Confirmation endpoint

`POST /api/staff/order-verification/confirm`

- Re-resolves the staff actor and rechecks every preview invariant.
- In one Prisma transaction, conditionally claims the active/unexpired credential, conditionally updates `ready → completed`, creates one unique OrderHandoff, and writes:
  - existing `order.status_changed` audit convention;
  - `order.handoff_completed` with the responsible staff actor.
- Unique constraints plus conditional updates enforce exactly-once handoff.
- Duplicate/replay returns HTTP 409.
- SQLite concurrency errors are distinguished from a completed competing claim; a redeemed winner returns business conflict, while an unresolved lock would return controlled HTTP 503 with no partial state.

## 6. Authorization and eligibility results

| Scenario | HTTP/result |
|---|---|
| Missing staff session | 401 |
| Malformed token | 400 `invalid_token` |
| Unknown well-formed token | 404 `not_found` |
| Wrong outlet | 403 `forbidden`, no order detail |
| Expired credential | 409 `expired` |
| Revoked credential | 409 `revoked` |
| Order not Ready | 409 `order_not_ready` |
| Refunded/voided Transaction | 409 `payment_reversed` |
| Pending refund/pending void | 409 `financial_review_pending` |
| Uncertain OPERA posting | 409 `opera_unconfirmed` |
| Valid discounted Transaction | 200 preview |
| Settled OPERA Transaction | 200 preview |
| Eligible settled Transaction | 200 preview and confirm |
| Replay | 409 `already_redeemed` |

## 7. Atomicity and concurrency evidence

- 100 generated tokens were unique and correctly formatted with 32 random bytes.
- 13 isolated credentials stored only 64-character SHA-256 hashes.
- A second credential for one Order failed with Prisma P2002.
- Preview changed no Order status, audit count, or handoff count.
- Successful confirm created exactly one handoff, redeemed exactly one credential, completed exactly one Ready Order, and created exactly one audit of each required action.
- Replay created no second handoff or audit and returned HTTP 409.
- Two concurrent confirmations produced one HTTP 200 and one HTTP 409—not a SQLite lock result—with one handoff and completed state. No partial redemption persisted.
- Redeemed state and immutable handoff survived production-server restart.

Machine-readable evidence: `verification/artifacts/phase7b-results.json`.

## 8. Audit and financial integrity

Confirmed handoff audits are attributed to the server-resolved staff actor (`staff-ade`). No raw token/hash is included.

Counts before and after preview/confirmation were identical:

```json
{"transactions":24,"ledger":7,"deposits":3,"opera":2,"sage":0}
```

QR preview/confirmation created no Transaction, WalletLedgerEntry, DepositRecord, OPERA attempt/post, Sage record, refund, or additional sale.

## 9. Legacy compatibility

- A Ready non-QR Order completed successfully through the existing protected `/api/demo` transition.
- Checkout does not issue credentials.
- Historical/live Orders have no credential.
- Existing service-completion actions remain enabled.
- Production live read returned the existing 10 Orders.
- Both QR endpoints returned 401 without a staff session.

## 10. Live database protection

Pre-migration live backup:

- `/tmp/lakowe-phase7b-live-before.db`
- SHA-256: `0f619741e2ba4926efe2546cfd09b842ab82929e1bc6695ae237e7a177a26aa5`

The additive migration was first tested on `/tmp/lakowe-phase7b.db`. Immediately before/after live migration, all application counts matched:

```json
{"users":4,"outlets":4,"orders":10,"transactions":10,"overrides":1,"refunds":0,"ledger":6,"audits":24,"opera":0,"sage":0}
```

Live `OrderVerification` and `OrderHandoff` counts are both zero. The post-migration checksum changed because additive tables and Prisma migration history were added; application records did not change.

Rollback while Phase 7B remains inactive: stop processes using the database and restore the exact backup. Alternatively, the unused additive tables may remain without affecting legacy flows. Do not drop tables after credential issuance begins without an approved data-retention migration.

## 11. Technical validation

- `npx prisma validate`: passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with four pre-existing dining `next/no-img-element` warnings.
- `npm run build`: passed with both new protected routes present.
- `prisma migrate deploy` from an empty SQLite database: baseline and 7B passed.
- Live `prisma migrate status`: schema up to date with two migrations.

## 12. Remaining limitations and Phase 7C readiness

- Demo identity selection remains non-production authentication.
- No checkout path calls `issueOrderVerification`; the foundation is intentionally dormant.
- No QR is rendered and no scanner/navigation exists.
- No supervisor reissue/revoke endpoint or UI exists.
- No mandatory QR enforcement exists.
- Rate limiting/security telemetry is not implemented; high-entropy tokens and staff authorization reduce brute-force feasibility, but production rollout needs endpoint rate limits and monitoring.
- `safeMetadataJson` is unused; any future writer must enforce a strict privacy-safe allowlist.
- Cross-device guest QR recovery still requires a separately approved guest-access capability or real authentication.

Assessment: **READY FOR PHASE 7C WITH POLICY LIMITATIONS**. Phase 7C may add dormant credential issuance and guest QR presentation only after approving handoff destination validation, pending-control policy, expiry/reissue operations, and guest access/recovery rules. Mandatory enforcement must remain deferred.
