import type { Prisma, PrismaClient } from "@prisma/client";
import { maskRoomReference } from "@/lib/opera-room-charge";
import { prisma } from "@/lib/prisma";

type MonitoringDb = Pick<PrismaClient, "operaRoomChargeAttempt" | "auditEvent" | "demoUser" | "outlet">;
type Input = { from?: string | null; to?: string | null; postingStatus?: string | null; verificationStatus?: string | null; reconciliationState?: string | null; outlet?: string | null; reference?: string | null; page?: string | null; pageSize?: string | null };
type Option = { id: string; label: string };
export class OperaMonitoringInputError extends Error {}
export type OperaMonitoringReport = {
  generatedAt: string;
  filters: { from: string | null; to: string | null; postingStatus: string | null; verificationStatus: string | null; reconciliationState: string | null; outlet: string | null; reference: string | null };
  options: { postingStatuses: Option[]; verificationStatuses: Option[]; reconciliationStates: Option[]; outlets: Option[] };
  summary: { total: number; settled: number; rejected: number; unavailable: number; uncertain: number; pendingReconciliation: number };
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  attempts: Array<{
    id: string; orderReference: string; linkedOrderId: string | null; linkedTransactionId: string | null;
    roomReferenceMasked: string; guestNameMasked: string; outletId: string; outletName: string; amount: number;
    verificationStatus: string; postingStatus: string; postingReference: string | null; reconciliationState: string;
    failureReason: string | null; scenario: string | null; attemptCount: number; initiatedBy: string; initiatedByName: string;
    attemptTimestamp: string; updatedAt: string; lastCheckedAt: string | null; canReconcile: boolean; canRetry: false;
    audits: Array<{ id: string; action: string; actorId: string; actorName: string; actorRole: string; timestamp: string; before: unknown; after: unknown }>;
  }>;
  limitations: string[];
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function text(value?: string | null) { return value?.trim() || null; }
function parse(value: string | null): unknown { if (!value) return null; try { return JSON.parse(value) as unknown; } catch { return { unavailable: "Stored JSON could not be parsed." }; } }
function validDate(value: string) { return datePattern.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
function pageValue(raw: string | null | undefined, fallback: number, maximum: number, label: string) {
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new OperaMonitoringInputError(`${label} must be a positive integer.`);
  const parsed = Number(raw);
  if (parsed < 1 || parsed > maximum) throw new OperaMonitoringInputError(`${label} must be between 1 and ${maximum}.`);
  return parsed;
}
function options(rows: Array<Record<string, string>>, key: string) {
  return rows.map(row => row[key]).filter(Boolean).sort().map(id => ({ id, label: id.replaceAll("_", " ") }));
}
function validate(selected: string | null, available: Option[], message: string) {
  if (selected && !available.some(option => option.id === selected)) throw new OperaMonitoringInputError(message);
}

export async function getOperaMonitoringReport(input: Input = {}, db: MonitoringDb = prisma): Promise<OperaMonitoringReport> {
  const filters = { from: text(input.from), to: text(input.to), postingStatus: text(input.postingStatus), verificationStatus: text(input.verificationStatus), reconciliationState: text(input.reconciliationState), outlet: text(input.outlet), reference: text(input.reference) };
  if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to))) throw new OperaMonitoringInputError("Dates must use a valid YYYY-MM-DD calendar date.");
  if (filters.from && filters.to && filters.from > filters.to) throw new OperaMonitoringInputError("End date cannot be before start date.");
  if (filters.reference && filters.reference.length > 100) throw new OperaMonitoringInputError("Reference search cannot exceed 100 characters.");
  const page = pageValue(input.page, 1, 100000, "Page"), pageSize = pageValue(input.pageSize, 12, 100, "Page size");
  const [postingRows, verificationRows, reconciliationRows, outlets] = await Promise.all([
    db.operaRoomChargeAttempt.findMany({ distinct: ["postingStatus"], select: { postingStatus: true } }),
    db.operaRoomChargeAttempt.findMany({ distinct: ["verificationStatus"], select: { verificationStatus: true } }),
    db.operaRoomChargeAttempt.findMany({ distinct: ["reconciliationState"], select: { reconciliationState: true } }),
    db.outlet.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const available = {
    postingStatuses: options(postingRows, "postingStatus"), verificationStatuses: options(verificationRows, "verificationStatus"),
    reconciliationStates: options(reconciliationRows, "reconciliationState"), outlets: outlets.map(outlet => ({ id: outlet.id, label: outlet.name })),
  };
  validate(filters.postingStatus, available.postingStatuses, "Select a valid posting status.");
  validate(filters.verificationStatus, available.verificationStatuses, "Select a valid verification status.");
  validate(filters.reconciliationState, available.reconciliationStates, "Select a valid reconciliation state.");
  validate(filters.outlet, available.outlets, "Select a valid outlet.");
  const and: Prisma.OperaRoomChargeAttemptWhereInput[] = [];
  if (filters.from || filters.to) and.push({ createdAt: { ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}), ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}) } });
  if (filters.postingStatus) and.push({ postingStatus: filters.postingStatus });
  if (filters.verificationStatus) and.push({ verificationStatus: filters.verificationStatus });
  if (filters.reconciliationState) and.push({ reconciliationState: filters.reconciliationState });
  if (filters.outlet) and.push({ outletId: filters.outlet });
  if (filters.reference) and.push({ OR: [{ id: { contains: filters.reference } }, { orderReference: { contains: filters.reference } }, { postingReference: { contains: filters.reference } }, { transactionId: { contains: filters.reference } }] });
  const where: Prisma.OperaRoomChargeAttemptWhereInput = and.length ? { AND: and } : {};
  const [totalItems, rows, grouped, reconciliationGrouped] = await Promise.all([
    db.operaRoomChargeAttempt.count({ where }),
    db.operaRoomChargeAttempt.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    db.operaRoomChargeAttempt.groupBy({ by: ["postingStatus"], where, _count: true }),
    db.operaRoomChargeAttempt.groupBy({ by: ["reconciliationState"], where, _count: true }),
  ]);
  const ids = rows.map(row => row.id);
  const [audits, users] = await Promise.all([
    ids.length ? db.auditEvent.findMany({ where: { entityType: "operaRoomCharge", entityId: { in: ids } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) : [],
    db.demoUser.findMany({ select: { id: true, name: true } }),
  ]);
  const userMap = new Map(users.map(user => [user.id, user.name])), outletMap = new Map(outlets.map(outlet => [outlet.id, outlet.name]));
  const count = (status: string) => grouped.find(row => row.postingStatus === status)?._count || 0;
  return {
    generatedAt: new Date().toISOString(), filters, options: available,
    summary: { total: totalItems, settled: count("settled"), rejected: count("rejected"), unavailable: count("unavailable"), uncertain: count("uncertain"), pendingReconciliation: reconciliationGrouped.find(row => row.reconciliationState === "pending")?._count || 0 },
    pagination: { page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) },
    attempts: rows.map(row => ({
      id: row.id, orderReference: row.orderReference, linkedOrderId: row.orderId, linkedTransactionId: row.transactionId,
      roomReferenceMasked: maskRoomReference(row.roomReference), guestNameMasked: row.guestNameMasked,
      outletId: row.outletId, outletName: outletMap.get(row.outletId) || row.outletId, amount: row.amount,
      verificationStatus: row.verificationStatus, postingStatus: row.postingStatus, postingReference: row.postingReference,
      reconciliationState: row.reconciliationState, failureReason: row.failureReason, scenario: row.scenario,
      attemptCount: row.attemptCount, initiatedBy: row.initiatedBy, initiatedByName: userMap.get(row.initiatedBy) || row.initiatedBy,
      attemptTimestamp: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), lastCheckedAt: row.lastCheckedAt?.toISOString() || null,
      canReconcile: row.postingStatus === "uncertain" && row.reconciliationState === "pending" && Boolean(row.postingReference), canRetry: false,
      audits: audits.filter(event => event.entityId === row.id).map(event => ({ id: event.id, action: event.action, actorId: event.actorId, actorName: userMap.get(event.actorId) || event.actorId, actorRole: event.actorRole, timestamp: event.createdAt.toISOString(), before: parse(event.beforeJson), after: parse(event.afterJson) })),
    })),
    limitations: ["All room, guest, folio and posting references are fictional demo data.", "This adapter does not claim compatibility with an OPERA edition or endpoint contract.", "Guest verification secrets are not returned by monitoring APIs; room and guest displays are masked.", "Unavailable and uncertain postings are excluded from settled sales. Only uncertain accepted postings expose deterministic reconciliation."],
  };
}
