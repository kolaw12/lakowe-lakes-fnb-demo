import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditDb = Pick<PrismaClient, "auditEvent" | "demoUser" | "outlet" | "order" | "transaction" | "overrideRequest" | "walletLedgerEntry" | "operaRoomChargeAttempt" | "sageAccountingSync">;
export type AuditQueryInput = { from?: string | null; to?: string | null; employee?: string | null; supervisor?: string | null; action?: string | null; outlet?: string | null; reference?: string | null; status?: string | null; requestedAction?: string | null; page?: string | null; pageSize?: string | null };
type Option = { id: string; label: string; role?: string };

export class AuditReportInputError extends Error {}

export type AuditReport = {
  generatedAt: string;
  filters: { from: string | null; to: string | null; employee: string | null; action: string | null; outlet: string | null; reference: string | null };
  options: { employees: Option[]; actions: string[]; outlets: Option[] };
  summary: { total: number; orderStatusChanges: number; overrideRequests: number; actionCounts: Array<{ action: string; count: number }> };
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  events: Array<{
    id: string; timestamp: string; actorId: string; actorName: string; actorRole: string; action: string;
    entityType: string; entityId: string; requestId: string | null; outletId: string | null; outletName: string | null;
    orderReference: string | null; transactionId: string | null; overrideId: string | null;
    beforeValue: unknown; afterValue: unknown; eventDetails: Record<string, unknown> | null;
  }>;
  limitations: string[];
};

export type OverrideReport = {
  generatedAt: string;
  filters: { from: string | null; to: string | null; employee: string | null; supervisor: string | null; status: string | null; requestedAction: string | null; outlet: string | null; reference: string | null };
  options: { employees: Option[]; supervisors: Option[]; statuses: string[]; actions: string[]; outlets: Option[] };
  summary: { total: number; pending: number; approved: number; rejected: number };
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  overrides: Array<{
    id: string; transactionId: string; orderReference: string; outletId: string; outletName: string;
    requesterId: string; requesterName: string; requesterRole: string; requestedAction: string;
    originalAmount: number; proposedAmount: number | null; proposedNetAmount: number | null;
    requestReason: string; status: string; decidingSupervisorId: string | null; decidingSupervisorName: string | null;
    assignedSupervisorName: null; decisionReason: string | null; requestedAt: string; decidedAt: string | null;
    transactionStatus: string; appliedAdjustment: unknown; adjustmentAppliedFromThisRequest: boolean;
    relatedAuditEvents: Array<{ id: string; action: string; actorId: string; actorName: string; actorRole: string; timestamp: string; entityType: string; entityId: string; beforeValue: unknown; afterValue: unknown }>;
    integrity: { requestAuditCount: number; decisionAuditCount: number; adjustmentAuditCount: number; duplicateSuccessfulAdjustments: boolean };
  }>;
  limitations: string[];
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function text(value?: string | null) { return value?.trim() || null; }
function validDate(value: string) { return datePattern.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
function parseJson(value: string | null): unknown {
  if (!value) return null;
  try { return JSON.parse(value) as unknown; } catch { return { unavailable: "Stored JSON could not be parsed." }; }
}
function pageNumber(value: string | null | undefined, fallback: number, maximum: number, label: string) {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) throw new AuditReportInputError(`${label} must be a positive integer.`);
  const parsed = Number(value);
  if (parsed < 1 || parsed > maximum) throw new AuditReportInputError(`${label} must be between 1 and ${maximum}.`);
  return parsed;
}
function dates(input: AuditQueryInput) {
  const from = text(input.from), to = text(input.to);
  if ((from && !validDate(from)) || (to && !validDate(to))) throw new AuditReportInputError("Dates must use a valid YYYY-MM-DD calendar date.");
  if (from && to && from > to) throw new AuditReportInputError("End date cannot be before start date.");
  if (from && to && Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`) > 366 * 86400000) throw new AuditReportInputError("Date range cannot exceed 366 days.");
  return { from, to, range: from || to ? { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } : undefined };
}
function searchText(value?: string | null) {
  const result = text(value);
  if (result && result.length > 100) throw new AuditReportInputError("Reference search cannot exceed 100 characters.");
  return result;
}

async function commonOptions(db: AuditDb) {
  const [users, actorRows, actionRows, outlets] = await Promise.all([
    db.demoUser.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    db.auditEvent.findMany({ distinct: ["actorId"], select: { actorId: true, actorRole: true } }),
    db.auditEvent.findMany({ distinct: ["action"], select: { action: true } }),
    db.outlet.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const userMap = new Map(users.map(user => [user.id, user]));
  const employees = actorRows.map(row => ({ id: row.actorId, label: userMap.get(row.actorId)?.name || row.actorId, role: userMap.get(row.actorId)?.role || row.actorRole })).sort((a, b) => a.label.localeCompare(b.label));
  return { users, employees, actions: actionRows.map(row => row.action).sort(), outlets: outlets.map(outlet => ({ id: outlet.id, label: outlet.name })) };
}

function validateChoice(value: string | null, choices: string[], message: string) {
  if (value && !choices.includes(value)) throw new AuditReportInputError(message);
}

export async function getAuditReport(input: AuditQueryInput = {}, db: AuditDb = prisma): Promise<AuditReport> {
  const period = dates(input);
  const filters = { from: period.from, to: period.to, employee: text(input.employee), action: text(input.action), outlet: text(input.outlet), reference: searchText(input.reference) };
  const page = pageNumber(input.page, 1, 100000, "Page"), pageSize = pageNumber(input.pageSize, 20, 100, "Page size");
  const options = await commonOptions(db);
  validateChoice(filters.employee, options.employees.map(item => item.id), "Select a valid employee.");
  validateChoice(filters.action, options.actions, "Select a valid action type.");
  validateChoice(filters.outlet, options.outlets.map(item => item.id), "Select a valid outlet.");
  const and: Prisma.AuditEventWhereInput[] = [];
  if (period.range) and.push({ createdAt: period.range });
  if (filters.employee) and.push({ actorId: filters.employee });
  if (filters.action) and.push({ action: filters.action });

  if (filters.outlet) {
    const [orders, transactions, overrides, operaAttempts, sageSyncs] = await Promise.all([
      db.order.findMany({ where: { outletId: filters.outlet }, select: { reference: true } }),
      db.transaction.findMany({ where: { outletId: filters.outlet }, select: { id: true } }),
      db.overrideRequest.findMany({ where: { transaction: { outletId: filters.outlet } }, select: { id: true } }),
      db.operaRoomChargeAttempt.findMany({ where: { outletId: filters.outlet }, select: { id: true } }),
      db.sageAccountingSync.findMany({ where: { outletId: filters.outlet }, select: { id: true } }),
    ]);
    const orderReferences = orders.map(order => order.reference), transactionIds = transactions.map(transaction => transaction.id), overrideIds = overrides.map(item => item.id), operaAttemptIds = operaAttempts.map(item => item.id), sageSyncIds = sageSyncs.map(item => item.id);
    const ledgerIds = orderReferences.length ? (await db.walletLedgerEntry.findMany({ where: { orderReference: { in: orderReferences } }, select: { id: true } })).map(entry => entry.id) : [];
    and.push({ OR: [
      { entityType: "order", entityId: { in: orderReferences } },
      { entityType: "transaction", entityId: { in: transactionIds } },
      { entityType: "override", entityId: { in: overrideIds } },
      { requestId: { in: overrideIds } },
      { entityType: "walletLedger", entityId: { in: ledgerIds } },
      { entityType: "operaRoomCharge", entityId: { in: operaAttemptIds } },
      { entityType: "sageAccountingSync", entityId: { in: sageSyncIds } },
    ] });
  }

  if (filters.reference) {
    const [orders, transactions, directOverrides, operaAttempts, sageSyncs] = await Promise.all([
      db.order.findMany({ where: { reference: { contains: filters.reference } }, select: { reference: true } }),
      db.transaction.findMany({ where: { OR: [{ id: { contains: filters.reference } }, { order: { reference: { contains: filters.reference } } }] }, select: { id: true, order: { select: { reference: true } } } }),
      db.overrideRequest.findMany({ where: { OR: [{ id: { contains: filters.reference } }, { transactionId: { contains: filters.reference } }] }, select: { id: true, transactionId: true } }),
      db.operaRoomChargeAttempt.findMany({ where: { OR: [{ id: { contains: filters.reference } }, { orderReference: { contains: filters.reference } }, { postingReference: { contains: filters.reference } }, { transactionId: { contains: filters.reference } }] }, select: { id: true, orderReference: true, transactionId: true } }),
      db.sageAccountingSync.findMany({ where: { OR: [{ id: { contains: filters.reference } }, { sourceTransactionId: { contains: filters.reference } }, { sourceOrderReference: { contains: filters.reference } }, { postingReference: { contains: filters.reference } }] }, select: { id: true, sourceOrderReference: true, sourceTransactionId: true } }),
    ]);
    const transactionIds = Array.from(new Set([...transactions.map(item => item.id), ...directOverrides.map(item => item.transactionId), ...operaAttempts.map(item => item.transactionId).filter((item): item is string => Boolean(item)), ...sageSyncs.map(item => item.sourceTransactionId)]));
    const relatedOverrides = transactionIds.length ? await db.overrideRequest.findMany({ where: { transactionId: { in: transactionIds } }, select: { id: true } }) : [];
    const orderReferences = Array.from(new Set([...orders.map(item => item.reference), ...transactions.map(item => item.order.reference), ...operaAttempts.map(item => item.orderReference), ...sageSyncs.map(item => item.sourceOrderReference)]));
    const overrideIds = Array.from(new Set([...directOverrides.map(item => item.id), ...relatedOverrides.map(item => item.id)]));
    and.push({ OR: [
      { entityId: { contains: filters.reference } },
      { requestId: { contains: filters.reference } },
      { entityType: "order", entityId: { in: orderReferences } },
      { entityType: "transaction", entityId: { in: transactionIds } },
      { entityType: "override", entityId: { in: overrideIds } },
      { requestId: { in: overrideIds } },
      { entityType: "operaRoomCharge", entityId: { in: operaAttempts.map(item => item.id) } },
      { entityType: "sageAccountingSync", entityId: { in: sageSyncs.map(item => item.id) } },
    ] });
  }

  const where: Prisma.AuditEventWhereInput = and.length ? { AND: and } : {};
  const [totalItems, events, actionGroups] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    db.auditEvent.groupBy({ by: ["action"], where, _count: true }),
  ]);
  const overrideIds = Array.from(new Set(events.flatMap(event => [event.entityType === "override" ? event.entityId : null, event.requestId].filter((value): value is string => Boolean(value)))));
  const overrides = overrideIds.length ? await db.overrideRequest.findMany({ where: { id: { in: overrideIds } }, include: { transaction: { include: { outlet: true, order: true } } } }) : [];
  const operaAttemptIds = events.filter(event => event.entityType === "operaRoomCharge").map(event => event.entityId);
  const operaAttempts = operaAttemptIds.length ? await db.operaRoomChargeAttempt.findMany({ where: { id: { in: operaAttemptIds } } }) : [];
  const sageSyncIds = events.filter(event => event.entityType === "sageAccountingSync").map(event => event.entityId);
  const sageSyncs = sageSyncIds.length ? await db.sageAccountingSync.findMany({ where: { id: { in: sageSyncIds } } }) : [];
  const transactionIds = Array.from(new Set([...events.filter(event => event.entityType === "transaction").map(event => event.entityId), ...overrides.map(item => item.transactionId), ...operaAttempts.map(item => item.transactionId).filter((value): value is string => Boolean(value)), ...sageSyncs.map(item => item.sourceTransactionId)]));
  const transactions = transactionIds.length ? await db.transaction.findMany({ where: { id: { in: transactionIds } }, include: { outlet: true, order: true } }) : [];
  const walletIds = events.filter(event => event.entityType === "walletLedger").map(event => event.entityId);
  const walletEntries = walletIds.length ? await db.walletLedgerEntry.findMany({ where: { id: { in: walletIds } } }) : [];
  const orderReferences = Array.from(new Set([...events.filter(event => event.entityType === "order").map(event => event.entityId), ...transactions.map(item => item.order.reference), ...overrides.map(item => item.transaction.order.reference), ...walletEntries.map(item => item.orderReference).filter((value): value is string => Boolean(value)), ...operaAttempts.map(item => item.orderReference), ...sageSyncs.map(item => item.sourceOrderReference)]));
  const orders = orderReferences.length ? await db.order.findMany({ where: { reference: { in: orderReferences } }, include: { outlet: true, transaction: true } }) : [];
  const userMap = new Map(options.users.map(user => [user.id, user]));
  const orderMap = new Map(orders.map(order => [order.reference, order])), transactionMap = new Map(transactions.map(transaction => [transaction.id, transaction])), overrideMap = new Map(overrides.map(item => [item.id, item])), walletMap = new Map(walletEntries.map(entry => [entry.id, entry])), operaMap = new Map(operaAttempts.map(item => [item.id, item])), sageMap = new Map(sageSyncs.map(item => [item.id, item])), outletOptionMap = new Map(options.outlets.map(item => [item.id, item.label]));

  return {
    generatedAt: new Date().toISOString(), filters,
    options: { employees: options.employees, actions: options.actions, outlets: options.outlets },
    summary: { total: totalItems, orderStatusChanges: actionGroups.find(row => row.action === "order.status_changed")?._count || 0, overrideRequests: actionGroups.find(row => row.action === "override.requested")?._count || 0, actionCounts: actionGroups.map(row => ({ action: row.action, count: row._count })).sort((a, b) => b.count - a.count || a.action.localeCompare(b.action)) },
    pagination: { page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) },
    events: events.map(event => {
      const linkedOverride = overrideMap.get(event.entityType === "override" ? event.entityId : event.requestId || "");
      const linkedAttempt = operaMap.get(event.entityType === "operaRoomCharge" ? event.entityId : "");
      const linkedSage = sageMap.get(event.entityType === "sageAccountingSync" ? event.entityId : "");
      const linkedTransaction = transactionMap.get(event.entityType === "transaction" ? event.entityId : "") || linkedOverride?.transaction || (linkedAttempt?.transactionId ? transactionMap.get(linkedAttempt.transactionId) : undefined) || (linkedSage ? transactionMap.get(linkedSage.sourceTransactionId) : undefined);
      const ledger = walletMap.get(event.entityType === "walletLedger" ? event.entityId : "");
      const linkedOrder = orderMap.get(event.entityType === "order" ? event.entityId : "") || linkedTransaction?.order || (ledger?.orderReference ? orderMap.get(ledger.orderReference) : undefined) || (linkedAttempt ? orderMap.get(linkedAttempt.orderReference) : undefined) || (linkedSage ? orderMap.get(linkedSage.sourceOrderReference) : undefined);
      const enrichedOrder = linkedOrder ? orderMap.get(linkedOrder.reference) : undefined;
      const outlet = linkedTransaction?.outlet || enrichedOrder?.outlet;
      const attemptOutletName = linkedAttempt ? outletOptionMap.get(linkedAttempt.outletId) : linkedSage ? outletOptionMap.get(linkedSage.outletId) : undefined;
      const actor = userMap.get(event.actorId);
      return {
        id: event.id, timestamp: event.createdAt.toISOString(), actorId: event.actorId, actorName: actor?.name || event.actorId, actorRole: event.actorRole,
        action: event.action, entityType: event.entityType, entityId: event.entityId, requestId: event.requestId,
        outletId: outlet?.id || linkedAttempt?.outletId || linkedSage?.outletId || null, outletName: outlet?.name || attemptOutletName || null, orderReference: linkedOrder?.reference || linkedAttempt?.orderReference || linkedSage?.sourceOrderReference || null,
        transactionId: linkedTransaction?.id || enrichedOrder?.transaction?.id || linkedAttempt?.transactionId || linkedSage?.sourceTransactionId || null, overrideId: linkedOverride?.id || null,
        beforeValue: parseJson(event.beforeJson), afterValue: parseJson(event.afterJson),
        eventDetails: linkedOverride ? { requestedAction: linkedOverride.action, requestReason: linkedOverride.reason, requestStatus: linkedOverride.status, proposedAmount: linkedOverride.proposedAmount, decisionReason: linkedOverride.decisionReason } : linkedAttempt ? { verificationStatus: linkedAttempt.verificationStatus, postingStatus: linkedAttempt.postingStatus, postingReference: linkedAttempt.postingReference, reconciliationState: linkedAttempt.reconciliationState } : linkedSage ? { syncStatus: linkedSage.syncStatus, postingReference: linkedSage.postingReference, reconciliationState: linkedSage.reconciliationState, postingCategory: linkedSage.postingCategory, mappingVersion: linkedSage.mappingVersion } : null,
      };
    }),
    limitations: ["Audit events do not store IP address, device, session, or a general metadata payload.", "Outlet is resolved from linked orders, transactions, overrides or wallet purchases; unrelated events show Unavailable.", "Actor display names are resolved from DemoUser when present; system or guest actors retain their recorded actor ID."],
  };
}

export async function getOverrideReport(input: AuditQueryInput = {}, db: AuditDb = prisma): Promise<OverrideReport> {
  const period = dates(input);
  const filters = { from: period.from, to: period.to, employee: text(input.employee), supervisor: text(input.supervisor), status: text(input.status), requestedAction: text(input.requestedAction), outlet: text(input.outlet), reference: searchText(input.reference) };
  const page = pageNumber(input.page, 1, 100000, "Page"), pageSize = pageNumber(input.pageSize, 12, 100, "Page size");
  const [options, statusRows, actionRows, requesterRows, decisionRows] = await Promise.all([
    commonOptions(db),
    db.overrideRequest.findMany({ distinct: ["status"], select: { status: true } }),
    db.overrideRequest.findMany({ distinct: ["action"], select: { action: true } }),
    db.overrideRequest.findMany({ distinct: ["actorId"], select: { actorId: true } }),
    db.overrideRequest.findMany({ where: { decisionActorId: { not: null } }, distinct: ["decisionActorId"], select: { decisionActorId: true } }),
  ]);
  const userMap = new Map(options.users.map(user => [user.id, user]));
  const employees = requesterRows.map(row => ({ id: row.actorId, label: userMap.get(row.actorId)?.name || row.actorId, role: userMap.get(row.actorId)?.role || "Unavailable" })).sort((a, b) => a.label.localeCompare(b.label));
  const supervisorIds = Array.from(new Set([...options.users.filter(user => user.role === "supervisor").map(user => user.id), ...decisionRows.map(row => row.decisionActorId).filter((value): value is string => Boolean(value))]));
  const supervisors = supervisorIds.map(id => ({ id, label: userMap.get(id)?.name || id, role: userMap.get(id)?.role || "Unavailable" })).sort((a, b) => a.label.localeCompare(b.label));
  const statuses = statusRows.map(row => row.status).sort(), actions = actionRows.map(row => row.action).sort();
  validateChoice(filters.employee, employees.map(item => item.id), "Select a valid requesting employee.");
  validateChoice(filters.supervisor, supervisors.map(item => item.id), "Select a valid deciding supervisor.");
  validateChoice(filters.status, statuses, "Select a valid override status.");
  validateChoice(filters.requestedAction, actions, "Select a valid requested action.");
  validateChoice(filters.outlet, options.outlets.map(item => item.id), "Select a valid outlet.");
  const and: Prisma.OverrideRequestWhereInput[] = [];
  if (period.range) and.push({ createdAt: period.range });
  if (filters.employee) and.push({ actorId: filters.employee });
  if (filters.supervisor) and.push({ decisionActorId: filters.supervisor });
  if (filters.status) and.push({ status: filters.status });
  if (filters.requestedAction) and.push({ action: filters.requestedAction });
  if (filters.outlet) and.push({ transaction: { outletId: filters.outlet } });
  if (filters.reference) and.push({ OR: [{ id: { contains: filters.reference } }, { transactionId: { contains: filters.reference } }, { transaction: { order: { reference: { contains: filters.reference } } } }] });
  const where: Prisma.OverrideRequestWhereInput = and.length ? { AND: and } : {};
  const [totalItems, rows, grouped] = await Promise.all([
    db.overrideRequest.count({ where }),
    db.overrideRequest.findMany({ where, include: { transaction: { include: { outlet: true, order: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    db.overrideRequest.groupBy({ by: ["status"], where, _count: true }),
  ]);
  const ids = rows.map(row => row.id), transactionIds = rows.map(row => row.transactionId);
  const relatedAudits = ids.length ? await db.auditEvent.findMany({ where: { OR: [{ requestId: { in: ids } }, { entityType: "override", entityId: { in: ids } }, { action: "transaction.adjusted", entityType: "transaction", entityId: { in: transactionIds } }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) : [];
  const count = (status: string) => grouped.find(row => row.status === status)?._count || 0;
  return {
    generatedAt: new Date().toISOString(), filters,
    options: { employees, supervisors, statuses, actions, outlets: options.outlets },
    summary: { total: totalItems, pending: count("pending"), approved: count("approved"), rejected: count("rejected") },
    pagination: { page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) },
    overrides: rows.map(row => {
      const audits = relatedAudits.filter(event => event.requestId === row.id || (event.entityType === "override" && event.entityId === row.id));
      const requestAudits = audits.filter(event => event.action === "override.requested");
      const decisionAudits = audits.filter(event => event.action === `override.${row.status}`);
      const adjustmentAudits = audits.filter(event => event.action === "transaction.adjusted" && event.requestId === row.id);
      const adjustment = parseJson(row.transaction.adjustmentJson);
      const adjustmentReference = adjustment && typeof adjustment === "object" && "reference" in adjustment ? adjustment.reference : null;
      const requester = userMap.get(row.actorId), supervisor = row.decisionActorId ? userMap.get(row.decisionActorId) : null;
      return {
        id: row.id, transactionId: row.transactionId, orderReference: row.transaction.order.reference,
        outletId: row.transaction.outlet.id, outletName: row.transaction.outlet.name,
        requesterId: row.actorId, requesterName: requester?.name || row.actorId, requesterRole: requester?.role || "Unavailable",
        requestedAction: row.action, originalAmount: row.transaction.amount, proposedAmount: row.proposedAmount,
        proposedNetAmount: row.action === "discount" && row.proposedAmount !== null ? Math.max(0, row.transaction.amount - row.proposedAmount) : null,
        requestReason: row.reason, status: row.status, decidingSupervisorId: row.decisionActorId,
        decidingSupervisorName: supervisor?.name || row.decisionActorId, assignedSupervisorName: null,
        decisionReason: row.decisionReason, requestedAt: row.createdAt.toISOString(), decidedAt: row.decidedAt?.toISOString() || null,
        transactionStatus: row.transaction.status, appliedAdjustment: adjustment,
        adjustmentAppliedFromThisRequest: adjustmentReference === row.id,
        relatedAuditEvents: audits.map(event => ({ id: event.id, action: event.action, actorId: event.actorId, actorName: userMap.get(event.actorId)?.name || event.actorId, actorRole: event.actorRole, timestamp: event.createdAt.toISOString(), entityType: event.entityType, entityId: event.entityId, beforeValue: parseJson(event.beforeJson), afterValue: parseJson(event.afterJson) })),
        integrity: { requestAuditCount: requestAudits.length, decisionAuditCount: decisionAudits.length, adjustmentAuditCount: adjustmentAudits.length, duplicateSuccessfulAdjustments: adjustmentAudits.length > 1 },
      };
    }),
    limitations: ["Override assignment is not recorded; only the deciding supervisor is available after a decision.", "A void request does not store a proposed monetary value.", "Related audit events are linked through requestId, override entity ID and transaction adjustment references."],
  };
}
