# LAKOWE LAKES F&B — COMPLETE THE REMAINING APPROVED DEMO WORK

Act as a senior full-stack engineer, security specialist, UI/UX designer, and QA engineer.

Project:
`/home/kolaw12/Documents/LLG/lakowe-lakes-fnb-demo`

## OBJECTIVE

Complete ALL remaining approved demo work in one coordinated implementation.

Do not divide the work into more approval phases or stop after individual features. Work through the implementation, resolve issues, run tests, and produce one final report.

Do not expand the scope beyond the requirements below.

## 1. REVIEW THE CURRENT IMPLEMENTATION

Read the existing Phase 7A, 7B, 7C reports and implementation, plus Stage 3F final QA.

Inspect the actual project before editing.

Preserve the completed ordering, wallet, refund, staff, kitchen, supervisor, reporting, audit, OPERA, and Sage functionality.

## 2. COMPLETE QR PURCHASE AND COLLECTION VERIFICATION

Finish the existing partially implemented QR architecture.

Every newly confirmed eligible order must receive:

- A unique human-readable order reference.
- A secure QR purchase/collection credential.
- A separate secure manually enterable collection code.

QR and manual collection code must belong to the same order and share the same exactly-once handoff outcome.

The human-readable order reference must not function as a collection secret.

Customers may share their QR or collection code with someone collecting food on their behalf.

Scanning verifies possession of a valid purchase credential, not the buyer's personal identity.

Staff must:

1. Scan QR or enter collection code.
2. Preview the order and payment/fulfillment eligibility.
3. Physically hand over the order.
4. Press Confirm Received.
5. See the order marked Completed/Received.

Prevent duplicate collection, replay, unauthorized outlet access, and confirmation before the order is Ready.

Keep all financial effects separate from verification.

### Checkout integration

Complete QR credential issuance for:

- Standard demo checkout.
- Wallet checkout.
- Successfully confirmed OPERA room charge.

Handle failed, rejected, and uncertain OPERA transactions safely.

Never expose bearer credentials through management reconciliation, public order references, broad order snapshots, audit logs, or reporting.

Preserve exactly-once wallet debits and settled transaction creation.

Provide clear safe states when the guest cannot recover a credential.

Implement appropriate order handoff modes and destination validation without inventing new operational capabilities.

### Staff experience

Provide a responsive Scan QR / Enter Code interface accessible through the existing staff workflow.

Include camera permission handling and fallback manual entry.

Implement the approved audited supervisor exception process for genuinely unavailable credentials.

Normal completion of newly QR-enabled orders must require verified handoff or an authorized supervisor exception.

Preserve historical non-QR order behavior.

Do not activate mandatory enforcement until the new end-to-end flows pass isolated tests.

## 3. SIMPLIFY ALL USER-FACING LANGUAGE

Audit guest, staff, and management interfaces.

Use plain, everyday English.

Examples:

- Wallet ledger → Wallet history
- Purchase → Order paid, where accurate
- Deposit → Money added
- Posted → Paid / Added / Refunded, depending on the transaction
- Fulfillment → Order progress
- Audit log → Activity log
- Reconciliation → Match records, with technical details still available to managers
- Eligible → Allowed
- Pending → Waiting, where appropriate

Do not blindly replace database statuses or business terms in code.

Preserve precise financial meaning. In particular:
- Paid is not necessarily Completed.
- Refunded is not Paid.
- A pending payment must not be labelled successful.
- OPERA charges should not be presented as cash or card payments.
- A recorded deposit is not necessarily a real-money transfer.

Keep necessary technical terminology in internal services and detailed administrative records.

## 4. TYPOGRAPHY AND VISUAL POLISH

Use the existing Modern Minimal Luxury design system.

- Reduce oversized or excessive bold text.
- Use clear, consistent font sizes.
- Keep important amounts and page headings prominent.
- Make transaction descriptions readable on mobile.
- Maintain accessible contrast and appropriate touch targets.
- Avoid overlapping controls or page-level horizontal overflow.
- Keep wording short and understandable.

Inspect actual mobile, tablet, and desktop screens rather than changing CSS blindly.

## 5. DO NOT ADD UNAPPROVED FEATURES

Do not implement:

- Reorder My Usual
- Table QR ordering
- Kitchen delay alerts
- Smart preparation estimates
- WhatsApp/SMS integration
- Group tabs or split bills
- New loyalty features
- New golfer-specific capabilities
- Additional management intelligence dashboards
- Live card payment gateways
- Other unrelated functionality

These remain future contract enhancements.

## 6. FINANCIAL, SECURITY, AND DATABASE SAFETY

Use isolated SQLite test databases for destructive or state-changing verification.

Back up and preserve the live database.

Do not reset or delete historical records.

Maintain existing:

- Authorization and outlet restrictions
- Financial calculations
- Wallet balances and refunds
- OPERA/Sage simulation behavior
- Transaction idempotency
- Audit attribution
- Supervisor self-approval restrictions

Use database transactions and uniqueness constraints for exactly-once QR handoff.

Avoid storing raw QR tokens or collection secrets in the database.

Ensure the manually entered collection code has adequate security protections, including rate limiting and protection against guessing.

Do not log sensitive credentials.

## 7. COMPLETE END-TO-END VERIFICATION

Test with populated isolated data:

- Standard checkout and QR issuance
- Wallet checkout and exactly-once debit
- OPERA confirmed, rejected, uncertain and reconciled states
- QR scanning and successful handoff
- Manual code verification and successful handoff
- Duplicate scans and repeated code attempts
- Concurrent verification attempts
- Supervisor exception
- Cross-outlet rejection
- Missing session
- Refunded/voided/pending-control orders
- Guest tracking and credential persistence
- Historical non-QR orders
- Refund integrity and audit attribution
- Management reporting consistency
- Desktop, tablet and mobile layouts
- Camera unavailable and manual fallback

Verify that scanning and completing an order never creates a new payment, wallet entry, OPERA charge, Sage record, or additional sale.

Run:

- `npx prisma validate`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

Run actual browser tests, not just build checks.

## 8. FINAL REPORT

Create:

`verification/FINAL-DEMO-COMPLETION.md`

Include:

- All files changed
- Features completed
- Plain-language and typography improvements
- QR and collection-code workflow
- Browser screenshots
- Functional and security test matrix
- Financial-integrity verification
- Database migration and preservation evidence
- Unresolved issues
- Final readiness decision: READY / READY WITH LIMITATIONS / NOT READY

If a genuine blocker arises, report it clearly instead of pretending the feature is complete.

Do not introduce unrelated enhancements or move into additional development phases.

The goal is one stable, professional Lakowe Lakes F&B demo ready for a controlled client presentation.