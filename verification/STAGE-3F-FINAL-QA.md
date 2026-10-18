# Stage 3F final quality assurance and client-demo readiness

## Environment
- Project: lakowe-lakes-fnb-demo.
- Live database SHA-256 before verification: 0f619741e2ba4926efe2546cfd09b842ab82929e1bc6695ae237e7a177a26aa5.
- Isolated test database: /tmp/lakowe-stage3e-b4.db.
- Browser: local Chrome through Playwright.
- Production build: Next 14.2.35; Node 20.20.2; Prisma 6.19.3.

## PASS / FAIL matrix
| Area | Result | Evidence |
|---|---|---|
| Guest outlet/menu/basket/checkout/tracking | PASS | Phase 6E and Stage 3B/B4 isolated browser evidence. |
| Wallet deposit, purchase, refund | PASS | Isolated Phase 6C, Phase 6E, and B4 fixtures. |
| Staff queue/kitchen/order state machine | PASS | Isolated order moved Received -> Preparing -> Ready; Kitchen cannot complete Ready directly. |
| Supervisor refund approve/reject/exactly once | PASS | B4 approvals and ledger evidence. |
| Self approval prevention | PASS | HTTP 403, unchanged balance, no decision audit event. |
| Overrides, reports, audit | PASS | Existing Phase 4 and B4 populated browser coverage. |
| OPERA simulation paths | PASS | Phase 5A isolated scenario report. |
| Sage simulation paths | PASS | Phase 5B and Phase 6C isolated scenario reports. |
| Authorization | PASS | Missing management identity 401; staff 403; supervisor 200. |
| Responsive screens | PASS with limitations | B4 matrix passed at inspected mobile/tablet/desktop routes. |
| Real vendor/payment connectivity | Unsupported by design | All integrations are local simulations. |

## Financial invariants
- Wallet purchase is exactly once by idempotency key.
- Approved wallet refund produces exactly one credit.
- Repeated refund approval returns HTTP 409 after decision.
- Rejected refund produces no credit.
- Self approval returns HTTP 403 and creates no approval audit event or credit.
- Wallet deposits are excluded from eligible sales.
- Refunded transactions are not eligible management revenue.
- Sage refund reversal-required state is carried by the simulated accounting workflow, not counted as a second sale.

## Security and access findings
- Demo sessions are server-issued and server-side role checks remain in force.
- Cross-outlet actions, body actor spoofing, guest protected actions, and self approval were verified in earlier isolated phases.
- Demo identity selection is not production authentication, MFA, SSO, or identity governance.
- No real OPERA, Sage, payment-provider, or bank credentials are used.

## Accessibility and visual findings
- Shared focus-visible outline, semantic text status labels, completed check icon, labelled controls, and responsive navigation were inspected.
- Remaining non-blocking warnings: four next/no-img-element warnings in dining pages.
- Full formal screen-reader audit and real assistive-technology certification were not performed.

## Client demonstration sequence
1. Open Dining, choose an outlet, add an item, and show basket.
2. Place a demo order, then show read-only order tracking and Refresh Status.
3. Show Wallet balance, simulated deposit disclosure, expenditure statement, and refund history.
4. Select staff demo identity; show Queue, Kitchen preparation, Ready handoff, and completion in Service Queue.
5. Show supervisor Approvals: confirmation dialog, approval/rejection, and self-approval denial.
6. Open Management Action Center, Exceptions, Reports, Audit, OPERA Demo, and Sage 200 Demo.
7. Explain that OPERA/Sage/payment functions are simulations and show reconciliation/exception controls.
8. Reconcile financial totals using wallet ledger and management report examples.

## Readiness assessment
READY WITH LIMITATIONS.

The standalone demo is suitable for a client demonstration provided the presenter explicitly states that authentication, payments, OPERA, and Sage are simulations. Do not describe the demo as a production deployment or real vendor integration.
