# Phase 4B user auditing and supervisor reports

Verified on 2026-10-15 against the existing Prisma SQLite records and an isolated database copy.

## Routes

- `/management/audit`
- `/management/overrides`
- `/api/management/audit`
- `/api/management/overrides`

The management sidebar now contains Overview, Audit Logs and Supervisor Overrides with active-route styling.

## Recorded and derived audit fields

`AuditEvent` records actor ID, actor role, action, entity type/ID, optional before/after JSON, optional request ID and timestamp. Reports resolve display names from `DemoUser` and derive order, transaction, override and outlet links from persisted related records.

The database does not record IP address, device, session, assigned supervisor, general event metadata or an outlet directly on `AuditEvent`. Those fields display as Unavailable. Before/after sections also display Unavailable when the original event did not store them. A void request has no recorded proposed monetary value.

## Filters and pagination

Audit filters: inclusive UTC start/end date, employee, exact action type, outlet and transaction/order/override reference. Override filters: inclusive UTC start/end date, requesting employee, status, requested action, outlet and request/transaction/order reference.

All filters and pagination execute server-side. Dates are validated calendar dates, ranges cannot exceed 366 days, references are limited to 100 characters, page size is 1–100 and invalid option values return HTTP 400. Results use stable `createdAt desc, id desc` ordering. The audit UI requests 8 rows per page; the persisted 12 events render as 8 + 4.

## Persisted results

- 12 audit events.
- 6 orders, each with an `order.created` or `wallet.purchase` creation audit.
- 3 `order.status_changed` events, all identifying Ade Adebayo / staff and retaining before/after values.
- 4 total events by Ade Adebayo.
- 9 events resolve to The Clubhouse.
- Searching `TXN-MV8GM240-XXSC` or `LL-MV8GM23U-DG4H` returns the 6-event related chain.
- One override: `OVR-MV8GM2AP-JRKC`, a rejected discount requested by Ade Adebayo and rejected by Kemi Okafor.
- Its transaction remains `settled`, `adjustmentJson` remains null, and no `transaction.adjusted` event exists for the rejected request.
- Its report chain contains one request audit, one decision audit and zero adjustment audits.
- No duplicate adjustment request IDs exist.

## Isolated approved-adjustment test

The existing database was copied to `/tmp`. The existing request and approval writers were used against the copy:

- Ade requested a 50,000-kobo discount on `TXN-MV8GM2EH-4EHI`.
- Kemi approved it once.
- The transaction became `discounted` and the proposed net amount was 300,000 kobo.
- The chain contained exactly `override.requested`, `transaction.adjusted`, and `override.approved`.
- Integrity counts were request 1, decision 1, adjustment 1.
- A duplicate approval attempt returned HTTP 400 and created no second successful adjustment.
- The persisted rejected request remained unchanged.
- The source database SHA-256 remained `759ef54469db0c021c147774d33b3e7cdbd6c533aff338c0e309016de0daa975`.
- The temporary database was removed.

## Authorization and endpoint safety

- Missing management identity: HTTP 401.
- Ordinary staff identity: HTTP 403 on both endpoints and both pages.
- Persisted supervisor identity: HTTP 200.
- POST, PUT, PATCH and DELETE return HTTP 405 on both reporting endpoints.

Demo identity remains local demonstration access and is not production authentication.

## Browser verification

- Audit and override pages loaded in system Chrome with browser sandboxing enabled.
- Employee, action, outlet, reference and date filters produced the persisted counts listed above.
- Pagination moved from 8 events on page 1 to 4 events on page 2.
- The override-to-audit link loaded the two persisted events for the rejected request.
- Desktop viewport: 1440 × 1000.
- Mobile viewport: 390 × 844 with no page-level horizontal overflow.
- No unexpected local request failures.

Screenshots:

- `verification/artifacts/management-audit-desktop.png`
- `verification/artifacts/management-audit-mobile.png`
- `verification/artifacts/management-overrides-desktop.png`
- `verification/artifacts/management-overrides-mobile.png`

## Validation

- `npx prisma validate`: passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with five pre-existing `next/no-img-element` warnings in dining pages and no management warnings.
- `npm run build`: passed with all Phase 4B pages and APIs in the production route table.

No audit-writing or transaction-adjustment business logic was changed. The only correction discovered during browser review was in the new read-only reporting resolver: order-linked events now expose their already persisted transaction ID.
