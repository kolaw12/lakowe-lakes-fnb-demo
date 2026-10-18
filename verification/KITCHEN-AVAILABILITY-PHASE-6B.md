# Phase 6B verification

## Delivered routes

- `/staff/kitchen` is an outlet-scoped kitchen queue with Received, Preparing, and Ready columns. It polls safely every five seconds and uses the existing order-status endpoint, so it cannot complete an order.
- `/staff/menu` lets an assigned staff member or supervisor change outlet-specific item availability.
- `/api/menu-availability` provides public read-only availability for guest menu presentation and server-protected staff mutations.

## Server-side behavior

`MenuAvailability` is an additive SQLite model keyed by outlet and catalog item. An absent record means available. Availability is checked before normal demo checkout, wallet checkout, and simulated OPERA checkout. Confirmed historical order items retain their saved name, price, modifiers, quantity, and totals.

Availability changes require the Phase 6A HttpOnly `lakowe-demo-staff-id` session, reject a mismatched request-body actor, and require the actor to be assigned to the outlet. Each state change writes `menu.availability_changed` with actor and before/after data to `AuditEvent`.

## Isolated verification results

An isolated copy of `prisma/dev.db` was used on port 3111. Test records were never written to the live database.

| Check | Result |
| --- | --- |
| Guest Clubhouse order appears in Kitchen | Passed: `LL-MVAC35DX-SGOP`, Received then Ready |
| No staff session status update | Passed: HTTP 401 |
| Client actor spoofing | Passed: HTTP 403 |
| Received → Preparing → Ready | Passed: HTTP 200 for each |
| Duplicate Ready transition | Passed: HTTP 409 |
| Unassigned Revivo availability mutation by Clubhouse staff | Passed: HTTP 403 |
| Mark Malt & Ginger Cooler Sold Out | Passed: HTTP 200 |
| New guest checkout with sold-out Malt | Passed: HTTP 400 with specific removal guidance |
| Restore item and checkout | Passed: HTTP 200 |
| Availability audit events | Passed: two events, actor `staff-ade` |
| Kitchen audit chain | Passed: `order.created`, two `order.status_changed` events |
| Financial side effects | Passed: two isolated orders each retained exactly one transaction; no extra wallet, OPERA, or Sage records |
| Mobile layout | Passed: Kitchen and Menu availability pages at 390px had no horizontal overflow |

Browser evidence:

- `artifacts/phase6b-kitchen-mobile.png`
- `artifacts/phase6b-menu-mobile.png`
- `artifacts/phase6b-guest-sold-out.png`

## Validation

- `npx prisma validate` — passed
- `npx tsc --noEmit` — passed
- `npm run lint` — passed with five existing `no-img-element` warnings in dining UI files; no new lint errors or availability-related warnings
- `npm run build` — passed

## Limitations

The staff identity selector remains a fictional demo mechanism. The server verifies the resulting HttpOnly session and outlet assignment, but it is not production authentication. Preparation notes are not separately represented in the current order schema; recorded modifier selections are shown in Kitchen.
