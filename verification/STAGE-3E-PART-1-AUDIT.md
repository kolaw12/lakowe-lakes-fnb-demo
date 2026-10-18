# Stage 3E Part 1 visual and UX audit

## Scope and environment
- Project audited: lakowe-lakes-fnb-demo only.
- Isolated database copy: /tmp/lakowe-stage3e-audit.db.
- Live database SHA-256 before audit: b208deb02134c6929cec0fa349d6a66a749d6ef4d1620f961df6f4ad3439e999.
- No UI, CSS, component, API, database, financial, or operational changes were made during this audit.
- Browser route render: all listed guest, wallet, staff, and management routes were opened at 390px. Tablet route rendering started and no overflow was observed in the captured portion. Representative screenshots were captured.

## Route coverage matrix
| Area | Routes | Render result | Notes |
|---|---|---|---|
| Guest | dining, menu, item, cart, checkout, orders | Rendered at 390px | Checkout inspected in empty-basket state only. |
| Wallet | wallet, statements | Rendered at 390px | Statement initial/empty state inspected. |
| Staff | login, queue, kitchen, menu, transactions, approvals | Rendered at 390px | Supervisor local demo role used for navigation. |
| Management | action center, reports, audit, overrides, OPERA, Sage, exceptions | Rendered at 390px | Protected data rendered with isolated source. |
| Tablet/Desktop | Representative render attempts | Partially observed | Full populated-state visual review is required before claiming complete accessibility conformance. |

## Confirmed issue register

| ID | Severity | Routes | Observed behavior | Root cause / evidence | Recommended Part 2 correction |
|---|---|---|---|---|---|
| V-001 | High | Guest, wallet, staff, management | Redesigned and legacy styles coexist through broad visual overrides; outcomes depend on exact generated Tailwind class names. | app/globals.css Stage 3B, 3C, and 3D compatibility selectors use many exact legacy selectors and important declarations. | Replace compatibility layers route-by-route with semantic shared primitives and remove superseded legacy classes. |
| V-002 | High | item detail, checkout, orders, tracking, statements | Remaining guest screens retain forest/dark utility markup beneath the light shell, so visual consistency is fragile. | app/dining/menu/[itemId]/page.tsx, checkout, orders/[reference], and wallet/statements contain legacy dark surfaces and white text classes. | Refactor remaining guest markup to use ll-page, ll-panel, ll-input, ll-btn, ll-status, and ll-alert classes directly. |
| V-003 | High | staff transactions | The transaction table has a 730px minimum width and horizontal scrolling remains the primary mobile interaction. | app/staff/transactions/page.tsx contains min-w-[730px] and overflow-x-auto. | Introduce a mobile transaction-card presentation while retaining table semantics on desktop. |
| V-004 | High | staff approvals | Refund and override decisions remain visually mixed, and approve/reject actions have no confirmation layer. | app/staff/approvals/page.tsx renders both request types in one sequence and invokes direct decision handlers. | Group by request type and add a non-business-logic confirmation dialog before decision submission. |
| V-005 | Medium | management mobile navigation | Mobile management navigation exposes all grouped destinations simultaneously; it risks a long, dense header before content. | components/management/ManagementShell.tsx uses a grid of all navigation groups at small widths. | Add an accessible compact disclosure or menu trigger on mobile while preserving route links. |
| V-006 | Medium | staff mobile navigation | Staff navigation is horizontally scrollable; active destination context can be lost off-screen. | components/staff/StaffShell.tsx uses overflow-auto for the navigation row. | Use a compact menu or an explicitly labeled horizontal scroller with current-section affordance. |
| V-007 | Medium | guest order tracking | Tracking copy says the page updates when refreshed or synced, but the screen lacks an explicit refresh control or visible last-updated timestamp. | app/dining/orders/[reference]/page.tsx tracking text; FnbProvider polling is not visible to the user. | Add a safe manual refresh and last-updated disclosure; preserve read-only tracking. |
| V-008 | Medium | management reports, audit, OPERA, Sage | Dense technical cards/tables remain visually and cognitively heavy on mobile. | Existing pages retain large min-width tables and many small metadata labels. | Prioritize primary status, amount, reference, and next action; move technical detail into disclosure panels and mobile cards. |
| V-009 | Low | global typography | Several legacy page headings and metadata retain serif and tiny uppercase utility classes inconsistent with the Stage 3A interface type scale. | Legacy class patterns remain throughout app routes. | Replace page-specific type utilities with documented typography tokens. |
| V-010 | Low | guest dining | External image elements trigger existing next/no-img-element advisories and can affect LCP/bandwidth. | Four lint warnings in dining pages. | Evaluate Next Image or explicit image-size/loading strategy during a performance-focused correction. |
| V-011 | Investigation | mobile audit browser | One console error was recorded during the complete mobile route render, but its message was not retained by the test harness. | Browser audit output recorded console errors 1. | Re-run with console/network logging retained before classifying severity. |

## Accessibility findings
Confirmed:
- Global focus-visible outline exists in app/globals.css.
- Staff and management navigation have named navigation landmarks.
- Many controls have accessible labels and server/API error text remains exposed through alerts.
- Status labels are text-based; completed state has a check icon and readable label.

Requires further testing:
- Actual computed color contrast after all compatibility overrides.
- Keyboard-only order progression, approval, report-export, and disclosure flows.
- Screen-reader announcement sequence for loading, polling, and update states.
- Dialog behavior, because a confirmation dialog is not yet present for approval decisions.
- Table navigation and touch targets in dense reporting interfaces.

## Visual consistency assessment
The approved palette and shared primitives are established. The main weakness is not the token system; it is the incomplete migration from legacy forest/dark route markup. The broad compatibility selectors make the product look directionally lighter while leaving a brittle cascade and inconsistent component-level hierarchy.

Resolved since pre-redesign screens:
- Guest navigation uses a contextual basket and simplified primary destinations.
- Guest dining discovery, menu cards, basket, wallet balance, staff shell, work queue, and management shell now use the light navy/warm-white direction.
- Completed order status has a semantic green check-circle treatment.
- Management navigation is grouped by user task.

Unresolved:
- V-001 through V-011 above.
- Full populated-state, export, reconciliation, and keyboard audit remains needed.

## Prioritized Stage 3E Part 2 plan
1. Remove compatibility-selector dependence by migrating remaining guest and wallet markup to primitives.
2. Make staff transactions and management reporting responsive with mobile card alternatives.
3. Separate approval categories and add a confirmation interaction.
4. Improve management and staff mobile navigation disclosures.
5. Add tracking refresh/last-updated affordances.
6. Re-run contrast, keyboard, console/network, populated-state, and responsive audits.
